# LandCare Metrics Context

Last updated: 2026-08-03

This is the operating glossary for the monitoring map, KPI dashboard, daily refresh QA, and supervisor review. It explains which counts are comparable and which counts intentionally come from different source scopes.

## Metric Definitions

| Metric | Definition | Source | Current July 7 value |
|---|---|---|---:|
| Current URA-owned LandCare parcels | Live ArcGIS EPP records where `tags LIKE '%LandCare%'` and `inventory_type = 'URA Owned'` | AGOL `gisdb_gis_epp_parcels_full` | 1,125 |
| Latest assignment month | Latest monthly assignment slice from the live ArcGIS assignment history layer | AGOL `gisdb_gis_regrid_bundle_assignments_history.period_label` | 2026-06 |
| Active assigned | Active assignment records in the selected period/filter | Live AGOL assignment history, with checked-in export fallback | Denominator used by the current Map/KPI filter |
| Request Only | Latest-month assignment rows where maintenance level is `Request Only`; excluded from Active completion denominator | Live AGOL assignment history / fallback export | 34 in checked-in export |
| Complete survey records | Raw survey records whose normalized `parcelnumb` matches an assignment parcel in the selected filter | Browser match of live AGOL surveys to assignment parcel keys | Same numerator shown by Map and KPI; repeated records are retained |
| Unique completed parcels | Distinct assignment parcel keys with at least one matched survey record | Browser diagnostic derived from the same live match | Informational only; not the current completion numerator |
| Open active | Active assignment parcel keys without any matched survey evidence | Unique parcel diagnostic used for follow-up; do not subtract raw complete records | Current action-queue control |
| Active completion % | `Complete survey records / Active assigned` | Live browser metric; static JSON is fallback context | Map and KPI use the same raw-record percentage |
| Blended completion % | `Complete survey records / Assigned total`, including Request Only in the denominator | Live browser metric; static JSON is fallback context | Secondary context only |
| All AGOL survey records | Raw survey features in the live all-period ArcGIS layer for the selected `period_label`; this is the default supervisor-facing survey coverage number | AGOL `gisdb_gis_regrid_surveys` | 219 for 2026-06 |
| Unmatched survey records | Live AGOL survey features whose normalized `parcelnumb` does not match the selected assignment keys | Browser reconciliation of AGOL surveys to AGOL assignment history | Excluded from completion numerator |
| Finance contract parcel count | Parcel count from the budgeting workbook contract scope | `finance_summary.json.summary.parcel_count` | 1,237 |
| Finance annual run rate | Annualized current contract invoice run rate | `finance_summary.json.summary.annual_invoice_run_rate` | $775,000 |

## Source Ownership

| Question | Use this source | Notes |
|---|---|---|
| What is the current LandCare parcel universe? | Live ArcGIS EPP layer | Used by current map view and current inventory cards. |
| What is the monthly assignment denominator? | Live AGOL assignment snapshots: current item `0b4733cb5d204da6ab936c9f6d49e401`, history item `df7d77eb57f14c68b717c2cf3cdaada4` | Checked-in `docs/landcare/data` remains fallback/cache during transition. |
| What survey records exist for a service period? | Live AGOL all-period survey layer | Raw record count is available for the selected filter. |
| What should completion rate use? | Live assignment denominator plus raw assignment-matched survey records | Keep the same raw matched numerator in Map, KPI cards, trends, and line charts. |
| What should finance use? | LandCare budgeting workbook | Finance parcel counts are contract scope, not the same denominator as current EPP or monthly assignments. |

## Reconciliation Rules

- Do not compare `All AGOL survey records` directly to `Complete survey records`; the first includes survey-only rows, the second is filtered to assignment matches.
- Do not compare `Current URA-owned LandCare parcels` directly to `Latest assignment month`; the first is a live current inventory, the second is a monthly historical export.
- The monitoring map defaults to `All survey records` so supervisors see the full live AGOL survey coverage first.
- Use `Complete survey records` as the shared Map/KPI completion count; keep unique completed parcels as a diagnostic.
- Use `Active completion %` as the primary operational KPI. Keep `Blended completion %` as secondary context only.
- Treat `Request Only` as assigned inventory context, not as recurring-survey failure.

## July 7 Source Snapshot

| Area | Value |
|---|---:|
| Published dashboard generated date | 2026-07-07 |
| Latest assignment period | 2026-06-15 |
| Latest survey period in published export | 2026-06-15 |
| Published all-month parcel-month features | 2,776 |
| Published latest-month features | 210 |
| Latest-month status counts | 168 missing, 8 returned, 34 request only |
| Missing geometry rows | 106 |
| Live AGOL survey periods | 30 |
| Live AGOL survey records | 13,577 |
| Live AGOL latest period | 2026-06 |
| Live AGOL latest-period records | 219 |
| Live AGOL current-period assignment records | 1,127 |
| Live AGOL history assignment records | 10,380 |
| Live EPP URA-owned LandCare records | 1,125 |
