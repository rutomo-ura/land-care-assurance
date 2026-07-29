from __future__ import annotations

import argparse
import json
import warnings
from datetime import date, datetime
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
    "quarterly_metrics.json",
    "area_compliance.json",
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


def require_count_not_backward(
    current: Any,
    previous: Any,
    label: str,
    *,
    same_period: bool,
) -> None:
    if not same_period:
        return
    if previous is None or current is None:
        return
    if not isinstance(previous, int) or not isinstance(current, int):
        return
    if current < previous:
        raise ValidationError(f"{label} decreased: previous={previous}, current={current}")


def warn_if_survey_period_stale(latest_survey_period: Any, *, max_stale_days: int) -> None:
    if latest_survey_period in (None, ""):
        return
    period_text = str(latest_survey_period)
    try:
        period_date = datetime.strptime(period_text, "%Y-%m-%d").date()
    except ValueError:
        try:
            period_date = datetime.strptime(period_text, "%Y-%m").date()
        except ValueError:
            return
    stale_days = (date.today() - period_date).days
    if stale_days > max_stale_days:
        warnings.warn(
            f"latest_survey_period {latest_survey_period} is {stale_days} days old; "
            f"upstream Regrid daily pipeline may be stalled (threshold={max_stale_days} days).",
            stacklevel=2,
        )


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


def validate_canonical_parcel_contract(features: list[dict[str, Any]], label: str) -> None:
    missing_block_lot = 0
    allowed_ownership = {"URA", "PLB"}
    for feature in features:
        props = feature.get("properties")
        if not isinstance(props, dict):
            raise ValidationError(f"{label} contains a feature without properties")
        missing = {"parcel_key", "ownership_group", "completion_status"} - set(props)
        if missing:
            raise ValidationError(f"{label} is missing canonical properties: {sorted(missing)}")
        if props.get("ownership_group") not in allowed_ownership:
            raise ValidationError(f"{label} has unsupported ownership_group {props.get('ownership_group')!r}")
        if not props.get("block_lot"):
            missing_block_lot += 1
    if missing_block_lot:
        warnings.warn(
            f"{label} has {missing_block_lot} feature(s) without block_lot; search coverage is incomplete.",
            stacklevel=2,
        )


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

    actual_source = finance.get("actual_invoice_source", {})
    if not isinstance(actual_source, dict) or actual_source.get("status") not in {"available", "unavailable"}:
        raise ValidationError("finance_summary.json has an invalid actual_invoice_source status")
    invoices = finance.get("actual_invoices", [])
    if not isinstance(invoices, list):
        raise ValidationError("finance_summary.json actual_invoices must be a list")
    invoice_ids: set[str] = set()
    for invoice in invoices:
        if not isinstance(invoice, dict) or not invoice.get("invoice_id"):
            raise ValidationError("finance_summary.json has an actual invoice without invoice_id")
        invoice_id = str(invoice["invoice_id"])
        if invoice_id in invoice_ids:
            raise ValidationError(f"finance_summary.json has duplicate invoice ID {invoice_id!r}")
        invoice_ids.add(invoice_id)
    if actual_source.get("status") == "available" and not invoices:
        warnings.warn("NetSuite source is marked available but contains no invoice rows.", stacklevel=2)


def validate_quarterly_metrics(payload: Any) -> None:
    if not isinstance(payload, dict) or not isinstance(payload.get("quarters"), list):
        raise ValidationError("quarterly_metrics.json missing quarters")
    seen_quarters: set[str] = set()
    for row in payload["quarters"]:
        if not isinstance(row, dict):
            raise ValidationError("quarterly_metrics.json contains an invalid quarter row")
        quarter = str(row.get("quarter") or "")
        if len(quarter) != 7 or quarter[4:] not in {"-Q1", "-Q2", "-Q3", "-Q4"} or not quarter[:4].isdigit():
            raise ValidationError(f"quarterly_metrics.json has invalid quarter {quarter!r}")
        if quarter in seen_quarters:
            raise ValidationError(f"quarterly_metrics.json has duplicate quarter {quarter!r}")
        seen_quarters.add(quarter)
        months = row.get("months")
        if not isinstance(months, list) or not months:
            raise ValidationError(f"quarterly_metrics.json {quarter} has no month rows")
        for measure in ("active_assignments", "returned_assignments", "open_assignments", "request_only_assignments"):
            if not isinstance(row.get(measure), int) or row[measure] < 0:
                raise ValidationError(f"quarterly_metrics.json {quarter} has invalid {measure}")
            month_total = sum(int(month.get(measure, 0)) for month in months if isinstance(month, dict))
            if month_total != row[measure]:
                raise ValidationError(f"quarterly_metrics.json {quarter} {measure} does not reconcile to monthly rows")
        if row["open_assignments"] != row["active_assignments"] - row["returned_assignments"]:
            raise ValidationError(f"quarterly_metrics.json {quarter} open assignments do not reconcile")
        for owner in row.get("owner_breakdown", []):
            if not isinstance(owner, dict) or owner.get("ownership_group") not in {"URA", "PLB"}:
                raise ValidationError(f"quarterly_metrics.json {quarter} has unsupported ownership data")
            area = owner.get("sq_footage")
            if area is not None and (not isinstance(area, (int, float)) or area < 0):
                raise ValidationError(f"quarterly_metrics.json {quarter} has invalid ownership square footage")


