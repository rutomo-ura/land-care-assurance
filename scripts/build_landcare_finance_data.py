from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"\\ura-fs\share\Public\LandCare\Land Care Annual Budgeting and Contracting.xlsx")
DEFAULT_OUTPUT = ROOT / "docs" / "landcare" / "data" / "finance_summary.json"
CURRENT_SHEET = "2025 - 2027 Cycle"
HISTORY_SHEET = "Sheet1"


def number(value: Any) -> float | None:
    if pd.isna(value):
        return None
    return float(value)


def iso_date(value: Any) -> str | None:
    if pd.isna(value):
        return None
    return pd.Timestamp(value).date().isoformat()


def text(value: Any) -> str | None:
    if pd.isna(value):
        return None
    cleaned = str(value).strip()
    return cleaned or None


def read_current_cycle(source: Path) -> list[dict[str, Any]]:
    df = pd.read_excel(source, sheet_name=CURRENT_SHEET)
    df = df[df["Organization"].notna() & df["Start Date"].notna()].copy()
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        sq_footage = number(row.get("Sq Footage")) or 0
        acres = sq_footage / 43560 if sq_footage else 0
        parcels = number(row.get("Parcels")) or 0
        invoice_amount = number(row.get("Invoice Amount")) or 0
        twelve_month = number(row.get("12-Month Contract Amount")) or 0
        total_contract = number(row.get("Total Contract Amount")) or 0
        rows.append(
            {
                "organization": text(row.get("Organization")),
                "parcels": int(parcels),
                "sq_footage": round(sq_footage, 2),
                "acres": round(acres, 3),
                "start_date": iso_date(row.get("Start Date")),
                "end_date": iso_date(row.get("End Date")),
                "monthly_invoice_amount": round(invoice_amount, 2),
                "annual_invoice_run_rate": round(invoice_amount * 12, 2),
                "original_contract_amount": round(number(row.get("Original Contract Amount")) or 0, 2),
                "total_contract_amount": round(total_contract, 2),
                "twelve_month_contract_amount": round(twelve_month, 2),
                "monthly_cost_per_parcel": round(invoice_amount / parcels, 2) if parcels else None,
                "annual_cost_per_acre": round((invoice_amount * 12) / acres, 2) if acres else None,
                "owed_for_2025": round(number(row.get("Owed for 2025")) or 0, 2),
            }
        )
    return rows


def read_history(source: Path) -> list[dict[str, Any]]:
    df = pd.read_excel(source, sheet_name=HISTORY_SHEET)
    df = df[df["Organization"].notna() & df["Start Date"].notna()].copy()
    rows: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rows.append(
            {
                "organization": text(row.get("Organization")),
                "parcels": int(number(row.get("Parcels")) or 0),
                "start_date": iso_date(row.get("Start Date")),
                "end_date": iso_date(row.get("End Date")),
                "invoice_amount": round(number(row.get("Invoice Amount")) or 0, 2),
                "mr_check_note": text(row.get("MR CHECK")) or "",
            }
        )
    return rows


