# Power BI LandCare finance source

## Intended production role

The Power BI **Land Care Budget** semantic model is the authoritative secure report source for the KPI dashboard. NetSuite remains the upstream accounting system. The former 7 AM semantic extraction path is deprecated and is not required for the embedded Land Care Budget or Parcel Area pages.

| Setting | Value |
|---|---|
| Workspace | `GIS Dashboards` (`A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5`) |
| Semantic model | `924c6c0b-6e29-41cf-9775-562ca646953a` |
| Land Care Budget page | `fe756b7016e6baa7351e` |
| Parcel Area Distribution page | `4a5502453e9080b7a655` |
| Required filter | `LandCare Check Requests[Item Type] = Landcare` |
| Excluded page/scope | Maintenance Expenses |
| Public grain | Year, quarter, and month by contractor |

The native public KPI views never call the Power BI API. They read the sanitized GitHub Pages JSON contract, so Entra credentials and model permissions remain on the VM. The separate Land Care Budget tab is a secure Microsoft-authenticated iframe and follows each viewer's Power BI permissions.

The KPI page embeds report page `fe756b7016e6baa7351e`, which is the **Land Care Budget** page. Page `8c93bab49c96aa8e3bd2` is the Maintenance Check Requests page and must not be used. The iframe is not Publish to web. Overview, Quarterly Reporting, and Parcel Area remain native operational views, while the former Budget, Check Requests, and Expenses tabs are consolidated into this embedded finance workspace.

The Parcel Area tab embeds only the secure **Parcel Area Distribution** page, `4a5502453e9080b7a655`. The dashboard month/period controls and the former native contractor table are hidden on this tab. Organization and period filtering are handled inside Power BI, so ArcGIS assignment square footage is never substituted for the governed report.

Do not automate the authenticated report DOM or a browser CSV download. Power BI's **Show as a table** and **Export data** actions are useful for supervised reconciliation, but unattended extraction must use the semantic model Execute Queries API. Browser markup, visual identifiers, sessions, and download behavior are not a stable data contract.

## Deployment status audited August 5, 2026

| Path | Status | Evidence |
|---|---|---|
| Secure Land Care Budget iframe | Live | The authenticated report showed `Data updated 8/5/26`, `$458,995.17` spent, `59.23%`, Q1 `$188,579.00`, Q2 `$192,318.50`, and Q3 `$78,097.67`. |
| Power BI to `finance_summary.json` | Not certified live | The checked-in August 4 contract has no `semantic_summary`; `actual_invoice_source.source_system` is `NetSuite` and `metadata.source_kind` is `landcare_budget_workbook_plus_netsuite_check_requests`. |
| 7 AM semantic extraction | Deprecated | The code remains as an optional future aggregate-export path, but it is not part of current production. |
| Workspace administration | Access pending | The audited user can view the shared report but cannot open workspace `A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5`. Refresh history, gateway/source connections, and service-principal Build permission require a workspace administrator. |

Do not describe the native KPI finance feed as Power BI-backed until the published JSON contains `semantic_summary`, `actual_invoice_source.source_system` is `Power BI semantic model`, and the VM status reports `power_bi_finance.feed_status = current`.

See [`powerbi-landcare-dataflow-audit-2026-08-05.md`](powerbi-landcare-dataflow-audit-2026-08-05.md) for the evidence and handover checks.

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
