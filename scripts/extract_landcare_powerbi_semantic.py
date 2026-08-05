from __future__ import annotations

import argparse
import json
import os
import re
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable

try:
    import msal
except ImportError:  # pragma: no cover - deployment dependency is checked at runtime.
    msal = None
try:
    import requests
except ImportError:  # pragma: no cover - deployment dependency is checked at runtime.
    requests = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FINANCE = ROOT / "docs" / "landcare" / "data" / "finance_summary.json"
DEFAULT_WORKSPACE_ID = "A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5"
DEFAULT_DATASET_ID = "924c6c0b-6e29-41cf-9775-562ca646953a"
POWER_BI_SCOPE = ["https://analysis.windows.net/powerbi/api/.default"]
ITEM_TYPE = "Landcare"


HEADLINE_DAX = """
EVALUATE
SUMMARIZECOLUMNS(
  'LandCare Check Requests'[Year],
  TREATAS({\"Landcare\"}, 'LandCare Check Requests'[Item Type]),
  \"TotalAmountSpent\", 'LandCare Check Requests'[Cumulative Total Sum],
  \"PercentageSpent\", 'LandCare Check Requests'[Cumulative Percentage Spent]
)
""".strip()

QUARTER_DAX = """
EVALUATE
SUMMARIZECOLUMNS(
  'LandCare Check Requests'[Year],
  'LandCare Check Requests'[Quarter],
  TREATAS({\"Landcare\"}, 'LandCare Check Requests'[Item Type]),
  \"AmountSpent\", SUM('LandCare Check Requests'[Amount])
)
""".strip()

MONTHLY_CONTRACTOR_DAX = """
EVALUATE
SUMMARIZECOLUMNS(
  'LandCare Check Requests'[Date Due],
  'LandCare Check Requests'[Company],
  TREATAS({\"Landcare\"}, 'LandCare Check Requests'[Item Type]),
  \"AmountSpent\", SUM('LandCare Check Requests'[Amount])
)
""".strip()

CONTRACT_DAX = """
EVALUATE
SUMMARIZECOLUMNS(
  'LandCare Budgeting Contracts'[Organization],
  'LandCare Budgeting Contracts'[Start Date],
  'LandCare Budgeting Contracts'[End Date],
  \"InvoiceAmount\", SUM('LandCare Budgeting Contracts'[Invoice Amount]),
  \"TwelveMonthContractAmount\", SUM('LandCare Budgeting Contracts'[12-Month Contract Amount]),
  \"ProjectedYearlyLimit\", SUM('LandCare Budgeting Contracts'[Projected Yearly Limit])
)
""".strip()


class PowerBIError(RuntimeError):
    pass


@dataclass(frozen=True)
class PowerBIConfig:
    tenant_id: str
    client_id: str
    certificate_path: Path
    certificate_thumbprint: str
    workspace_id: str = DEFAULT_WORKSPACE_ID
    dataset_id: str = DEFAULT_DATASET_ID
    area_query_path: Path | None = None

    @classmethod
    def from_env(cls) -> "PowerBIConfig":
        names = {
            "tenant_id": "LANDCARE_POWERBI_TENANT_ID",
            "client_id": "LANDCARE_POWERBI_CLIENT_ID",
            "certificate_path": "LANDCARE_POWERBI_CERTIFICATE_PATH",
            "certificate_thumbprint": "LANDCARE_POWERBI_CERTIFICATE_THUMBPRINT",
        }
        missing = [env_name for env_name in names.values() if not os.environ.get(env_name)]
        if missing:
            raise PowerBIError(f"Power BI configuration is incomplete; missing {', '.join(missing)}")
        return cls(
            tenant_id=os.environ[names["tenant_id"]],
            client_id=os.environ[names["client_id"]],
            certificate_path=Path(os.environ[names["certificate_path"]]),
            certificate_thumbprint=os.environ[names["certificate_thumbprint"]],
            workspace_id=os.environ.get("LANDCARE_POWERBI_WORKSPACE_ID", DEFAULT_WORKSPACE_ID),
            dataset_id=os.environ.get("LANDCARE_POWERBI_DATASET_ID", DEFAULT_DATASET_ID),
            area_query_path=Path(os.environ["LANDCARE_POWERBI_AREA_QUERY_PATH"])
            if os.environ.get("LANDCARE_POWERBI_AREA_QUERY_PATH") else None,
        )


