from __future__ import annotations

import argparse
import csv
import json
import math
import random
from collections import defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROTOTYPE_DIR = ROOT / "prototype"
DATA_DIR = PROTOTYPE_DIR / "data"
SOURCE_DIR = PROTOTYPE_DIR / "source"
OUTPUTS_DIR = ROOT / "outputs" / "week-1-day-1"

CURRENT_ACTIVE_RETURNED = 142
CURRENT_SURVEY_ROWS = 149
POWERBI_ASSIGNED = 1214
POWERBI_RETURNED = 142
POWERBI_URA_OWNED = 1120
POWERBI_PLB_OWNED = 28
POWERBI_YEARLY_LIMIT = 775000.00
POWERBI_TOTAL_SPENT = 343523.44
POWERBI_QUARTER_SPENT = 154944.44
PITTSBURGH_CENTER = (40.4434, -79.9959)


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8", newline="\n")


def write_csv(path: Path, rows: list[dict[str, object]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def normalize_key(value: object) -> str:
    digits = "".join(char for char in str(value or "") if char.isdigit())
    return digits[-16:] if len(digits) >= 16 else digits


def clean_org(value: str) -> str:
    return value.replace(" Primary Contact", "").replace(" & LawnCare", "")


def parse_int(value: object, default: int = 0) -> int:
    try:
        return int(float(str(value)))
    except (TypeError, ValueError):
        return default


def load_baseline() -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, int]]:
    completion = read_csv(OUTPUTS_DIR / "completion_by_organization.csv")
    levels = read_csv(OUTPUTS_DIR / "completion_by_level.csv")
    periods = read_csv(OUTPUTS_DIR / "survey_periods.csv")

    contractor_base: dict[str, dict[str, object]] = {}
    request_only_total = 0
    for row in completion:
        org = clean_org(row["organization"])
        if org == "Unassigned":
            continue
        level = row["maintenance_level"]
        assigned = parse_int(row["assigned_parcel_keys"])
        returned = parse_int(row["returned_assigned_parcel_keys"])
        if level == "Active":
            contractor_base[org] = {
                "organization": org,
                "active_assigned": assigned,
                "current_returned": returned,
            }
        elif level == "Request Only":
            request_only_total += assigned
            contractor_base.setdefault(
                org,
                {"organization": org, "active_assigned": 0, "current_returned": 0},
            )
            contractor_base[org]["request_only_assigned"] = assigned

    active_total = 0
    active_returned = 0
    for row in levels:
        if row["maintenance_level"] == "Active":
            active_total = parse_int(row["assigned_parcel_keys"])
            active_returned = parse_int(row["returned_assigned_parcel_keys"])
        elif row["maintenance_level"] == "Request Only":
            request_only_total = parse_int(row["assigned_parcel_keys"])

    timeline = []
    for row in periods[:12]:
        month = row["period_date"][:7]
        survey_rows = parse_int(row["survey_rows"])
        matched_returned = round(survey_rows * (CURRENT_ACTIVE_RETURNED / CURRENT_SURVEY_ROWS))
        if month == "2026-04":
            matched_returned = active_returned
        timeline.append(
            {
                "period_month": month,
                "survey_rows": survey_rows,
                "returned_assigned": min(active_total, matched_returned),
            }
        )
    timeline.sort(key=lambda row: row["period_month"])

    totals = {
        "active_assigned": active_total,
        "request_only_assigned": request_only_total,
        "assigned_total": active_total + request_only_total,
        "active_returned": active_returned,
    }
    return list(contractor_base.values()), timeline, totals


