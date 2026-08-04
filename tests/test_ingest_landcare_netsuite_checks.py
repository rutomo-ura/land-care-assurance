import csv
import importlib.util
import json
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "ingest_landcare_netsuite_checks.py"
SPEC = importlib.util.spec_from_file_location("ingest_landcare_netsuite_checks", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def test_ingest_aggregates_contractors_and_excludes_transaction_details(tmp_path):
    source = tmp_path / "checks.csv"
    finance_path = tmp_path / "finance.json"
    finance_path.write_text(json.dumps({"summary": {"cycle_start_date": "2025-11-01"}}), encoding="utf-8")
    rows = [
        {"Date": "07/01/2026", "Type": "Check Request", "Account": MODULE.LANDCARE_ACCOUNT, "Amount": "1,000.00", "Name": "", "Name.1": "K.R.J. Enterprises Inc", "Document Number": "private-1", "Memo": "private memo"},
        {"Date": "07/15/2026", "Type": "Check Request", "Account": MODULE.LANDCARE_ACCOUNT, "Amount": "500.00", "Name": "", "Name.1": "K.R.J. Enterprises Inc. - Eltridra", "Document Number": "private-2", "Memo": "private memo"},
        {"Date": "08/01/2026", "Type": "Check Request", "Account": MODULE.LANDCARE_ACCOUNT, "Amount": "25.00", "Name": "", "Name.1": "PWSA", "Document Number": "private-3", "Memo": "private memo"},
        {"Date": "10/01/2025", "Type": "Check Request", "Account": MODULE.LANDCARE_ACCOUNT, "Amount": "900.00", "Name": "", "Name.1": "K.R.J. Enterprises Inc", "Document Number": "old", "Memo": "old"},
    ]
    with source.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0])
        writer.writeheader()
        writer.writerows(rows)

    payload = MODULE.ingest(source, finance_path)

    assert payload["actual_invoices"] == [{
        "invoice_id": "NS-2026-07-krj-enterprises",
        "period_month": "2026-07",
        "posting_date": "2026-07-01",
        "organization": "KRJ Enterprises",
        "actual_amount": 1500.0,
        "transaction_count": 2,
        "reference": "NetSuite saved search 1618",
    }]
    assert payload["other_program_actuals"] == [{"period_month": "2026-08", "actual_amount": 25.0, "transaction_count": 1}]
    assert payload["actual_invoice_source"]["source_record_count"] == 4
    assert payload["actual_invoice_source"]["current_cycle_record_count"] == 3
    serialized = json.dumps(payload)
    assert "private memo" not in serialized
    assert "private-1" not in serialized
