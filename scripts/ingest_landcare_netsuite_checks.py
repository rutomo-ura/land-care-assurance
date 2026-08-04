from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FINANCE = ROOT / "docs" / "landcare" / "data" / "finance_summary.json"
LANDCARE_ACCOUNT = "66220 Property Management : Lawn Maintenance"
SAVED_SEARCH_ID = "1618"
SAVED_SEARCH_NAME = "All URA LandCare Check Requests"

VENDOR_ALIASES = {
    "amani christian community development corporation": "Amani Christian CDC",
    "center that c.a.r.e.s.": "Center That CARES",
    "chatman properties llc (ura)": "Chatman Properties",
    "ervin home beautification": "Ervin Home Beautification",
    "fhcv contracting llc": "FHCV Contracting LLC & LawnCare",
    "fhcv contracting llc & lawn care (ura)": "FHCV Contracting LLC & LawnCare",
    "hilltop rising, llc /ura": "Hilltop Rising",
    "hilltop rising, llc (phdc)": "Hilltop Rising",
    "k.r.j. enterprises inc": "KRJ Enterprises",
    "k.r.j. enterprises inc. - eltridra": "KRJ Enterprises",
    "one call handles it all landscaping and trucking": "One Call Handles It All",
    "operation better block": "Operation Better Block",
}


def clean(value: Any) -> str:
    return str(value or "").replace("\u00a0", " ").strip()


def value_for(row: dict[str, Any], *labels: str) -> str:
    normalized = {re.sub(r"\.\d+$", "", clean(key)).lower(): clean(value) for key, value in row.items()}
    for label in labels:
        value = normalized.get(label.lower())
        if value:
            return value
    return ""


def vendor_for(row: dict[str, Any]) -> str:
    candidates = [clean(value) for key, value in row.items() if re.sub(r"\.\d+$", "", clean(key)).lower() == "name"]
    return next((value for value in reversed(candidates) if value), "")


def parse_amount(value: str) -> float:
    cleaned = value.replace("$", "").replace(",", "").replace("(", "-").replace(")", "")
    return round(float(cleaned or 0), 2)


def parse_date(value: str) -> datetime:
    for pattern in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, pattern)
        except ValueError:
            continue
    raise ValueError(f"Unsupported NetSuite date: {value!r}")


def aggregate(rows: Iterable[dict[str, Any]], cycle_start: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    cycle_start_date = datetime.strptime(cycle_start, "%Y-%m-%d")
    contractor_groups: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    other_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {"amount": 0.0, "count": 0})
    source_count = cycle_count = contractor_count = other_count = 0
    source_total = cycle_total = 0.0
    latest_date: datetime | None = None

    for row in rows:
        if value_for(row, "Type", "Transaction Type").casefold() != "check request":
            continue
        if value_for(row, "Account") != LANDCARE_ACCOUNT:
            continue
        posting_date = parse_date(value_for(row, "Date", "Due Date", "Posting Date"))
        amount = parse_amount(value_for(row, "Amount"))
        source_count += 1
        source_total += amount
        latest_date = max(latest_date or posting_date, posting_date)
        if posting_date < cycle_start_date:
            continue
        cycle_count += 1
        cycle_total += amount
        period_month = posting_date.strftime("%Y-%m")
        vendor = vendor_for(row)
        organization = VENDOR_ALIASES.get(vendor.casefold())
        if organization:
            group = contractor_groups[(period_month, organization)]
            contractor_count += 1
        else:
            group = other_groups[period_month]
            other_count += 1
        group["amount"] += amount
        group["count"] += 1

    actuals = [
        {
            "invoice_id": f"NS-{period_month}-{re.sub(r'[^a-z0-9]+', '-', organization.lower()).strip('-')}",
            "period_month": period_month,
            "posting_date": f"{period_month}-01",
            "organization": organization,
            "actual_amount": round(group["amount"], 2),
            "transaction_count": group["count"],
            "reference": f"NetSuite saved search {SAVED_SEARCH_ID}",
        }
        for (period_month, organization), group in sorted(contractor_groups.items())
    ]
    other_actuals = [
        {
            "period_month": period_month,
            "actual_amount": round(group["amount"], 2),
            "transaction_count": group["count"],
        }
        for period_month, group in sorted(other_groups.items())
    ]
    stats = {
        "source_record_count": source_count,
        "source_total": round(source_total, 2),
        "current_cycle_record_count": cycle_count,
        "current_cycle_total": round(cycle_total, 2),
        "current_cycle_contractor_record_count": contractor_count,
        "current_cycle_contractor_total": round(sum(row["actual_amount"] for row in actuals), 2),
        "current_cycle_other_record_count": other_count,
        "current_cycle_other_total": round(sum(row["actual_amount"] for row in other_actuals), 2),
        "latest_transaction_date": latest_date.date().isoformat() if latest_date else None,
    }
    return actuals, other_actuals, stats


def ingest(source: Path, finance_path: Path) -> dict[str, Any]:
    finance = json.loads(finance_path.read_text(encoding="utf-8"))
    with source.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    actuals, other_actuals, stats = aggregate(rows, finance["summary"]["cycle_start_date"])
    finance["actual_invoices"] = actuals
    finance["other_program_actuals"] = other_actuals
    finance["actual_invoice_source"] = {
        "status": "available" if actuals else "unavailable",
        "source_system": "NetSuite",
        "saved_search_name": SAVED_SEARCH_NAME,
        "saved_search_id": SAVED_SEARCH_ID,
        "account": LANDCARE_ACCOUNT,
        "refreshed_at": stats["latest_transaction_date"],
        "publication_grain": "month and current-cycle contractor",
        "privacy_note": "Public output excludes document numbers, memos, and transaction-level vendor records.",
        **stats,
    }
    finance_path.write_text(json.dumps(finance, indent=2) + "\n", encoding="utf-8", newline="\n")
    return finance


def main() -> None:
    parser = argparse.ArgumentParser(description="Aggregate a read-only NetSuite LandCare check-request CSV into the KPI finance contract.")
    parser.add_argument("--source", type=Path, required=True, help="CSV exported from saved search 1618")
    parser.add_argument("--finance", type=Path, default=DEFAULT_FINANCE)
    args = parser.parse_args()
    ingest(args.source, args.finance)
    print(f"Updated aggregate NetSuite actuals in {args.finance}")


if __name__ == "__main__":
    main()