def allocate_returns(contractors: list[dict[str, object]], target: int, latest: bool) -> dict[str, int]:
    if latest:
        return {str(row["organization"]): int(row["current_returned"]) for row in contractors}

    weights = {}
    for row in contractors:
        assigned = int(row["active_assigned"])
        current = int(row["current_returned"])
        weights[str(row["organization"])] = current + math.sqrt(max(assigned, 1)) * 0.18

    total_weight = sum(weights.values()) or 1
    allocation = {
        org: min(
            int(next(row for row in contractors if row["organization"] == org)["active_assigned"]),
            round(target * weight / total_weight),
        )
        for org, weight in weights.items()
    }

    delta = target - sum(allocation.values())
    ordered = sorted(
        contractors,
        key=lambda row: int(row["active_assigned"]) - allocation[str(row["organization"])],
        reverse=True,
    )
    while delta > 0:
        changed = False
        for row in ordered:
            org = str(row["organization"])
            if allocation[org] < int(row["active_assigned"]):
                allocation[org] += 1
                delta -= 1
                changed = True
                if delta == 0:
                    break
        if not changed:
            break
    return allocation


def contractor_monthly_rows(
    contractors: list[dict[str, object]],
    timeline: list[dict[str, object]],
) -> list[dict[str, object]]:
    rows = []
    latest_month = timeline[-1]["period_month"]
    for period in timeline:
        month = str(period["period_month"])
        allocation = allocate_returns(
            contractors,
            int(period["returned_assigned"]),
            latest=month == latest_month,
        )
        for contractor in contractors:
            org = str(contractor["organization"])
            assigned = int(contractor["active_assigned"])
            returned = allocation.get(org, 0)
            rows.append(
                {
                    "period_month": month,
                    "organization": org,
                    "assigned_parcel_keys": assigned,
                    "returned_assigned_parcel_keys": returned,
                    "completion_rate_pct": round(100 * returned / assigned, 1) if assigned else 0,
                }
            )
    return rows


def monthly_metrics(timeline: list[dict[str, object]], totals: dict[str, int]) -> list[dict[str, object]]:
    rows = []
    for period in timeline:
        returned = int(period["returned_assigned"])
        rows.append(
            {
                "period_month": period["period_month"],
                "assigned_active": totals["active_assigned"],
                "assigned_total": totals["assigned_total"],
                "returned_assigned": returned,
                "active_completion_rate_pct": round(100 * returned / totals["active_assigned"], 1),
                "blended_completion_rate_pct": round(100 * returned / totals["assigned_total"], 1),
                "survey_rows_raw": period["survey_rows"],
            }
        )
    return rows


def square_polygon(lat: float, lon: float, size: float = 0.0012) -> list[list[list[float]]]:
    return [
        [
            [lon - size, lat - size],
            [lon + size, lat - size],
            [lon + size, lat + size],
            [lon - size, lat + size],
            [lon - size, lat - size],
        ]
    ]


def contractor_centers(contractors: list[dict[str, object]]) -> dict[str, tuple[float, float]]:
    center_lat, center_lon = PITTSBURGH_CENTER
    centers = {}
    radius = 0.035
    for index, contractor in enumerate(sorted(contractors, key=lambda row: str(row["organization"]))):
        angle = 2 * math.pi * index / max(len(contractors), 1)
        centers[str(contractor["organization"])] = (
            center_lat + math.sin(angle) * radius,
            center_lon + math.cos(angle) * radius,
        )
    return centers