def acquire_access_token(config: PowerBIConfig) -> str:
    if msal is None:
        raise PowerBIError("The msal dependency is not installed")
    if not config.certificate_path.is_file():
        raise PowerBIError("Power BI certificate file was not found")
    private_key = config.certificate_path.read_text(encoding="utf-8")
    app = msal.ConfidentialClientApplication(
        config.client_id,
        authority=f"https://login.microsoftonline.com/{config.tenant_id}",
        client_credential={
            "private_key": private_key,
            "thumbprint": config.certificate_thumbprint,
        },
    )
    result = app.acquire_token_for_client(scopes=POWER_BI_SCOPE)
    token = result.get("access_token")
    if not token:
        raise PowerBIError(f"Power BI authentication failed: {result.get('error', 'token unavailable')}")
    return str(token)


class PowerBIClient:
    def __init__(
        self,
        config: PowerBIConfig,
        *,
        session: requests.Session | None = None,
        token_provider: Callable[[PowerBIConfig], str] = acquire_access_token,
        timeout: int = 60,
    ) -> None:
        if requests is None and session is None:
            raise PowerBIError("The requests dependency is not installed")
        self.config = config
        self.session = session or requests.Session()
        self.token_provider = token_provider
        self.timeout = timeout
        self._token: str | None = None

    @property
    def base_url(self) -> str:
        return (
            "https://api.powerbi.com/v1.0/myorg/groups/"
            f"{self.config.workspace_id}/datasets/{self.config.dataset_id}"
        )

    def _headers(self) -> dict[str, str]:
        if not self._token:
            self._token = self.token_provider(self.config)
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    def latest_refresh(self) -> dict[str, Any]:
        response = self.session.get(
            f"{self.base_url}/refreshes?$top=1",
            headers=self._headers(),
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise PowerBIError(f"Power BI refresh-history request failed with HTTP {response.status_code}")
        rows = response.json().get("value") or []
        if not rows:
            raise PowerBIError("Power BI refresh history is empty")
        refresh = rows[0]
        if str(refresh.get("status", "")).casefold() != "completed":
            raise PowerBIError(f"Latest Power BI refresh is {refresh.get('status', 'unknown')}")
        return refresh

    def execute_dax(self, dax: str) -> list[dict[str, Any]]:
        response = self.session.post(
            f"{self.base_url}/executeQueries",
            headers=self._headers(),
            json={"queries": [{"query": dax}], "serializerSettings": {"includeNulls": True}},
            timeout=self.timeout,
        )
        if response.status_code >= 400:
            raise PowerBIError(f"Power BI semantic query failed with HTTP {response.status_code}")
        try:
            return response.json()["results"][0]["tables"][0].get("rows", [])
        except (KeyError, IndexError, TypeError) as exc:
            raise PowerBIError("Power BI semantic query returned an unexpected response") from exc


def normalized_row(row: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in row.items():
        match = re.search(r"\[([^]]+)\]$", str(key))
        result[(match.group(1) if match else str(key)).casefold()] = value
    return result


def number(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return round(float(value), 2)


def percentage(value: Any) -> float:
    raw = float(value or 0)
    return round(raw * 100 if abs(raw) <= 1 else raw, 2)


def iso_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    raw = str(value).strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}", raw):
        return raw[:10]
    for pattern in ("%m/%d/%Y", "%Y-%m-%dT%H:%M:%S", "%B %d, %Y"):
        try:
            return datetime.strptime(raw, pattern).date().isoformat()
        except ValueError:
            continue
    raise PowerBIError(f"Unsupported semantic-model date: {raw!r}")


def quarter_key(year: Any, quarter: Any) -> str:
    year_text = str(int(float(year)))
    match = re.search(r"([1-4])", str(quarter))
    if not match:
        raise PowerBIError(f"Unsupported semantic-model quarter: {quarter!r}")
    return f"{year_text}-Q{match.group(1)}"


def slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def load_area_dax(config: PowerBIConfig) -> str | None:
    if config.area_query_path is None:
        return None
    if not config.area_query_path.is_file():
        raise PowerBIError("Power BI parcel-area query file was not found")
    dax = config.area_query_path.read_text(encoding="utf-8").strip()
    if not dax:
        raise PowerBIError("Power BI parcel-area query file is empty")
    return dax


def fetch_semantic_rows(client: PowerBIClient, area_dax: str | None = None) -> dict[str, Any]:
    rows = {
        "refresh": client.latest_refresh(),
        "headline": client.execute_dax(HEADLINE_DAX),
        "quarters": client.execute_dax(QUARTER_DAX),
        "monthly": client.execute_dax(MONTHLY_CONTRACTOR_DAX),
        "contracts": client.execute_dax(CONTRACT_DAX),
    }
    rows["area"] = client.execute_dax(area_dax) if area_dax else None
    return rows


def aggregate_monthly(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for raw_row in rows:
        row = normalized_row(raw_row)
        posting_date = iso_date(row.get("date due"))
        organization = str(row.get("company") or "").strip()
        if not posting_date or not organization:
            continue
        key = (posting_date[:7], organization)
        group = grouped.setdefault(key, {"amount": 0.0, "count": 0})
        group["amount"] += number(row.get("amountspent"))
        group["count"] += 1
    return [
        {
            "invoice_id": f"PBI-{period_month}-{slug(organization)}",
            "period_month": period_month,
            "posting_date": f"{period_month}-01",
            "organization": organization,
            "actual_amount": round(values["amount"], 2),
            "transaction_count": values["count"],
            "reference": "Power BI Land Care Budget semantic model",
        }
        for (period_month, organization), values in sorted(grouped.items())
    ]


def build_area_summary(
    rows: Iterable[dict[str, Any]], refresh: dict[str, Any], extracted_at: datetime
) -> dict[str, Any]:
    output = []
    for raw_row in rows:
        row = normalized_row(raw_row)
        period_value = row.get("periodmonth") or row.get("period")
        period_date = iso_date(period_value)
        organization = str(row.get("organization") or "").strip()
        if not period_date or not organization:
            continue
        assigned_sqft = number(row.get("assignedsquarefeet") or row.get("sum of parcel square footage"))
        baseline_sqft = number(row.get("baselinearea"))
        lower = number(row.get("lower")) if row.get("lower") not in (None, "") else round(baseline_sqft * 0.9, 2)
        upper = number(row.get("upper")) if row.get("upper") not in (None, "") else round(baseline_sqft * 1.1, 2)
        output.append({
            "period_month": period_date[:7],
            "organization": organization,
            "assigned_sqft": assigned_sqft,
            "assigned_parcels": int(number(row.get("assignedparcels"))) if row.get("assignedparcels") not in (None, "") else None,
            "baseline_sqft": baseline_sqft,
            "lower_limit_sqft": lower,
            "upper_limit_sqft": upper,
        })
    if not output:
        raise PowerBIError("Power BI parcel-area query returned no usable aggregate rows")
    return {
        "status": "available",
        "feed_status": "current",
        "source_system": "Power BI semantic model",
        "report_page": "Parcel Area Distribution",
        "page_id": "4a5502453e9080b7a655",
        "dataset_refreshed_at": refresh.get("endTime") or refresh.get("startTime"),
        "extracted_at": extracted_at.astimezone(timezone.utc).isoformat(),
        "publication_grain": "month and contractor",
        "rows": sorted(output, key=lambda item: (item["period_month"], item["organization"])),
    }


def build_semantic_summary(rows: dict[str, Any], extracted_at: datetime) -> dict[str, Any]:
    headlines: dict[int, dict[str, Any]] = {}
    for raw_row in rows["headline"]:
        row = normalized_row(raw_row)
        year = int(float(row["year"]))
        headlines[year] = {
            "year": year,
            "total_amount_spent": number(row.get("totalamountspent")),
            "percentage_spent": percentage(row.get("percentagespent")),
            "quarters": [],
        }

    contract_rows = [normalized_row(row) for row in rows["contracts"]]
    annual_limit = round(sum(number(row.get("twelvemonthcontractamount")) for row in contract_rows), 2)
    for year_row in headlines.values():
        year_row["yearly_limit"] = annual_limit

    for raw_row in rows["quarters"]:
        row = normalized_row(raw_row)
        key = quarter_key(row.get("year"), row.get("quarter"))
        year = int(key[:4])
        if year not in headlines:
            headlines[year] = {
                "year": year,
                "total_amount_spent": 0.0,
                "percentage_spent": 0.0,
                "yearly_limit": annual_limit,
                "quarters": [],
            }
        headlines[year]["quarters"].append({"quarter": key, "amount_spent": number(row.get("amountspent"))})

    for year_row in headlines.values():
        year_row["quarters"].sort(key=lambda item: item["quarter"])
        quarter_total = round(sum(item["amount_spent"] for item in year_row["quarters"]), 2)
        if quarter_total != year_row["total_amount_spent"]:
            raise PowerBIError(
                f"Power BI annual and quarter totals do not reconcile for {year_row['year']}: "
                f"{year_row['total_amount_spent']:.2f} != {quarter_total:.2f}"
            )
        calculated_percentage = round(100 * year_row["total_amount_spent"] / annual_limit, 2) if annual_limit else 0
        if abs(calculated_percentage - year_row["percentage_spent"]) > 0.01:
            raise PowerBIError(
                f"Power BI percentage does not reconcile for {year_row['year']}: "
                f"{year_row['percentage_spent']:.2f} != {calculated_percentage:.2f}"
            )

    refresh = rows["refresh"]
    return {
        "status": "available",
        "feed_status": "current",
        "source_system": "Power BI semantic model",
        "upstream_source": "NetSuite",
        "workspace_id": DEFAULT_WORKSPACE_ID,
        "dataset_id": DEFAULT_DATASET_ID,
        "item_type_filter": ITEM_TYPE,
        "dataset_refreshed_at": refresh.get("endTime") or refresh.get("startTime"),
        "extracted_at": extracted_at.astimezone(timezone.utc).isoformat(),
        "annual": sorted(headlines.values(), key=lambda item: item["year"]),
    }


def semantic_contracts(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    contracts = []
    for raw_row in rows:
        row = normalized_row(raw_row)
        organization = str(row.get("organization") or "").strip()
        if not organization:
            continue
        contracts.append(
            {
                "organization": organization,
                "start_date": iso_date(row.get("start date")),
                "end_date": iso_date(row.get("end date")),
                "monthly_invoice_amount": number(row.get("invoiceamount")),
                "twelve_month_contract_amount": number(row.get("twelvemonthcontractamount")),
                "annual_invoice_run_rate": number(row.get("twelvemonthcontractamount")),
                "projected_yearly_limit": number(row.get("projectedyearlylimit")),
            }
        )
    return contracts


def merge_contracts(existing: list[dict[str, Any]], semantic: list[dict[str, Any]]) -> list[dict[str, Any]]:
    semantic_by_name = {slug(row["organization"]): row for row in semantic}
    merged = []
    matched: set[str] = set()
    for row in existing:
        key = slug(str(row.get("organization") or ""))
        semantic_row = semantic_by_name.get(key)
        merged.append({**row, **semantic_row} if semantic_row else row)
        if semantic_row:
            matched.add(key)
    merged.extend(row for key, row in semantic_by_name.items() if key not in matched)
    return merged


def atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=path.parent, delete=False) as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    os.replace(temp_path, path)


def apply_semantic_rows(finance: dict[str, Any], rows: dict[str, Any], config: PowerBIConfig, now: datetime) -> dict[str, Any]:
    actuals = aggregate_monthly(rows["monthly"])
    semantic = build_semantic_summary(rows, now)
    semantic["workspace_id"] = config.workspace_id
    semantic["dataset_id"] = config.dataset_id
    contracts = semantic_contracts(rows["contracts"])
    latest_transaction = max((row["posting_date"] for row in actuals), default=None)
    total = round(sum(row["actual_amount"] for row in actuals), 2)
    totals_by_year: dict[int, float] = {}
    for row in actuals:
        year = int(row["period_month"][:4])
        totals_by_year[year] = round(totals_by_year.get(year, 0) + row["actual_amount"], 2)
    for annual in semantic["annual"]:
        if round(totals_by_year.get(annual["year"], 0), 2) != round(annual["total_amount_spent"], 2):
            raise PowerBIError(
                f"Power BI month and annual totals do not reconcile for {annual['year']}: "
                f"{totals_by_year.get(annual['year'], 0):.2f} != {annual['total_amount_spent']:.2f}"
            )

    finance["semantic_summary"] = semantic
    if rows.get("area") is not None:
        area_summary = build_area_summary(rows["area"], rows["refresh"], now)
        area_summary["workspace_id"] = config.workspace_id
        area_summary["dataset_id"] = config.dataset_id
        finance["semantic_area_summary"] = area_summary
    elif finance.get("semantic_area_summary", {}).get("source_system") == "Power BI semantic model":
        finance["semantic_area_summary"]["feed_status"] = "stale"
        finance["semantic_area_summary"]["warning"] = "Parcel-area query is not configured for this extraction."
    else:
        finance["semantic_area_summary"] = {
            "status": "unavailable",
            "feed_status": "unavailable",
            "source_system": "Power BI semantic model",
            "message": "Parcel-area semantic query is not configured.",
            "rows": [],
        }
    finance["semantic_contracts"] = contracts
    finance["current_contracts"] = merge_contracts(finance.get("current_contracts", []), contracts)
    finance["actual_invoices"] = actuals
    finance["other_program_actuals"] = []
    finance["actual_invoice_source"] = {
        "status": "available",
        "feed_status": "current",
        "source_system": "Power BI semantic model",
        "upstream_source": "NetSuite",
        "workspace_id": config.workspace_id,
        "dataset_id": config.dataset_id,
        "item_type_filter": ITEM_TYPE,
        "refreshed_at": semantic["dataset_refreshed_at"],
        "last_success_at": semantic["extracted_at"],
        "latest_transaction_date": latest_transaction,
        "source_record_count": len(rows["monthly"]),
        "current_cycle_contractor_total": total,
        "publication_grain": "month and contractor",
        "privacy_note": "Public output excludes document numbers, memos, tokens, and transaction-level records.",
    }
    finance.setdefault("metadata", {})["generated_on"] = now.date().isoformat()
    finance["metadata"]["source_kind"] = "powerbi_landcare_semantic_model"
    finance["metadata"]["note"] = "Finance metrics are sanitized aggregates from the Power BI Land Care Budget semantic model."
    return finance


def mark_stale(finance_path: Path, reason: str, now: datetime) -> dict[str, Any]:
    reason = sanitized_reason(Exception(reason))
    if not finance_path.exists():
        return {"status": "warning", "feed_status": "unavailable", "attempted_at": now.isoformat(), "message": reason}
    finance = json.loads(finance_path.read_text(encoding="utf-8"))
    source = finance.get("actual_invoice_source", {})
    if source.get("source_system") != "Power BI semantic model" or source.get("status") != "available":
        return {"status": "warning", "feed_status": "unavailable", "attempted_at": now.isoformat(), "message": reason}
    source["feed_status"] = "stale"
    source["last_attempt_at"] = now.astimezone(timezone.utc).isoformat()
    source["warning"] = reason
    finance["actual_invoice_source"] = source
    if isinstance(finance.get("semantic_summary"), dict):
        finance["semantic_summary"]["feed_status"] = "stale"
    if isinstance(finance.get("semantic_area_summary"), dict):
        finance["semantic_area_summary"]["feed_status"] = "stale"
    finance.setdefault("metadata", {})["generated_on"] = now.date().isoformat()
    finance["metadata"]["source_kind"] = "powerbi_landcare_semantic_model"
    finance["metadata"]["note"] = "Retained the last successful Power BI semantic finance aggregates after a refresh warning."
    atomic_write_json(finance_path, finance)
    return {
        "status": "warning",
        "feed_status": "stale",
        "attempted_at": now.astimezone(timezone.utc).isoformat(),
        "last_success_at": source.get("last_success_at"),
        "dataset_refreshed_at": source.get("refreshed_at"),
        "record_count": source.get("source_record_count"),
        "message": reason,
    }


def sanitized_reason(exc: Exception) -> str:
    message = re.sub(r"(?i)(token|assertion|private[_ -]?key)\s*[:=]\s*\S+", r"\1=[redacted]", str(exc))
    return message[:300]


def run(config: PowerBIConfig, finance_path: Path, client: PowerBIClient | None = None, now: datetime | None = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    finance = json.loads(finance_path.read_text(encoding="utf-8"))
    rows = fetch_semantic_rows(client or PowerBIClient(config), load_area_dax(config))
    finance = apply_semantic_rows(finance, rows, config, now)
    atomic_write_json(finance_path, finance)
    source = finance["actual_invoice_source"]
    return {
        "status": "success",
        "feed_status": "current",
        "attempted_at": now.astimezone(timezone.utc).isoformat(),
        "last_success_at": source["last_success_at"],
        "dataset_refreshed_at": source["refreshed_at"],
        "record_count": source["source_record_count"],
        "latest_transaction_date": source["latest_transaction_date"],
        "area_feed_status": finance.get("semantic_area_summary", {}).get("feed_status", "unavailable"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish sanitized LandCare finance aggregates from the Power BI semantic model.")
    parser.add_argument("--finance", type=Path, default=DEFAULT_FINANCE)
    parser.add_argument("--status-output", type=Path)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    try:
        status = run(PowerBIConfig.from_env(), args.finance, now=now)
        print(f"Power BI semantic finance extraction succeeded with {status['record_count']} aggregate row(s).")
    except Exception as exc:  # A finance failure must not block the GIS refresh.
        reason = sanitized_reason(exc)
        status = mark_stale(args.finance, reason, now)
        print(f"WARNING: Power BI semantic finance extraction did not publish new data: {reason}")
    if args.status_output:
        atomic_write_json(args.status_output, status)


if __name__ == "__main__":
    main()
