# Power BI LandCare finance source

## Production role

The Power BI **Land Care Budget** semantic model is the authoritative finance source for the KPI dashboard. NetSuite remains the upstream accounting system. The 7 AM VM job queries Power BI after its overnight refresh and publishes only aggregate values to `docs/landcare/data/finance_summary.json`.

| Setting | Value |
|---|---|
| Workspace | `GIS Dashboards` (`A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5`) |
| Semantic model | `924c6c0b-6e29-41cf-9775-562ca646953a` |
| Required filter | `LandCare Check Requests[Item Type] = Landcare` |
| Excluded page/scope | Maintenance Expenses |
| Public grain | Year, quarter, and month by contractor |

The public browser never calls Power BI. It reads the sanitized GitHub Pages JSON contract, so Entra credentials and model permissions remain on the VM.

The KPI page also provides a secure iframe of the **Land Care Budget** report page for authorized URA users. The iframe uses Microsoft authentication and existing report permissions; it is not Publish to web. Overview, Quarterly Reporting, and Parcel Area remain native operational views, while the former Budget, Check Requests, and Expenses tabs are consolidated into this embedded finance workspace.

## Semantic mapping

| KPI output | Semantic source |
|---|---|
| Total amount spent | `LandCare Check Requests[Cumulative Total Sum]` |
| Percentage of yearly limit | `LandCare Check Requests[Cumulative Percentage Spent]` |
| Quarter actual | Sum of `LandCare Check Requests[Amount]`, filtered to `Item Type = Landcare` |
| Contractor/month actual | `Date Due`, `Company`, and sum of `Amount`, with the same filter |
| Annual limit | Sum of `LandCare Budgeting Contracts[12-Month Contract Amount]` |
| Contract expectation | Organization, contract dates, invoice amount, and 12-month amount from `LandCare Budgeting Contracts` |

The extractor rejects a result when quarters do not sum to the annual total, monthly contractor aggregates do not sum to the annual total, or the displayed percentage does not equal total divided by limit.

August 4, 2026 acceptance values are `$458,995.17` spent, `$775,000.00` limit, `59.23%`, Q1 `$188,579.00`, Q2 `$192,318.50`, and Q3 `$78,097.67`.

## Administrator setup

1. In Power BI tenant settings, allow service principals to use Power BI APIs and enable semantic-model Execute Queries.
2. Register an Entra application and upload its public certificate. Keep the private certificate only under `C:\srv\secrets\powerbi\` with access limited to the automation account and administrators.
3. Give the service principal Read and Build access to the semantic model. Verify that RLS or SSO does not prevent service-principal queries.
4. Install `requirements-landcare-refresh.txt` in the dashboard virtual environment.
5. Add these names to `C:\srv\secrets\.env`, without copying their values into Git:

   ```text
   LANDCARE_POWERBI_TENANT_ID=
   LANDCARE_POWERBI_CLIENT_ID=
   LANDCARE_POWERBI_CERTIFICATE_PATH=C:\srv\secrets\powerbi\landcare-powerbi.pem
   LANDCARE_POWERBI_CERTIFICATE_THUMBPRINT=
   LANDCARE_POWERBI_WORKSPACE_ID=A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5
   LANDCARE_POWERBI_DATASET_ID=924c6c0b-6e29-41cf-9775-562ca646953a
   ```

6. Run `python scripts/extract_landcare_powerbi_semantic.py --status-output C:\srv\logs\land-care-assurance\powerbi-finance-check.json`, then run the dashboard validator.

## Failure recovery and rollback

- The extractor first confirms that the latest semantic-model refresh completed. A failed or in-progress model is not published.
- Query or authentication failure retains the last successful finance values, marks `feed_status` as `stale`, and lets the GIS refresh continue.
- Review the sanitized `power_bi_finance` block in `daily-refresh-status.json`. Tokens, certificates, assertions, raw responses, documents, and memos must never be logged or committed.
- Rotate the certificate by uploading the replacement public certificate, updating the secured path/thumbprint, testing one manual extraction, then removing the old certificate.
- To roll back, remove the four required Power BI authentication variables. The scheduled job retains the existing published finance contract. Use the NetSuite importer only for supervised reconciliation, not as an automatic replacement for semantic-model values.

The Execute Queries endpoint has no continuation-token pagination. Queries are intentionally aggregated below its row/value limits; a truncated or malformed response fails validation instead of publishing a partial result.
