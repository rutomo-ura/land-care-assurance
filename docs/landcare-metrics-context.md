# LandCare Metrics Context

Last updated: 2026-07-09

This is the operating glossary for the monitoring map, KPI dashboard, daily refresh QA, and supervisor review. It explains which counts are comparable and which counts intentionally come from different source scopes.

## Metric Definitions

| Metric | Definition | Source | Current July 7 value |
|---|---|---|---:|
| Current URA-owned LandCare parcels | Live ArcGIS EPP records where `tags LIKE '%LandCare%'` and `inventory_type = 'URA Owned'` | AGOL `gisdb_gis_epp_parcels_full` | 1,125 |
| Latest assignment month | Latest monthly assignment slice from the live ArcGIS assignment history layer | AGOL `gisdb_gis_regrid_bundle_assignments_history.period_label` | 2026-06 |
| Active assigned | Distinct latest-month parcel keys where maintenance level is `Active` | Live AGOL assignment history, with checked-in export fallback | 176 in checked-in export; 1,127 live assignment records for 2026-06 |
| Request Only | Latest-month assignment rows where maintenance level is `Request Only`; excluded from Active completion denominator | Live AGOL assignment history / fallback export | 34 in checked-in export |
| Returned assigned | Active assigned parcel keys with matched survey evidence | Assignment parcel keys matched to live AGOL survey `parcelnumb` | 8 in checked-in export; recomputed in browser from live evidence |
| Open active | Active assigned parcel keys without returned evidence | Active assigned minus returned assigned | 168 |
| Active completion % | `Returned assigned / Active assigned` | `kpi_summary.json.latest_month_metrics.active_completion_rate_pct` | 4.5% |
| Blended completion % | `Returned assigned / Assigned total`, including Request Only in the denominator | `kpi_summary.json.latest_month_metrics.blended_completion_rate_pct` | 3.8% |
| All AGOL survey records | Raw survey features in the live all-period ArcGIS layer for the selected `period_label`; this is the default supervisor-facing survey coverage number | AGOL `gisdb_gis_regrid_surveys` | 219 for 2026-06 |
| Matched returned surveys | Live AGOL survey features whose normalized `parcelnumb` matches Active assignment parcel keys; this is a reconciliation/completion count, not the map default | Browser reconciliation of AGOL surveys to AGOL assignment history | Lower than raw survey coverage when survey rows do not match assignment keys |
| Finance contract parcel count | Parcel count from the budgeting workbook contract scope | `finance_summary.json.summary.parcel_count` | 1,237 |
| Finance annual run rate | Annualized current contract invoice run rate | `finance_summary.json.summary.annual_invoice_run_rate` | $775,000 |

## Source Ownership

| Question | Use this source | Notes |
|---|---|---|
| What is the current LandCare parcel universe? | Live ArcGIS EPP layer | Used by current map view and current inventory cards. |
| What is the monthly assignment denominator? | Live AGOL assignment snapshots: current item `0b4733cb5d204da6ab936c9f6d49e401`, history item `df7d77eb57f14c68b717c2cf3cdaada4` | Checked-in `docs/landcare/data` remains fallback/cache during transition. |
| What survey records exist for a service period? | Live AGOL all-period survey layer | This is the default map/KPI survey coverage number. |
| What should completion rate use? | Live assignment denominator plus matched returned evidence | Do not inflate completion by counting survey-only records as assigned returns. |
| What should finance use? | LandCare budgeting workbook | Finance parcel counts are contract scope, not the same denominator as current EPP or monthly assignments. |

## Reconciliation Rules

- Do not compare `All AGOL survey records` directly to `Returned assigned`; the first is raw survey coverage, the second is assignment-matched evidence.
- Do not compare `Current URA-owned LandCare parcels` directly to `Latest assignment month`; the first is a live current inventory, the second is a monthly historical export.
- The monitoring map defaults to `All survey records` so supervisors see the full live AGOL survey coverage first.
- Use matched returned only as a reconciliation/completion control, not as the only map coverage count.
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
