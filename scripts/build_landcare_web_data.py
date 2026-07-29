from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "prototype" / "source" / "app_ready_parcels_monthly.geojson"
DEFAULT_OUTPUT = ROOT / "docs" / "landcare" / "data"

def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8", newline="\n")


def truthy(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "t", "yes", "y"}


def normalize_feature(feature: dict[str, object]) -> dict[str, object] | None:
    props = feature.get("properties")
    geometry = feature.get("geometry")
    if not isinstance(props, dict) or not geometry:
        return None
    ownership_value = str(props.get("ownership_group") or props.get("ownership_type") or "").strip()
    ownership_group = (
        "URA" if ownership_value in {"URA", "URA Owned"}
        else "PLB" if ownership_value in {"PLB", "PLB Owned", "Pittsburgh Land Bank"}
        else "Other"
    )
    if ownership_group not in {"URA", "PLB"}:
        return None
    props = dict(props)
    props["assigned_flag"] = truthy(props.get("assigned_flag")) or True
    props["returned_flag"] = truthy(props.get("returned_flag"))
    props["period_month"] = str(props.get("period_month") or "")[:7]
    props["ownership_group"] = ownership_group
    props["block_lot"] = str(props.get("block_lot") or "")
    props["completion_status"] = props.get("completion_status") or (
        "returned" if props["returned_flag"] else "missing"
    )
    return {"type": "Feature", "properties": props, "geometry": geometry}


def summarize_features(features: list[dict[str, object]]) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    month_totals: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: {
            "active_assigned": set(),
            "total_assigned": set(),
            "active_returned": set(),
            "returned": set(),
        }
    )
    month_org: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(
        lambda: {"assigned": set(), "returned": set()}
    )

    for feature in features:
        props = feature["properties"]
        assert isinstance(props, dict)
        month = str(props.get("period_month") or "")
        parcel_key = str(props.get("parcel_key") or "")
        organization = str(props.get("organization") or "Unassigned")
        level = str(props.get("maintenance_level") or "")
        returned = truthy(props.get("returned_flag"))
        if not month or not parcel_key:
            continue

        month_totals[month]["total_assigned"].add(parcel_key)
        if level == "Active":
            month_totals[month]["active_assigned"].add(parcel_key)
            month_org[(month, organization)]["assigned"].add(parcel_key)
            if returned:
                month_totals[month]["active_returned"].add(parcel_key)
                month_org[(month, organization)]["returned"].add(parcel_key)
        if returned:
            month_totals[month]["returned"].add(parcel_key)

    monthly_metrics = []
    for month in sorted(month_totals):
        active = len(month_totals[month]["active_assigned"])
        total = len(month_totals[month]["total_assigned"])
        returned = len(month_totals[month]["active_returned"])
        monthly_metrics.append(
            {
                "period_month": month,
                "assigned_active": active,
                "assigned_total": total,
                "returned_assigned": returned,
                "active_completion_rate_pct": round(100 * returned / active, 1) if active else 0,
                "blended_completion_rate_pct": round(100 * returned / total, 1) if total else 0,
                "survey_rows_raw": len(month_totals[month]["returned"]),
            }
        )

    contractor_monthly = []
    for (month, organization), values in sorted(month_org.items()):
        assigned = len(values["assigned"])
        returned = len(values["returned"])
        contractor_monthly.append(
            {
                "period_month": month,
                "organization": organization,
                "assigned_parcel_keys": assigned,
                "returned_assigned_parcel_keys": returned,
                "completion_rate_pct": round(100 * returned / assigned, 1) if assigned else 0,
            }
        )

    return monthly_metrics, contractor_monthly


def square_feet(props: dict[str, object]) -> float:
    value = props.get("parcel_sqft") or props.get("sq_footage")
    try:
        if value not in (None, ""):
            return float(value)
        return float(props.get("acreage") or 0) * 43560
    except (TypeError, ValueError):
        return 0.0


def quarter_key(month: str) -> str:
    year, raw_month = month.split("-", 1)
    return f"{year}-Q{(int(raw_month) - 1) // 3 + 1}"