def validate_area_compliance(payload: Any) -> None:
    if not isinstance(payload, dict) or not isinstance(payload.get("rows"), list):
        raise ValidationError("area_compliance.json missing rows")
    seen: set[tuple[str, str]] = set()
    statuses = {"within_limit", "above_limit", "below_limit", "baseline_unavailable"}
    for row in payload["rows"]:
        if not isinstance(row, dict):
            raise ValidationError("area_compliance.json contains an invalid row")
        key = (str(row.get("period_month") or ""), str(row.get("organization") or ""))
        if not all(key):
            raise ValidationError("area_compliance.json has a row without period_month or organization")
        if key in seen:
            raise ValidationError(f"area_compliance.json has duplicate contractor-period {key!r}")
        seen.add(key)
        status = row.get("compliance_status")
        if status not in statuses:
            raise ValidationError(f"area_compliance.json has unsupported compliance status {status!r}")
        baseline = row.get("baseline_sqft")
        if status == "baseline_unavailable":
            if baseline is not None:
                raise ValidationError("baseline_unavailable rows cannot contain a baseline_sqft")
            continue
        assigned = row.get("assigned_sqft")
        limits = (row.get("lower_limit_sqft"), row.get("upper_limit_sqft"))
        if not isinstance(baseline, (int, float)) or baseline <= 0 or not isinstance(assigned, (int, float)):
            raise ValidationError("area compliance rows with a baseline require positive baseline and assigned_sqft")
        if not all(isinstance(limit, (int, float)) for limit in limits):
            raise ValidationError("area compliance rows with a baseline require lower and upper limits")
        if round(float(limits[0]), 2) != round(float(baseline) * 0.9, 2) or round(float(limits[1]), 2) != round(float(baseline) * 1.1, 2):
            raise ValidationError("area compliance limits do not match the contractual ±10% band")
        expected_status = "within_limit" if limits[0] <= assigned <= limits[1] else "above_limit" if assigned > limits[1] else "below_limit"
        if status != expected_status:
            raise ValidationError("area compliance status does not match assigned square footage")


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

    latest_metrics = kpi.get("latest_month_metrics")
    if not isinstance(latest_metrics, dict):
        raise ValidationError("kpi_summary.json missing latest_month_metrics")

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
        same_survey_period = (
            manifest.get("latest_survey_period") == previous_manifest.get("latest_survey_period")
        )
        require_count_not_backward(
            manifest.get("survey_submission_count"),
            previous_manifest.get("survey_submission_count"),
            "survey_submission_count",
            same_period=same_survey_period,
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
        same_latest_month = kpi.get("latest_month") == previous_kpi.get("latest_month")
        previous_metrics = previous_kpi.get("latest_month_metrics")
        if isinstance(previous_metrics, dict) and isinstance(latest_metrics, dict):
            require_count_not_backward(
                latest_metrics.get("returned_assigned"),
                previous_metrics.get("returned_assigned"),
                "latest_month_metrics.returned_assigned",
                same_period=same_latest_month,
            )

    warn_if_survey_period_stale(
        manifest.get("latest_survey_period"),
        max_stale_days=args.max_survey_period_stale_days,
    )

    require_positive_int(manifest.get("all_month_feature_count"), "all_month_feature_count")
    require_positive_int(manifest.get("latest_month_feature_count"), "latest_month_feature_count")
    require_positive_int(latest_metrics.get("assigned_active"), "latest_month_metrics.assigned_active")
    require_positive_int(latest_metrics.get("assigned_total"), "latest_month_metrics.assigned_total")
    require_positive_int(latest_metrics.get("returned_assigned"), "latest_month_metrics.returned_assigned")

    all_features = validate_feature_collection(payloads["all_months.geojson"], "all_months.geojson")
    latest_features = validate_feature_collection(payloads["latest_month.geojson"], "latest_month.geojson")
    validate_duplicate_parcel_months(all_features, "all_months.geojson")
    validate_canonical_parcel_contract(all_features, "all_months.geojson")

    if len(all_features) != manifest.get("all_month_feature_count"):
        raise ValidationError("all_months.geojson feature count does not match refresh_manifest.json")
    if len(latest_features) != manifest.get("latest_month_feature_count"):
        raise ValidationError("latest_month.geojson feature count does not match refresh_manifest.json")

    ownership_counts = manifest.get("ownership_counts")
    if not isinstance(ownership_counts, dict) or not ownership_counts:
        raise ValidationError("refresh_manifest.json missing ownership_counts")
    if set(ownership_counts) - {"URA", "PLB"}:
        raise ValidationError(f"refresh_manifest.json has unsupported ownership groups: {sorted(set(ownership_counts) - {'URA', 'PLB'})}")

    validate_latest_status_counts(latest_summary)
    validate_finance_summary(payloads["finance_summary.json"])
    validate_quarterly_metrics(payloads["quarterly_metrics.json"])
    validate_area_compliance(payloads["area_compliance.json"])


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
    parser.add_argument(
        "--max-survey-period-stale-days",
        type=int,
        default=45,
        help="Warn when latest_survey_period is older than this many days.",
    )
    args = parser.parse_args()

    try:
        validate_daily_refresh(args)
    except ValidationError as exc:
        raise SystemExit(f"LandCare daily refresh validation failed: {exc}") from exc

    print("LandCare daily refresh validation passed.")


if __name__ == "__main__":
    main()
