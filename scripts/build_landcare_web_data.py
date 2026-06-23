from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "prototype" / "source" / "app_ready_parcels_monthly.geojson"
DEFAULT_OUTPUT = ROOT / "docs" / "landcare" / "data"

POWERBI_ASSIGNED = 1214
POWERBI_RETURNED = 142
POWERBI_URA_OWNED = 1120
POWERBI_PLB_OWNED = 28
POWERBI_YEARLY_LIMIT = 775000.00
POWERBI_TOTAL_SPENT = 343523.44
POWERBI_QUARTER_SPENT = 154944.44


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
    if props.get("ownership_type") != "URA":
        return None
    props = dict(props)
    props["assigned_flag"] = truthy(props.get("assigned_flag")) or True
    props["returned_flag"] = truthy(props.get("returned_flag"))
    props["period_month"] = str(props.get("period_month") or "")[:7]
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
        raise SystemExit("No URA-owned LandCare features found in source export.")

    months = sorted({feature["properties"]["period_month"] for feature in features})
    latest_month = months[-1]
    latest_features = [
        feature for feature in features if feature["properties"].get("period_month") == latest_month
    ]
    monthly_metrics, contractor_monthly = summarize_features(features)
    latest_metric = next(row for row in monthly_metrics if row["period_month"] == latest_month)
    latest_summary = month_summary(features, latest_month)
    generated_on = date.today().isoformat()

    source_note = (
        "PostgreSQL export filtered to URA-owned LandCare parcels across all available months. "
        f"Assignments updated through {metadata.get('latest_assignment_period')}; "
        f"survey completion shown through {metadata.get('latest_survey_period')}."
    )
    common_summary = {
        "latest_month": latest_month,
        "available_months": months,
        "latest_assignment_period": metadata.get("latest_assignment_period"),
        "latest_survey_period": metadata.get("latest_survey_period"),
        "source_note": source_note,
        "generated_on": generated_on,
        "geometry_mode": metadata.get("geometry_mode", "postgres_readonly_export"),
        "source_tables": metadata.get("source_tables", []),
        "owner_match_note": metadata.get("owner_match_note"),
        "missing_geometry_rows": metadata.get("missing_geometry_rows"),
        "latest_comparable_month": metadata.get("latest_comparable_month"),
        "ownership_scope": "URA owned only",
        "all_month_feature_count": len(features),
    }

    latest_month_summary = {
        **common_summary,
        **latest_summary,
    }
    kpi_summary = {
        **common_summary,
        "powerbi_comparison": {
            "dashboard_assigned_count": POWERBI_ASSIGNED,
            "dashboard_returned_count": POWERBI_RETURNED,
            "dashboard_ura_owned_count": POWERBI_URA_OWNED,
            "dashboard_plb_owned_count": POWERBI_PLB_OWNED,
            "projected_yearly_limit": POWERBI_YEARLY_LIMIT,
            "total_amount_spent": POWERBI_TOTAL_SPENT,
            "quarterly_amount_spent": POWERBI_QUARTER_SPENT,
            "sql_export_assigned_count": latest_metric["assigned_total"],
            "sql_export_returned_count": latest_metric["returned_assigned"],
            "assigned_difference": latest_metric["assigned_total"] - POWERBI_ASSIGNED,
            "returned_difference": latest_metric["returned_assigned"] - POWERBI_RETURNED,
            "filter_note": "Power BI landing page values captured June 9, 2026; web app is URA-owned scope only.",
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
    write_json(output_dir / "kpi_summary.json", kpi_summary)
    write_json(
        output_dir / "refresh_manifest.json",
        {
            "generated_on": generated_on,
            "source_file": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else str(source),
            "output_dir": str(output_dir.relative_to(ROOT)) if output_dir.is_relative_to(ROOT) else str(output_dir),
            "ownership_scope": "URA owned only",
            "available_months": months,
            "latest_month": latest_month,
            "all_month_feature_count": len(features),
            "latest_month_feature_count": len(latest_features),
            "latest_assignment_period": metadata.get("latest_assignment_period"),
            "latest_survey_period": metadata.get("latest_survey_period"),
            "note": "Generated from existing PostgreSQL export artifact; not a direct database pull.",
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