def build_masked_geojson(
    contractors: list[dict[str, object]],
    contractor_monthly: list[dict[str, object]],
) -> dict[str, object]:
    random.seed(20260609)
    centers = contractor_centers(contractors)
    parcel_templates: dict[str, list[dict[str, object]]] = {}
    sequence = 1

    for contractor in contractors:
        org = str(contractor["organization"])
        active_assigned = int(contractor["active_assigned"])
        request_only = int(contractor.get("request_only_assigned", 0) or 0)
        sample_active = max(5, min(90, round(active_assigned / 4)))
        sample_request = min(12, max(0, round(request_only / 3)))
        base_lat, base_lon = centers[org]
        templates = []

        for index in range(sample_active + sample_request):
            row = index // 10
            col = index % 10
            jitter_lat = (random.random() - 0.5) * 0.001
            jitter_lon = (random.random() - 0.5) * 0.001
            lat = base_lat + row * 0.003 + jitter_lat
            lon = base_lon + col * 0.003 + jitter_lon
            is_request = index >= sample_active
            templates.append(
                {
                    "parcel_key": f"DEMO-{sequence:04d}",
                    "organization": org,
                    "maintenance_level": "Request Only" if is_request else "Active",
                    "geometry": {"type": "Polygon", "coordinates": square_polygon(lat, lon)},
                    "sample_index": index,
                    "sample_active_count": sample_active,
                }
            )
            sequence += 1
        parcel_templates[org] = templates

    returns_lookup = {
        (str(row["period_month"]), str(row["organization"])): (
            int(row["returned_assigned_parcel_keys"]),
            int(row["assigned_parcel_keys"]),
        )
        for row in contractor_monthly
    }

    features = []
    for row in contractor_monthly:
        month = str(row["period_month"])
        org = str(row["organization"])
        returned, assigned = returns_lookup[(month, org)]
        templates = parcel_templates[org]
        active_templates = [item for item in templates if item["maintenance_level"] == "Active"]
        returned_sample = round(len(active_templates) * returned / assigned) if assigned else 0

        for template in templates:
            level = str(template["maintenance_level"])
            if level == "Request Only":
                status = "request_only"
                returned_flag = False
            elif int(template["sample_index"]) < returned_sample:
                status = "returned"
                returned_flag = True
            else:
                stable_key = f"{template['parcel_key']}-{month}"
                risk_bucket = (sum(ord(char) for char in stable_key) % 29) == 0
                status = "ownership_risk" if risk_bucket else "missing"
                returned_flag = False

            features.append(
                {
                    "type": "Feature",
                    "properties": {
                        "parcel_key": template["parcel_key"],
                        "period_month": month,
                        "organization": org,
                        "maintenance_level": level,
                        "assigned_flag": True,
                        "returned_flag": returned_flag,
                        "completion_status": status,
                        "masked_geometry": True,
                    },
                    "geometry": template["geometry"],
                }
            )

    return {
        "type": "FeatureCollection",
        "metadata": {
            "geometry_mode": "masked_demo",
            "generated_on": date.today().isoformat(),
            "note": "Masked demo geometry generated because current Week 1 exports do not include parcel geometry.",
        },
        "features": features,
    }


def validate_outputs(
    geojson: dict[str, object],
    metrics: list[dict[str, object]],
    strict_baseline: bool = False,
) -> None:
    required = {
        "parcel_key",
        "period_month",
        "organization",
        "maintenance_level",
        "assigned_flag",
        "returned_flag",
        "completion_status",
    }
    if not geojson.get("features"):
        raise ValueError("GeoJSON has no features.")
    for feature in geojson["features"]:
        missing = required - set(feature["properties"])
        if missing:
            raise ValueError(f"Missing GeoJSON properties: {sorted(missing)}")
        if not feature.get("geometry"):
            raise ValueError("Feature is missing geometry.")

    if not metrics:
        raise ValueError("Monthly metrics are empty.")

    if strict_baseline:
        latest = metrics[-1]
        if latest["returned_assigned"] != CURRENT_ACTIVE_RETURNED:
            raise ValueError("Latest returned count does not match Day 1 baseline.")
        if round(float(latest["active_completion_rate_pct"]), 1) != 14.0:
            raise ValueError("Latest Active-only completion does not match Day 1 baseline.")


def is_app_ready_geojson(payload: dict[str, object]) -> bool:
    required = {
        "parcel_key",
        "period_month",
        "organization",
        "maintenance_level",
        "assigned_flag",
        "returned_flag",
        "completion_status",
    }
    features = payload.get("features", [])
    if not isinstance(features, list) or not features:
        return False
    first = features[0]
    if not isinstance(first, dict):
        return False
    props = first.get("properties", {})
    return isinstance(props, dict) and required.issubset(props)


def load_app_ready_geojson(path: Path) -> dict[str, object]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not is_app_ready_geojson(payload):
        raise SystemExit(
            "GeoJSON is not app-ready. It must include parcel_key, period_month, "
            "organization, maintenance_level, assigned_flag, returned_flag, and completion_status."
        )
    payload.setdefault("metadata", {})
    payload["metadata"].setdefault("geometry_mode", "real_or_approved_export")
    payload["metadata"]["generated_on"] = date.today().isoformat()
    return payload


