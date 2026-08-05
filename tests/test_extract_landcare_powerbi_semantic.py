import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "extract_landcare_powerbi_semantic.py"
SPEC = importlib.util.spec_from_file_location("extract_landcare_powerbi_semantic", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeClient:
    def latest_refresh(self):
        return {"status": "Completed", "endTime": "2026-08-04T07:14:38Z"}

    def execute_dax(self, dax):
        if dax == MODULE.HEADLINE_DAX:
            return [{"LandCare Check Requests[Year]": 2026, "[TotalAmountSpent]": 458995.17, "[PercentageSpent]": 59.23}]
        if dax == MODULE.QUARTER_DAX:
            return [
                {"[Year]": 2026, "[Quarter]": "Q1", "[AmountSpent]": 188579.00},
                {"[Year]": 2026, "[Quarter]": "Q2", "[AmountSpent]": 192318.50},
                {"[Year]": 2026, "[Quarter]": "Q3", "[AmountSpent]": 78097.67},
            ]
        if dax == MODULE.MONTHLY_CONTRACTOR_DAX:
            return [
                {"[Date Due]": "2026-03-31", "[Company]": "Amani Christian CDC", "[AmountSpent]": 188579.00},
                {"[Date Due]": "2026-06-30", "[Company]": "Amani Christian CDC", "[AmountSpent]": 192318.50},
                {"[Date Due]": "2026-07-31", "[Company]": "Amani Christian CDC", "[AmountSpent]": 78097.67},
            ]
        if dax == MODULE.CONTRACT_DAX:
            return [{
                "[Organization]": "Amani Christian CDC",
                "[Start Date]": "2025-11-01",
                "[End Date]": "2027-10-31",
                "[InvoiceAmount]": 64583.33,
                "[TwelveMonthContractAmount]": 775000.00,
                "[ProjectedYearlyLimit]": 775000.00,
            }]
        if dax == "AREA QUERY":
            return [
                {
                    "[Period]": "2026-07-15",
                    "[Organization]": "Amani Christian CDC",
                    "[AssignedSquareFeet]": 78546,
                    "[BaselineArea]": 78546,
                    "[Lower]": 70691,
                    "[Upper]": 86401,
                },
                {
                    "[Period]": "2026-07-15",
                    "[Organization]": "Chatman Properties",
                    "[AssignedSquareFeet]": 2019558,
                    "[BaselineArea]": 2019758,
                },
            ]
        raise AssertionError("unexpected DAX")


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def json(self):
        return self.payload


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append(("GET", url, kwargs))
        return FakeResponse({"value": [{"status": "Completed", "endTime": "2026-08-04T07:14:38Z"}]})

    def post(self, url, **kwargs):
        self.calls.append(("POST", url, kwargs))
        return FakeResponse({"results": [{"tables": [{"rows": [{"[Year]": 2026}]}]}]})


def config(tmp_path):
    return MODULE.PowerBIConfig(
        tenant_id="tenant",
        client_id="client",
        certificate_path=tmp_path / "certificate.pem",
        certificate_thumbprint="thumbprint",
    )


def test_semantic_extraction_matches_landcare_budget_baseline(tmp_path):
    finance_path = tmp_path / "finance_summary.json"
    finance_path.write_text(json.dumps({
        "metadata": {"generated_on": "2026-08-03"},
        "summary": {"cycle_start_date": "2025-11-01"},
        "current_contracts": [{"organization": "Amani Christian CDC", "parcels": 37}],
    }), encoding="utf-8")

    status = MODULE.run(
        config(tmp_path),
        finance_path,
        client=FakeClient(),
        now=datetime(2026, 8, 4, 11, 0, tzinfo=timezone.utc),
    )
    payload = json.loads(finance_path.read_text(encoding="utf-8"))
    annual = payload["semantic_summary"]["annual"][0]

    assert status["feed_status"] == "current"
    assert annual["total_amount_spent"] == 458995.17
    assert annual["yearly_limit"] == 775000.00
    assert annual["percentage_spent"] == 59.23
    assert [row["amount_spent"] for row in annual["quarters"]] == [188579.00, 192318.50, 78097.67]
    assert sum(row["actual_amount"] for row in payload["actual_invoices"]) == 458995.17
    assert payload["current_contracts"][0]["annual_invoice_run_rate"] == 775000.00
    serialized = json.dumps(payload)
    assert "Maintenance" not in serialized
    assert "tenant" not in serialized
    assert "thumbprint" not in serialized


def test_semantic_extraction_publishes_powerbi_parcel_area_rows(tmp_path):
    finance_path = tmp_path / "finance_summary.json"
    finance_path.write_text(json.dumps({
        "metadata": {"generated_on": "2026-08-03"},
        "summary": {"cycle_start_date": "2025-11-01"},
        "current_contracts": [{"organization": "Amani Christian CDC", "parcels": 37}],
    }), encoding="utf-8")
    query_path = tmp_path / "area.dax"
    query_path.write_text("AREA QUERY\n", encoding="utf-8")
    cfg = config(tmp_path)
    cfg = MODULE.PowerBIConfig(
        tenant_id=cfg.tenant_id,
        client_id=cfg.client_id,
        certificate_path=cfg.certificate_path,
        certificate_thumbprint=cfg.certificate_thumbprint,
        area_query_path=query_path,
    )

    status = MODULE.run(
        cfg,
        finance_path,
        client=FakeClient(),
        now=datetime(2026, 8, 5, 11, 0, tzinfo=timezone.utc),
    )
    payload = json.loads(finance_path.read_text(encoding="utf-8"))
    area = payload["semantic_area_summary"]

    assert status["area_feed_status"] == "current"
    assert area["source_system"] == "Power BI semantic model"
    assert area["page_id"] == "4a5502453e9080b7a655"
    assert area["rows"][0]["assigned_sqft"] == 78546.0
    assert area["rows"][1]["assigned_sqft"] == 2019558.0
    assert area["rows"][1]["lower_limit_sqft"] == pytest.approx(1817782.2)
    assert area["rows"][1]["upper_limit_sqft"] == pytest.approx(2221733.8)


def test_reconciliation_rejects_semantic_metric_drift(tmp_path):
    rows = MODULE.fetch_semantic_rows(FakeClient())
    rows["quarters"][2]["[AmountSpent]"] = 1
    with pytest.raises(MODULE.PowerBIError, match="annual and quarter totals"):
        MODULE.build_semantic_summary(rows, datetime(2026, 8, 4, tzinfo=timezone.utc))


def test_stale_failure_keeps_last_successful_values(tmp_path):
    finance_path = tmp_path / "finance_summary.json"
    payload = {
        "metadata": {"generated_on": "2026-08-03"},
        "actual_invoices": [{"invoice_id": "PBI-2026-07-a", "actual_amount": 10}],
        "actual_invoice_source": {
            "status": "available",
            "feed_status": "current",
            "source_system": "Power BI semantic model",
            "last_success_at": "2026-08-03T11:00:00Z",
            "refreshed_at": "2026-08-03T07:00:00Z",
            "source_record_count": 1,
        },
        "semantic_summary": {"feed_status": "current", "annual": []},
    }
    finance_path.write_text(json.dumps(payload), encoding="utf-8")

    status = MODULE.mark_stale(
        finance_path,
        "HTTP 503; token=secret-value",
        datetime(2026, 8, 4, 11, 0, tzinfo=timezone.utc),
    )
    retained = json.loads(finance_path.read_text(encoding="utf-8"))

    assert status["feed_status"] == "stale"
    assert retained["actual_invoices"] == payload["actual_invoices"]
    assert retained["semantic_summary"]["feed_status"] == "stale"
    assert "secret-value" not in json.dumps(retained)
    assert "secret-value" not in MODULE.sanitized_reason(Exception("token=secret-value"))


def test_config_requires_only_named_environment_variables(monkeypatch):
    for name in (
        "LANDCARE_POWERBI_TENANT_ID",
        "LANDCARE_POWERBI_CLIENT_ID",
        "LANDCARE_POWERBI_CERTIFICATE_PATH",
        "LANDCARE_POWERBI_CERTIFICATE_THUMBPRINT",
    ):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(MODULE.PowerBIError, match="configuration is incomplete"):
        MODULE.PowerBIConfig.from_env()


def test_client_uses_workspace_dataset_and_bearer_token(tmp_path):
    session = FakeSession()
    client = MODULE.PowerBIClient(config(tmp_path), session=session, token_provider=lambda _: "test-access-token")

    assert client.latest_refresh()["status"] == "Completed"
    assert client.execute_dax("EVALUATE ROW(\"ok\", 1)") == [{"[Year]": 2026}]
    assert all(MODULE.DEFAULT_WORKSPACE_ID in call[1] and MODULE.DEFAULT_DATASET_ID in call[1] for call in session.calls)
    assert all(call[2]["headers"]["Authorization"] == "Bearer test-access-token" for call in session.calls)


def test_client_rejects_malformed_query_response(tmp_path):
    session = FakeSession()
    session.post = lambda *args, **kwargs: FakeResponse({"results": []})
    client = MODULE.PowerBIClient(config(tmp_path), session=session, token_provider=lambda _: "token")
    with pytest.raises(MODULE.PowerBIError, match="unexpected response"):
        client.execute_dax("EVALUATE ROW(\"ok\", 1)")


def test_percentage_accepts_power_bi_decimal_format():
    assert MODULE.percentage(0.5922518) == 59.23