def build_summary(source: Path) -> dict[str, Any]:
    current_rows = read_current_cycle(source)
    history_rows = read_history(source)
    monthly_invoice_total = sum(row["monthly_invoice_amount"] for row in current_rows)
    annual_run_rate = sum(row["annual_invoice_run_rate"] for row in current_rows)
    total_contract_amount = sum(row["total_contract_amount"] for row in current_rows)
    twelve_month_total = sum(row["twelve_month_contract_amount"] for row in current_rows)
    total_parcels = sum(row["parcels"] for row in current_rows)
    total_sqft = sum(row["sq_footage"] for row in current_rows)
    total_acres = sum(row["acres"] for row in current_rows)
    # The Power BI Parcel Area Distribution page was checked against the
    # contract workbook on 2026-07-29. Its beginning-of-cycle figures for
    # Amani (78,546), Center That CARES (66,409), and Chatman (2,019,758)
    # matched the workbook exactly. The workbook is therefore published as
    # the machine-readable baseline pending a direct Power BI export feed.
    area_baselines = [
        {
            "contract_cycle": "2025-2027",
            "organization": row["organization"],
            "baseline_sqft": row["sq_footage"],
            "source_timestamp": "2026-07-29",
            "verification_method": "Power BI Parcel Area Distribution matched to contract workbook",
        }
        for row in current_rows
    ]
    return {
        "metadata": {
            "schema_version": 2,
            "generated_on": date.today().isoformat(),
            "source_kind": "landcare_budget_workbook",
            "source_file": str(source),
            "workbook_sheets": [CURRENT_SHEET, HISTORY_SHEET],
            "postgres_table": "gis.land_care_budgeting_contracts",
            "loader_script": "URA-Data-Repository/ContractsDriveToSQL.py",
            "postgres_export_sql": "prototype/sql/export_landcare_finance_readonly.sql",
            "note": "Workbook source is the same finance source loaded into PostgreSQL by ContractsDriveToSQL.py.",
        },
        "summary": {
            "cycle_start_date": min(row["start_date"] for row in current_rows),
            "cycle_end_date": max(row["end_date"] for row in current_rows),
            "organization_count": len(current_rows),
            "parcel_count": total_parcels,
            "sq_footage": round(total_sqft, 2),
            "acres": round(total_acres, 3),
            "monthly_invoice_total": round(monthly_invoice_total, 2),
            "annual_invoice_run_rate": round(annual_run_rate, 2),
            "total_contract_amount": round(total_contract_amount, 2),
            "twelve_month_contract_total": round(twelve_month_total, 2),
            "monthly_cost_per_parcel": round(monthly_invoice_total / total_parcels, 2) if total_parcels else None,
            "annual_cost_per_acre": round(annual_run_rate / total_acres, 2) if total_acres else None,
        },
        "current_contracts": current_rows,
        "check_request_history": history_rows,
        "actual_invoices": [],
        "actual_invoice_source": {
            "status": "unavailable",
            "message": "NetSuite actual invoices have not been configured for this published snapshot.",
            "refreshed_at": None,
        },
        "owner_quarter_responsibility": [
            {
                "quarter": "2026-Q1",
                "ownership_group": "PLB",
                "expected_responsibility": 923.61,
                "billed_amount": None,
                "paid_amount": None,
                "outstanding_balance": None,
                "formula_version": "Power BI Landing Page · 2026 Q1",
                "source_timestamp": "2026-07-29",
            },
            {
                "quarter": "2026-Q1",
                "ownership_group": "URA",
                "expected_responsibility": 187655.39,
                "billed_amount": None,
                "paid_amount": None,
                "outstanding_balance": None,
                "formula_version": "Power BI Landing Page · 2026 Q1",
                "source_timestamp": "2026-07-29",
            },
        ],
        "owner_responsibility_source": {
            "status": "partially_available",
            "message": "Power BI Landing Page values captured for 2026 Q1; remaining quarters await an automated export.",
            "formula_version": "Power BI Landing Page · 2026 Q1",
            "refreshed_at": "2026-07-29",
        },
        "contract_area_baselines": area_baselines,
        "contract_area_baseline_source": {
            "status": "partially_available",
            "message": "Contract workbook baselines matched the Power BI Parcel Area Distribution report for sampled contractors; direct Power BI export remains pending.",
            "refreshed_at": "2026-07-29",
        },
    }


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8", newline="\n")


def preserve_netsuite_actuals(payload: dict[str, Any], output: Path) -> None:
    if not output.exists():
        return
    previous = json.loads(output.read_text(encoding="utf-8"))
    source = previous.get("actual_invoice_source", {})
    if source.get("status") != "available":
        return
    for key in ("actual_invoices", "other_program_actuals", "actual_invoice_source"):
        if key in previous:
            payload[key] = previous[key]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build LandCare finance dashboard data from the budgeting workbook.")
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    if not args.source.exists():
        raise SystemExit(f"Finance source workbook not found: {args.source}")
    payload = build_summary(args.source)
    preserve_netsuite_actuals(payload, args.output)
    write_json(args.output, payload)
    print(f"Wrote LandCare finance data to {args.output}")


if __name__ == "__main__":
    main()