def load_geometry_features(path: Path) -> dict[str, dict[str, object]]:
    if not path.exists():
        return {}

    suffix = path.suffix.lower()
    if suffix in {".geojson", ".json"}:
        payload = json.loads(path.read_text(encoding="utf-8"))
        features = payload.get("features", [])
        lookup = {}
        for feature in features:
            props = feature.get("properties", {})
            key = normalize_key(props.get("parcel_key") or props.get("parcel_number") or props.get("parcelnumb"))
            if key and feature.get("geometry"):
                lookup[key] = feature["geometry"]
        return lookup

    if suffix == ".shp":
        try:
            import shapefile  # type: ignore
        except ImportError as exc:
            raise SystemExit(
                "Shapefile input requires pyshp. Install it with `python -m pip install pyshp`, "
                "or export GIS geometry as GeoJSON."
            ) from exc

        reader = shapefile.Reader(str(path))
        fields = [field[0] for field in reader.fields[1:]]
        lookup = {}
        for record, shape in zip(reader.records(), reader.shapes()):
            props = dict(zip(fields, record))
            key = normalize_key(props.get("parcel_key") or props.get("parcel_number") or props.get("parcelnumb"))
            if not key:
                continue
            geometry = shape.__geo_interface__
            lookup[key] = geometry
        return lookup

    raise SystemExit(f"Unsupported geometry input: {path}")


def load_parcel_month_rows(path: Path) -> list[dict[str, object]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return [dict(row) for row in read_csv(path)]
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return [dict(row) for row in payload]
        if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
            return [dict(row) for row in payload["rows"]]
    raise SystemExit(f"Unsupported parcel-month input: {path}")


def truthy(value: object) -> bool:
    return str(value).strip().lower() in {"1", "true", "t", "yes", "y"}


def build_geojson_from_source_rows(
    rows: list[dict[str, object]],
    geometry_lookup: dict[str, dict[str, object]],
) -> dict[str, object]:
    features = []
    missing_geometry = 0
    for row in rows:
        parcel_key = normalize_key(row.get("parcel_key") or row.get("parcel_number") or row.get("parcelnumb"))
        geometry = geometry_lookup.get(parcel_key)
        if not geometry:
            missing_geometry += 1
            continue

        status = str(row.get("completion_status") or "").strip()
        if not status:
            if str(row.get("maintenance_level")) == "Request Only":
                status = "request_only"
            elif truthy(row.get("returned_flag")):
                status = "returned"
            else:
                status = "missing"

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "parcel_key": parcel_key,
                    "period_month": str(row.get("period_month") or "")[:7],
                    "organization": str(row.get("organization") or "Unassigned"),
                    "maintenance_level": str(row.get("maintenance_level") or "Unknown"),
                    "assigned_flag": truthy(row.get("assigned_flag")) or True,
                    "returned_flag": truthy(row.get("returned_flag")),
                    "completion_status": status,
                    "masked_geometry": False,
                },
                "geometry": geometry,
            }
        )

    if not features:
        raise SystemExit("No parcel-month rows could be joined to geometry.")

    return {
        "type": "FeatureCollection",
        "metadata": {
            "geometry_mode": "real_or_approved_export",
            "generated_on": date.today().isoformat(),
            "missing_geometry_rows": missing_geometry,
        },
        "features": features,
    }


