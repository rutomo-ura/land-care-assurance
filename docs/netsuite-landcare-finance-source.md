# NetSuite LandCare finance source

## Purpose

NetSuite is the upstream accounting source for LandCare check requests. The production KPI feed uses the Power BI Land Care Budget semantic model, which applies the governed `Item Type = Landcare` classification before publishing aggregates.

- The workbook defines contract expectations, term, parcels, and forecast amounts.
- NetSuite supplies the accounting transactions reconciled by saved search 1618.
- Power BI owns the classification and measures used by the KPI dashboard.
- ArcGIS remains the source for assignments, survey evidence, comments, and completion metrics.

## Authoritative NetSuite view

| Item | Value |
|---|---|
| Saved search | `All URA LandCare Check Requests` |
| Saved search ID | `1618` |
| Transaction type | `Check Request` |
| Account | `66220 Property Management : Lawn Maintenance` |
| Supporting report | `All URA LandCare Check Requests`, report ID `697` |
| Funding reference | `All URA LandCare Funding Requests`, report ID `704` |

The funding-request report is a useful reconciliation reference but is not loaded into KPI actuals.

## Reconciliation role

The public app reads `docs/landcare/data/finance_summary.json`, normally generated from Power BI. This NetSuite path remains available for supervised reconciliation.

- `actual_invoices` contains one aggregate row per posting month and current-cycle contractor.
- `other_program_actuals` contains monthly amounts that use the LandCare account but do not map to a current contractor.
- `actual_invoice_source` records report identity, freshness, row counts, and reconciliation totals.
- Document numbers, memos, and transaction-level vendor records are not published.

The August 4, 2026 read-only inspection found 628 saved-search records totaling $4,538,233.89. For the current contract cycle beginning November 1, 2025, 85 records totaled $618,513.87. Of that amount, $592,179.76 mapped to current contractors and $26,334.11 was retained as other LandCare program expense. The latest transaction date was August 4, 2026.

## Manual reconciliation procedure

1. In NetSuite, open saved search `1618`. Do not edit or resave the search.
2. Export CSV. Store the raw file on the secured GIS VM or approved finance share, never in this repository.
3. Rebuild the workbook portion of `finance_summary.json` if contract terms changed.
4. Run:

   ```powershell
   python scripts/ingest_landcare_netsuite_checks.py --source C:\secure\exports\landcare-check-requests.csv
   ```

5. Confirm source count, source total, current-cycle total, contractor total, other-program total, and latest date against NetSuite.
6. Compare the result to the Power BI semantic output at the same timestamp. Do not publish the manual import as current semantic data.

The importer recognizes the current contractor vendor aliases. An unknown vendor remains in `other_program_actuals`; add an alias only after Finance or the LandCare program owner confirms the relationship.

## Interpretation

- Actuals are check requests, not proof that a payment cleared.
- Power BI Land Care Budget values control production quarter and annual KPI totals.
- Account-only NetSuite totals can include maintenance expenses or other program activity and are not equivalent to the semantic `Landcare` classification.
- Other program expenses are disclosed in the data contract but excluded from contractor-to-contract variance.
- A zero for one contractor means no matching check request in that period. It does not prove no work was performed or no liability exists.

## Access and security

Use a named NetSuite account with read-only report access. Never store passwords, session cookies, browser profiles, raw exports, document numbers, or memos in GitHub. See [`powerbi-landcare-finance-source.md`](powerbi-landcare-finance-source.md) for the production feed.