def build_quarterly_outputs(features: list[dict[str, object]]) -> tuple[dict[str, object], dict[str, object]]:
    """Build public quarterly reporting and area facts at parcel-period grain.

    Baselines deliberately remain unavailable until the approved Power BI import
    is supplied; this prevents a current-contract snapshot being misrepresented
    as the contractual opening square footage.
    """
    by_month: dict[str, list[dict[str, object]]] = defaultdict(list)
    for feature in features:
        props = feature["properties"]
        assert isinstance(props, dict)
        month = str(props.get("period_month") or "")
        if month:
            by_month[month].append(feature)

    quarterly: dict[str, dict[str, object]] = {}
    compliance_rows: list[dict[str, object]] = []
    for month, month_features in sorted(by_month.items()):
        quarter = quarter_key(month)
        target = quarterly.setdefault(quarter, {"quarter": quarter, "months": [], "distinct_parcels": set(), "contractors": set()})
        active, returned, request_only, all_parcels = set(), set(), set(), set()
        owner_parcels: dict[str, set[str]] = defaultdict(set)
        owner_sqft: dict[str, float] = defaultdict(float)
        area_available = False
        contractor_sqft: dict[str, dict[str, object]] = {}
        seen_owner_parcels: set[tuple[str, str]] = set()
        for feature in month_features:
            props = feature["properties"]
            assert isinstance(props, dict)
            parcel = str(props.get("parcel_key") or "")
            if not parcel:
                continue
            owner = str(props.get("ownership_group") or "Other")
            contractor = str(props.get("organization") or "Unassigned")
            level = str(props.get("maintenance_level") or "")
            all_parcels.add(parcel)
            target["distinct_parcels"].add(parcel)
            target["contractors"].add(contractor)
            owner_parcels[owner].add(parcel)
            if (owner, parcel) not in seen_owner_parcels:
                parcel_area = square_feet(props)
                area_available = area_available or any(props.get(key) not in (None, "") for key in ("parcel_sqft", "sq_footage", "acreage"))
                owner_sqft[owner] += parcel_area
                seen_owner_parcels.add((owner, parcel))
            contractor_row = contractor_sqft.setdefault(contractor, {"organization": contractor, "assigned_sqft": 0.0, "parcels": set()})
            if parcel not in contractor_row["parcels"]:
                contractor_row["assigned_sqft"] += square_feet(props)
                contractor_row["parcels"].add(parcel)
            if level == "Active":
                active.add(parcel)
                if truthy(props.get("returned_flag")):
                    returned.add(parcel)
            elif level == "Request Only":
                request_only.add(parcel)
        monthly = {
            "period_month": month,
            "active_assignments": len(active),
            "returned_assignments": len(returned),
            "open_assignments": max(len(active) - len(returned), 0),
            "request_only_assignments": len(request_only),
            "assigned_parcels": len(all_parcels),
            "completion_rate_pct": round(100 * len(returned) / len(active), 1) if active else 0,
            "owner_breakdown": [
                {"ownership_group": owner, "parcels": len(owner_parcels[owner]), "sq_footage": round(owner_sqft[owner], 2) if area_available else None}
                for owner in sorted(owner_parcels)
            ],
        }
        target["months"].append(monthly)
        for row in contractor_sqft.values():
            assigned_sqft = round(float(row["assigned_sqft"]), 2) if area_available else None
            compliance_rows.append({
                "period_month": month,
                "organization": row["organization"],
                "assigned_sqft": assigned_sqft,
                "assigned_parcels": len(row["parcels"]),
                "baseline_sqft": None,
                "lower_limit_sqft": None,
                "upper_limit_sqft": None,
                "variance_pct": None,
                "compliance_status": "baseline_unavailable",
            })

    quarters = []
    for key, value in sorted(quarterly.items()):
        months = value["months"]
        active = sum(int(row["active_assignments"]) for row in months)
        returned = sum(int(row["returned_assignments"]) for row in months)
        request_only = sum(int(row["request_only_assignments"]) for row in months)
        owner_latest = months[-1].get("owner_breakdown", []) if months else []
        quarters.append({
            "quarter": key,
            "through_month": months[-1]["period_month"] if months else None,
            "is_complete": len(months) == 3,
            "active_assignments": active,
            "returned_assignments": returned,
            "open_assignments": max(active - returned, 0),
            "request_only_assignments": request_only,
            "distinct_parcels": len(value["distinct_parcels"]),
            "contractors": len(value["contractors"]),
            "completion_rate_pct": round(100 * returned / active, 1) if active else 0,
            "months": months,
            "owner_breakdown": owner_latest,
            "owner_responsibility_status": "unavailable",
        })
    return (
        {"metadata": {"source_status": "assignment_export", "baseline_source_status": "unavailable"}, "quarters": quarters},
        {"metadata": {"baseline_source": "Power BI contract baseline", "source_status": "unavailable"}, "rows": compliance_rows},
    )