def derive_rows_from_geojson(
    geojson: dict[str, object],
) -> tuple[list[dict[str, object]], list[dict[str, object]], dict[str, int]]:
    month_org: dict[tuple[str, str], dict[str, set[str]]] = defaultdict(
        lambda: {"assigned": set(), "returned": set()}
    )
    month_totals: dict[str, dict[str, set[str]]] = defaultdict(
        lambda: {
            "active_assigned": set(),
            "total_assigned": set(),
            "active_returned": set(),
            "returned": set(),
        }
    )

    for feature in geojson.get("features", []):
        props = feature.get("properties", {})
        if not isinstance(props, dict):
            continue

        parcel_key = str(props.get("parcel_key") or "")
        month = str(props.get("period_month") or "")[:7]
        org = str(props.get("organization") or "Unassigned")
        level = str(props.get("maintenance_level") or "")
        assigned = truthy(props.get("assigned_flag")) or props.get("assigned_flag") is True
        returned = truthy(props.get("returned_flag")) or props.get("returned_flag") is True

        if not parcel_key or not month or not assigned:
            continue

        month_totals[month]["total_assigned"].add(parcel_key)
        if level == "Active":
            month_totals[month]["active_assigned"].add(parcel_key)
            month_org[(month, org)]["assigned"].add(parcel_key)
            if returned:
                month_totals[month]["active_returned"].add(parcel_key)
                month_org[(month, org)]["returned"].add(parcel_key)
        if returned:
            month_totals[month]["returned"].add(parcel_key)

    metrics = []
    for month in sorted(month_totals):
        assigned_active = len(month_totals[month]["active_assigned"])
        assigned_total = len(month_totals[month]["total_assigned"])
        returned_active = len(month_totals[month]["active_returned"])
        metrics.append(
            {
                "period_month": month,
                "assigned_active": assigned_active,
                "assigned_total": assigned_total,
                "returned_assigned": returned_active,
                "active_completion_rate_pct": round(100 * returned_active / assigned_active, 1)
                if assigned_active
                else 0,
                "blended_completion_rate_pct": round(100 * returned_active / assigned_total, 1)
                if assigned_total
                else 0,
                "survey_rows_raw": len(month_totals[month]["returned"]),
            }
        )

    contractor_rows = []
    for (month, org), values in sorted(month_org.items()):
        assigned = len(values["assigned"])
        returned = len(values["returned"])
        contractor_rows.append(
            {
                "period_month": month,
                "organization": org,
                "assigned_parcel_keys": assigned,
                "returned_assigned_parcel_keys": returned,
                "completion_rate_pct": round(100 * returned / assigned, 1) if assigned else 0,
            }
        )

    latest = metrics[-1] if metrics else {}
    totals = {
        "active_assigned": int(latest.get("assigned_active", 0)),
        "request_only_assigned": int(latest.get("assigned_total", 0))
        - int(latest.get("assigned_active", 0)),
        "assigned_total": int(latest.get("assigned_total", 0)),
        "active_returned": int(latest.get("returned_assigned", 0)),
    }
    return contractor_rows, metrics, totals


