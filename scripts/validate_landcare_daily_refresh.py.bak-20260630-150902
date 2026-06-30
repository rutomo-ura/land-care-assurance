from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATA_DIR = ROOT / "docs" / "landcare" / "data"
DEFAULT_SOURCE_GEOJSON = ROOT / "prototype" / "source" / "app_ready_parcels_monthly.geojson"

REQUIRED_DATA_FILES = [
    "refresh_manifest.json",
    "kpi_summary.json",
    "monthly_metrics.json",
    "contractor_monthly.json",
    "all_months.geojson",
    "latest_month.geojson",
    "finance_summary.json",
]


class ValidationError(Exception):
    pass


def load_json(path: Path) -> Any:
    if not path.exists():
        raise ValidationError(f"Required file is missing: {path}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"Invalid JSON in {path}: {exc}") from exc


def require_positive_int(value: Any, label: str) -> int:
    if not isinstance(value, int) or value <= 0:
        raise ValidationError(f"{label} must be a positive integer; got {value!r}")
    return value


def require_date_not_backward(current: Any, previous: Any, label: str) -> None:
    if previous in (None, "") or current in (None, ""):
        return
    if str(current) < str(previous):
        raise ValidationError(f"{label} moved backward: previous={previous}, current={current}")


def validate_feature_collection(payload: Any, label: str) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection":
        raise ValidationError(f"{label} must be a GeoJSON FeatureCollection")
    features = payload.get("features")
    if not isinstance(features, list) or not features:
        raise ValidationError(f"{label} must contain at least one feature")
    return features


def validate_source_geojson(path: Path) -> None:
    payload = load_json(path)
    features = validate_feature_collection(payload, str(path))
    first = features[0]
    if not isinstance(first, dict) or not isinstance(first.get("properties"), dict):
        raise ValidationError(f"{path} contains features without properties")

    required_props = {
        "parcel_key",
        "period_month",
        "organization",
        "maintenance_level",
        "assigned_flag",
        "returned_flag",
        "completion_status",
    }
    missing = required_props - set(first["properties"])
    if missing:
        raise ValidationError(f"{path} is not app-ready; missing properties: {sorted(missing)}")


def validate_duplicate_parcel_months(features: list[dict[str, Any]], label: str) -> None:
    seen: set[tuple[str, str]] = set()
    duplicates = 0
    for feature in features:
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise ValidationError(f"{label} contains a feature without properties")
        key = (str(props.get("period_month") or ""), str(props.get("parcel_key") or ""))
        if not key[0] or not key[1]:
            raise ValidationError(f"{label} contains a feature without period_month or parcel_key")
        if key in seen:
            duplicates += 1
        seen.add(key)
    if duplicates:
        raise ValidationError(f"{label} contains {duplicates} duplicate parcel-month feature(s)")


def validate_latest_status_counts(latest_summary: dict[str, Any]) -> None:
    status_counts = latest_summary.get("status_counts")
    feature_count = latest_summary.get("feature_count")
    if not isinstance(status_counts, dict):
        raise ValidationError("latest_month_summary.json missing status_counts")
    if sum(int(value) for value in status_counts.values()) != feature_count:
        raise ValidationError(
            "latest status_counts do not sum to latest feature_count: "
            f"{sum(int(value) for value in status_counts.values())} != {feature_count}"
        )


def validate_finance_summary(finance: dict[str, Any]) -> None:
    summary = finance.get("summary")
    if not isinstance(summary, dict):
        raise ValidationError("finance_summary.json missing summary")
    require_positive_int(summary.get("organization_count"), "finance organization_count")
    require_positive_int(summary.get("parcel_count"), "finance parcel_count")
    annual_run_rate = summary.get("annual_invoice_run_rate")
    if not isinstance(annual_run_rate, (int, float)) or annual_run_rate <= 0:
        raise ValidationError(f"finance annual_invoice_run_rate must be positive; got {annual_run_rate!r}")


def validate_daily_refresh(args: argparse.Namespace) -> None:
    data_dir = args.data_dir
    payloads = {name: load_json(data_dir / name) for name in REQUIRED_DATA_FILES}
    manifest = payloads["refresh_manifest.json"]
    kpi = payloads["kpi_summary.json"]
    latest_summary = load_json(data_dir / "latest_month_summary.json")
    previous_manifest = load_json(args.previous_manifest) if args.previous_manifest else None
    previous_kpi = load_json(args.previous_kpi_summary) if args.previous_kpi_summary else None

    if args.source_geojson:
        validate_source_geojson(args.source_geojson)

    expected_date = args.expected_date or date.today().isoformat()
    if manifest.get("generated_on") != expected_date:
        raise ValidationError(
            f"refresh_manifest.json generated_on must be {expected_date}; got {manifest.get('generated_on')!r}"
        )
    finance_generated_on = payloads["finance_summary.json"].get("metadata", {}).get("generated_on")
    if finance_generated_on != expected_date:
        raise ValidationError(
            f"finance_summary.json metadata.generated_on must be {expected_date}; got {finance_generated_on!r}"
        )

    if previous_manifest:
        require_date_not_backward(
            manifest.get("latest_assignment_period"),
            previous_manifest.get("latest_assignment_period"),
            "latest_assignment_period",
        )
        require_date_not_backward(
            manifest.get("latest_survey_period"),
            previous_manifest.get("latest_survey_period"),
            "latest_survey_period",
        )
    if previous_kpi:
        previous_missing = previous_kpi.get("missing_geometry_rows")
        current_missing = kpi.get("missing_geometry_rows")
        if isinstance(previous_missing, int) and isinstance(current_missing, int):
            increase = current_missing - previous_missing
            if increase > args.max_missing_geometry_increase:
                raise ValidationError(
                    "missing geometry rows spiked: "
                    f"previous={previous_missing}, current={current_missing}, "
                    f"increase={increase}, allowed={args.max_missing_geometry_increase}"
                )

    require_positive_int(manifest.get("all_month_feature_count"), "all_month_feature_count")
    require_positive_int(manifest.get("latest_month_feature_count"), "latest_month_feature_count")

    latest_metrics = kpi.get("latest_month_metrics")
    if not isinstance(latest_metrics, dict):
        raise ValidationError("kpi_summary.json missing latest_month_metrics")
    require_positive_int(latest_metrics.get("assigned_active"), "latest_month_metrics.assigned_active")
    require_positive_int(latest_metrics.get("assigned_total"), "latest_month_metrics.assigned_total")
    require_positive_int(latest_metrics.get("returned_assigned"), "latest_month_metrics.returned_assigned")

    all_features = validate_feature_collection(payloads["all_months.geojson"], "all_months.geojson")
    latest_features = validate_feature_collection(payloads["latest_month.geojson"], "latest_month.geojson")
    validate_duplicate_parcel_months(all_features, "all_months.geojson")

    if len(all_features) != manifest.get("all_month_feature_count"):
        raise ValidationError("all_months.geojson feature count does not match refresh_manifest.json")
    if len(latest_features) != manifest.get("latest_month_feature_count"):
        raise ValidationError("latest_month.geojson feature count does not match refresh_manifest.json")

    validate_latest_status_counts(latest_summary)
    validate_finance_summary(payloads["finance_summary.json"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate the daily LandCare dashboard refresh outputs.")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--source-geojson", type=Path, default=DEFAULT_SOURCE_GEOJSON)
    parser.add_argument("--previous-manifest", type=Path)
    parser.add_argument("--previous-kpi-summary", type=Path)
    parser.add_argument("--expected-date", help="Expected generated_on date in YYYY-MM-DD format. Defaults to today.")
    parser.add_argument(
        "--max-missing-geometry-increase",
        type=int,
        default=25,
        help="Maximum allowed increase in missing geometry rows compared with the prior manifest.",
    )
    args = parser.parse_args()

    try:
        validate_daily_refresh(args)
    except ValidationError as exc:
        raise SystemExit(f"LandCare daily refresh validation failed: {exc}") from exc

    print("LandCare daily refresh validation passed.")


if __name__ == "__main__":
    main()