def month_summary(features: list[dict[str, object]], month: str) -> dict[str, object]:
    month_features = [
        feature for feature in features if feature["properties"].get("period_month") == month
    ]
    contractor_counts: dict[str, set[str]] = defaultdict(set)
    contractor_returned: dict[str, set[str]] = defaultdict(set)
    status_counts: dict[str, set[str]] = defaultdict(set)
    level_counts: dict[str, set[str]] = defaultdict(set)
    ownership_counts: dict[str, set[str]] = defaultdict(set)

    for feature in month_features:
        props = feature["properties"]
        parcel_key = str(props.get("parcel_key") or "")
        organization = str(props.get("organization") or "Unassigned")
        status = str(props.get("completion_status") or "missing")
        level = str(props.get("maintenance_level") or "Unknown")
        ownership = str(props.get("ownership_type") or "Other or unknown")
        returned = truthy(props.get("returned_flag"))
        if not parcel_key:
            continue
        contractor_counts[organization].add(parcel_key)
        status_counts[status].add(parcel_key)
        level_counts[level].add(parcel_key)
        ownership_counts[ownership].add(parcel_key)
        if returned:
            contractor_returned[organization].add(parcel_key)

    return {
        "feature_count": len(month_features),
        "status_counts": {key: len(value) for key, value in sorted(status_counts.items())},
        "contractor_counts": {key: len(value) for key, value in sorted(contractor_counts.items())},
        "contractor_returned": {
            key: len(value) for key, value in sorted(contractor_returned.items())
        },
        "level_counts": {key: len(value) for key, value in sorted(level_counts.items())},
        "ownership_counts": {key: len(value) for key, value in sorted(ownership_counts.items())},
    }