def build_summary(
    metrics: list[dict[str, object]],
    totals: dict[str, int],
    geojson: dict[str, object],
) -> dict[str, object]:
    latest = metrics[-1]
    assigned_difference = totals["assigned_total"] - POWERBI_ASSIGNED
    returned_difference = latest["returned_assigned"] - POWERBI_RETURNED
    metadata = geojson.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}
    geometry_mode = str(metadata.get("geometry_mode") or "masked_demo")
    source_note = str(
        metadata.get("source_note")
        or "Masked demo geometry. Metrics derive from Week 1 CSV exports and dashboard references."
    )
    return {
        "latest_month": latest["period_month"],
        "generated_on": date.today().isoformat(),
        "source_note": source_note,
        "geometry_mode": geometry_mode,
        "latest_assignment_period": metadata.get("latest_assignment_period"),
        "latest_survey_period": metadata.get("latest_survey_period"),
        "powerbi_comparison": {
            "dashboard_assigned_count": POWERBI_ASSIGNED,
            "dashboard_returned_count": POWERBI_RETURNED,
            "dashboard_ura_owned_count": POWERBI_URA_OWNED,
            "dashboard_plb_owned_count": POWERBI_PLB_OWNED,
            "projected_yearly_limit": POWERBI_YEARLY_LIMIT,
            "total_amount_spent": POWERBI_TOTAL_SPENT,
            "quarterly_amount_spent": POWERBI_QUARTER_SPENT,
            "sql_export_assigned_count": totals["assigned_total"],
            "sql_export_returned_count": latest["returned_assigned"],
            "assigned_difference": assigned_difference,
            "returned_difference": returned_difference,
            "filter_note": "Current Power BI landing page values captured June 9, 2026.",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build GitHub Pages data for the LandCare prototype.")
    parser.add_argument("--validate-only", action="store_true", help="Validate existing generated files.")
    parser.add_argument(
        "--app-ready-geojson",
        type=Path,
        help="Approved parcel-month GeoJSON with the prototype schema. If omitted, masked demo geometry is generated.",
    )
    parser.add_argument(
        "--parcel-month-csv",
        type=Path,
        help="Parcel-month CSV or JSON exported from Postgres with prototype fields.",
    )
    parser.add_argument(
        "--geometry-file",
        type=Path,
        help="GeoJSON or shapefile containing parcel geometry keyed by parcel_key, parcel_number, or parcelnumb.",
    )
    args = parser.parse_args()

    if args.validate_only:
        geojson = json.loads((DATA_DIR / "parcels_monthly.geojson").read_text(encoding="utf-8"))
        metrics = json.loads((DATA_DIR / "monthly_metrics.json").read_text(encoding="utf-8"))
        validate_outputs(geojson, metrics)
        print("Prototype data validation passed.")
        return

    contractors, timeline, totals = load_baseline()
    if not contractors or not timeline:
        raise SystemExit("Missing Week 1 CSV exports. Run baseline QA exports first.")

    contractor_rows = contractor_monthly_rows(contractors, timeline)
    metrics = monthly_metrics(timeline, totals)
    strict_baseline = False
    if args.app_ready_geojson:
        geojson = load_app_ready_geojson(args.app_ready_geojson)
        contractor_rows, metrics, totals = derive_rows_from_geojson(geojson)
    elif args.parcel_month_csv and args.geometry_file:
        geojson = build_geojson_from_source_rows(
            load_parcel_month_rows(args.parcel_month_csv),
            load_geometry_features(args.geometry_file),
        )
        contractor_rows, metrics, totals = derive_rows_from_geojson(geojson)
    else:
        default_geojson = SOURCE_DIR / "parcels.geojson"
        default_rows = SOURCE_DIR / "parcel_month.csv"
        default_shape = SOURCE_DIR / "parcels.shp"
        if default_geojson.exists() and is_app_ready_geojson(
            json.loads(default_geojson.read_text(encoding="utf-8"))
        ):
            geojson = load_app_ready_geojson(default_geojson)
            contractor_rows, metrics, totals = derive_rows_from_geojson(geojson)
        elif default_rows.exists() and default_geojson.exists():
            geojson = build_geojson_from_source_rows(
                load_parcel_month_rows(default_rows),
                load_geometry_features(default_geojson),
            )
            contractor_rows, metrics, totals = derive_rows_from_geojson(geojson)
        elif default_rows.exists() and default_shape.exists():
            geojson = build_geojson_from_source_rows(
                load_parcel_month_rows(default_rows),
                load_geometry_features(default_shape),
            )
            contractor_rows, metrics, totals = derive_rows_from_geojson(geojson)
        else:
            geojson = build_masked_geojson(contractors, contractor_rows)
            strict_baseline = True
    summary = build_summary(metrics, totals, geojson)

    validate_outputs(geojson, metrics, strict_baseline=strict_baseline)

    write_json(DATA_DIR / "parcels_monthly.geojson", geojson)
    write_json(DATA_DIR / "monthly_metrics.json", metrics)
    write_json(DATA_DIR / "kpi_summary.json", summary)
    write_csv(
        DATA_DIR / "contractor_monthly.csv",
        contractor_rows,
        [
            "period_month",
            "organization",
            "assigned_parcel_keys",
            "returned_assigned_parcel_keys",
            "completion_rate_pct",
        ],
    )
    print(f"Wrote prototype data to {DATA_DIR}")


if __name__ == "__main__":
    main()
