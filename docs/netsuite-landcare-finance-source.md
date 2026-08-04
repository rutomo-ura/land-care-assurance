# NetSuite LandCare finance source

## Purpose

NetSuite supplies actual LandCare check-request amounts for the KPI dashboard. It complements, but does not replace, the LandCare budgeting workbook:

- The workbook defines contract expectations, term, parcels, and forecast amounts.
- NetSuite supplies actual check requests posted to the LandCare lawn-maintenance account.
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

## Published contract

The public app reads `docs/landcare/data/finance_summary.json`.

- `actual_invoices` contains one aggregate row per posting month and current-cycle contractor.
- `other_program_actuals` contains monthly amounts that use the LandCare account but do not map to a current contractor.
- `actual_invoice_source` records report identity, freshness, row counts, and reconciliation totals.
- Document numbers, memos, and transaction-level vendor records are not published.

The August 4, 2026 read-only inspection found 628 saved-search records totaling $4,538,233.89. For the current contract cycle beginning November 1, 2025, 85 records totaled $618,513.87. Of that amount, $592,179.76 mapped to current contractors and $26,334.11 was retained as other LandCare program expense. The latest transaction date was August 4, 2026.

## Refresh procedure

1. In NetSuite, open saved search `1618`. Do not edit or resave the search.
2. Export CSV. Store the raw file on the secured GIS VM or approved finance share, never in this repository.
3. Rebuild the workbook portion of `finance_summary.json` if contract terms changed.
4. Run:

   ```powershell
   python scripts/ingest_landcare_netsuite_checks.py --source C:\secure\exports\landcare-check-requests.csv
   ```

5. Confirm source count, source total, current-cycle total, contractor total, other-program total, and latest date against NetSuite.
6. Run the repository tests and Pages validation before publishing.

The importer recognizes the current contractor vendor aliases. An unknown vendor remains in `other_program_actuals`; add an alias only after Finance or the LandCare program owner confirms the relationship.

## KPI interpretation

- Actuals are check requests, not proof that a payment cleared.
- Quarterly comparisons use only records in the selected quarter.
- Annual actuals include current-cycle contractor check requests for the selected year.
- Other program expenses are disclosed in the data contract but excluded from contractor-to-contract variance.
- A zero for one contractor means no matching check request in that period. It does not prove no work was performed or no liability exists.

## Access and security

Use a named NetSuite account with read-only report access. Never store passwords, session cookies, browser profiles, raw exports, document numbers, or memos in GitHub. Browser inspection and CSV export must not submit forms, edit records, customize searches, schedule reports, or change NetSuite settings.
