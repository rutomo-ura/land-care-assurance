# LandCare Metrics Context

Last updated: 2026-07-07

This is the operating glossary for the monitoring map, KPI dashboard, daily refresh QA, and supervisor review. It explains which counts are comparable and which counts intentionally come from different source scopes.

## Metric Definitions

| Metric | Definition | Source | Current July 7 value |
|---|---|---|---:|
| Current URA-owned LandCare parcels | Live ArcGIS EPP records where `tags LIKE '%LandCare%'` and `inventory_type = 'URA Owned'` | AGOL `gisdb_gis_epp_parcels_full` | 1,125 |
| Latest assignment month | Latest monthly assignment slice published from PostgreSQL | `refresh_manifest.json.latest_month` | 2026-06 |
| Active assigned | Distinct latest-month parcel keys where maintenance level is `Active` | `kpi_summary.json.latest_month_metrics.assigned_active` | 176 |
| Request Only | Latest-month assignment rows where maintenance level is `Request Only`; excluded from Active completion denominator | `all_months.geojson` / status counts | 34 |
| Returned assigned | Active assigned parcel keys with matched survey evidence in the published export | `kpi_summary.json.latest_month_metrics.returned_assigned` | 8 |
| Open active | Active assigned parcel keys without returned evidence | Active assigned minus returned assigned | 168 |
| Active completion % | `Returned assigned / Active assigned` | `kpi_summary.json.latest_month_metrics.active_completion_rate_pct` | 4.5% |
| Blended completion % | `Returned assigned / Assigned total`, including Request Only in the denominator | `kpi_summary.json.latest_month_metrics.blended_completion_rate_pct` | 3.8% |
| All AGOL survey records | Raw survey features in the live all-period ArcGIS layer for the selected `period_label` | AGOL `gisdb_gis_regrid_surveys` | 57 for 2026-06 |
| Matched returned surveys | Live AGOL survey features whose normalized `parcelnumb` matches returned Active assignment parcel keys | Monitoring map matched survey mode | 5 for 2026-06 |
| Finance contract parcel count | Parcel count from the budgeting workbook contract scope | `finance_summary.json.summary.parcel_count` | 1,237 |
| Finance annual run rate | Annualized current contract invoice run rate | `finance_summary.json.summary.annual_invoice_run_rate` | $775,000 |

## Source Ownership

| Question | Use this source | Notes |
|---|---|---|
| What is the current LandCare parcel universe? | Live ArcGIS EPP layer | Used by current map view and current inventory cards. |
| What is the monthly assignment denominator? | PostgreSQL export published to `docs/landcare/data` | Assignments remain static/exported until the assignment layer is migrated. |
| What survey records exist for a service period? | Live AGOL all-period survey layer | Raw records can exceed matched returned counts because not every survey row maps to the current URA assignment denominator. |
| What should completion rate use? | Published assignment denominator plus matched returned evidence | Use Active completion for operating review. |
| What should finance use? | LandCare budgeting workbook | Finance parcel counts are contract scope, not the same denominator as current EPP or monthly assignments. |

## Reconciliation Rules

- Do not compare `All AGOL survey records` directly to `Returned assigned`; the first is raw survey volume, the second is assignment-matched evidence.
- Do not compare `Current URA-owned LandCare parcels` directly to `Latest assignment month`; the first is a live current inventory, the second is a monthly historical export.
- Use the monitoring map survey toggle to inspect both views:
  - `Matched returned` = assurance join view.
  - `All survey records` = full live AGOL survey layer for the selected period.
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
| Live AGOL survey records | 13,415 |
| Live AGOL latest period | 2026-06 |
| Live AGOL latest-period records | 57 |
| Live EPP URA-owned LandCare records | 1,125 |