def build_data(source: Path, output_dir: Path) -> None:
    source_geojson = json.loads(source.read_text(encoding="utf-8"))
    metadata = source_geojson.get("metadata") or {}
    features = [
        normalized
        for feature in source_geojson.get("features", [])
        if (normalized := normalize_feature(feature))
    ]
    if not features:
        raise SystemExit("No URA- or PLB-owned LandCare features found in source export.")

    months = sorted({feature["properties"]["period_month"] for feature in features})
    latest_month = months[-1]
    latest_features = [
        feature for feature in features if feature["properties"].get("period_month") == latest_month
    ]
    monthly_metrics, contractor_monthly = summarize_features(features)
    quarterly_metrics, area_compliance = build_quarterly_outputs(features)
    latest_metric = next(row for row in monthly_metrics if row["period_month"] == latest_month)
    latest_summary = month_summary(features, latest_month)
    generated_on = date.today().isoformat()
    ownership_counts: dict[str, set[str]] = defaultdict(set)
    missing_block_lot = set()
    for feature in features:
        props = feature["properties"]
        parcel_key = str(props.get("parcel_key") or "")
        ownership_counts[str(props.get("ownership_group") or "Other")].add(parcel_key)
        if not props.get("block_lot") and parcel_key:
            missing_block_lot.add(parcel_key)

    source_note = (
        "PostgreSQL export filtered to URA- and PLB-owned LandCare parcels across all available months. "
        f"Assignments updated through {metadata.get('latest_assignment_period')}; "
        f"survey completion shown through {metadata.get('latest_survey_period')}."
    )
    common_summary = {
        "latest_month": latest_month,
        "available_months": months,
        "latest_assignment_period": metadata.get("latest_assignment_period"),
        "latest_survey_period": metadata.get("latest_survey_period"),
        "survey_submission_count": metadata.get("survey_submission_count"),
        "survey_distinct_parcels": metadata.get("survey_distinct_parcels"),
        "source_note": source_note,
        "generated_on": generated_on,
        "geometry_mode": metadata.get("geometry_mode", "postgres_readonly_export"),
        "source_tables": metadata.get("source_tables", []),
        "owner_match_note": metadata.get("owner_match_note"),
        "missing_geometry_rows": metadata.get("missing_geometry_rows"),
        "latest_comparable_month": metadata.get("latest_comparable_month"),
        "ownership_scope": "URA and PLB owned",
        "all_month_feature_count": len(features),
        "ownership_counts": {key: len(value) for key, value in sorted(ownership_counts.items())},
        "missing_block_lot_parcel_count": len(missing_block_lot),
    }

    latest_month_summary = {
        **common_summary,
        **latest_summary,
    }
    kpi_summary = {
        **common_summary,
        "latest_month_metrics": latest_metric,
        "source_contract": {
            "current_universe": "ArcGIS gisdb_gis_epp_parcels_full FeatureServer filtered to URA Owned LandCare records.",
            "historical_assignments": (
                "PostgreSQL export from gis.regrid_bundle_assignments joined to "
                "Regrid returns and canonical Survey123 evidence polygons. "
                "URA-Data-Repository validates Survey123 against stable assignment IDs, "
                "then publishes only authoritative parcel polygons; invalid raw submissions remain in restricted QA. "
                "Bundle assignments are loaded monthly via bundle_assignment_creation.py and BundlesDriveToSQL.py."
            ),
            "budget_expenses": "Finance dashboard metrics are built separately from the LandCare budgeting workbook and published as finance_summary.json.",
        },
    }

    all_months_geojson = {
        "type": "FeatureCollection",
        "metadata": {**common_summary, "feature_count": len(features)},
        "features": features,
    }
    latest_geojson = {
        "type": "FeatureCollection",
        "metadata": {**common_summary, "feature_count": len(latest_features)},
        "features": latest_features,
    }

    write_json(output_dir / "all_months.geojson", all_months_geojson)
    write_json(output_dir / "latest_month.geojson", latest_geojson)
    write_json(output_dir / "latest_month_summary.json", latest_month_summary)
    write_json(output_dir / "monthly_metrics.json", monthly_metrics)
    write_json(output_dir / "contractor_monthly.json", contractor_monthly)
    write_json(output_dir / "quarterly_metrics.json", quarterly_metrics)
    write_json(output_dir / "area_compliance.json", area_compliance)
    write_json(output_dir / "kpi_summary.json", kpi_summary)
    write_json(
        output_dir / "refresh_manifest.json",
        {
            "generated_on": generated_on,
            "source_file": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
            "output_dir": str(output_dir.relative_to(ROOT)) if output_dir.is_relative_to(ROOT) else str(output_dir),
            "ownership_scope": "URA and PLB owned",
            "available_months": months,
            "latest_month": latest_month,
            "all_month_feature_count": len(features),
            "latest_month_feature_count": len(latest_features),
            "latest_assignment_period": metadata.get("latest_assignment_period"),
            "latest_survey_period": metadata.get("latest_survey_period"),
            "survey_submission_count": metadata.get("survey_submission_count"),
            "survey_distinct_parcels": metadata.get("survey_distinct_parcels"),
            "ownership_counts": common_summary["ownership_counts"],
            "missing_block_lot_parcel_count": common_summary["missing_block_lot_parcel_count"],
            "note": (
                f"Dashboard data refreshed for assignments through {metadata.get('latest_assignment_period')} "
                f"and survey completion through {metadata.get('latest_survey_period')}."
            ),
        },
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build LandCare web app data from an app-ready GeoJSON export.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    build_data(args.source, args.output_dir)
    print(f"Wrote LandCare web data to {args.output_dir}")


if __name__ == "__main__":
    main()
