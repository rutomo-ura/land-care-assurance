# LandCare Current Data QA/QC and Source Inventory

Last updated: 2026-07-09
Review scope: current checked-in dashboard data, live public ArcGIS REST metadata, repository SQL/scripts, generated JSON/GeoJSON manifests, and upstream Regrid daily pipeline in `URA-Data-Repository`.
Important note: PostgreSQL values below come from the latest committed dashboard export metadata on `origin/master`, generated on 2026-07-07. Live ArcGIS counts were checked directly through public REST queries on 2026-07-09.

## Executive Summary

The current LandCare dashboard uses a **hybrid architecture**:

| Source family | What it supplies | Cadence | Web app access |
|---|---|---|---|
| ArcGIS Online `gisdb_gis_regrid_surveys` | Returned survey submissions across all service periods, period list, history-map survey polygons | Daily upstream publish | **Live query at page load** via `docs/landcare/survey-layer.js` |
| ArcGIS Online assignment snapshots | Current-period and historical bundle assignment polygons | Upstream publish from Regrid/bundle workflow | **Live query at page load** via `docs/landcare/assignment-layer.js`; checked-in GeoJSON is fallback/cache |
| ArcGIS Online `gisdb_gis_epp_parcels_full` | Current URA-owned LandCare universe, geometry, districts | Live | Live query in monitoring/KPI apps |
| PostgreSQL export -> `docs/landcare/data` | Static fallback assignment data, owner classification, finance support, historical cache | VM refresh daily 7:00 AM | Static JSON/GeoJSON fallback and QA artifact |
| Excel workbook | Contract/budget, invoice metrics | Manual edits | `finance_summary.json` |

Full architecture: [`docs/landcare-architecture.md`](../docs/landcare-architecture.md). Metric definitions: [`docs/landcare-metrics-context.md`](../docs/landcare-metrics-context.md).

## Source Families (detail)

| Source family | What it supplies | Current refresh evidence | Current QA/QC status | Owner action |
|---|---|---:|---|---|
| ArcGIS Online all-period survey layer | Returned survey evidence for all service periods, `period_label`, history-map survey polygons | AGOL item `a4012693d5d74dd8998610c4d235068d`; service `gisdb_gis_regrid_surveys`; observed 13,577 records, with 219 records in `2026-06` | **Primary runtime source** for survey coverage in web app and KPI snapshot | Monitor via AGOL `dataLastEditDate` and period counts; narrower companion layers can remain convenience layers, not the dashboard contract |
| ArcGIS Online assignment snapshots | Current-period and historical Regrid bundle assignment polygons | Current item `0b4733cb5d204da6ab936c9f6d49e401` has 1,127 records; history item `df7d77eb57f14c68b717c2cf3cdaada4` has 10,380 records | **Primary runtime source** for assignment denominator and contractor/month context | Monitor layer row counts, period stats, and source item IDs; use checked-in GeoJSON only as fallback/cache |
| GIS / ArcGIS Online EPP | Live current parcel universe, current URA-owned LandCare record counts, parcel tags, current contractor assignment, neighborhood/council district context, map geometry for live current view | `gisdb_gis_epp_parcels_full` data last edited 2026-06-30 02:11:41 ET; live query returned 25,022 total records, 1,221 LandCare records, 1,125 URA-owned LandCare records | Usable for current universe. Not sufficient for monthly assurance history by itself | Keep querying live for current-universe cards; reconcile against Postgres monthly facts after each refresh |
| PostgreSQL / PostGIS read-only export | Static fallback assignment cache, returned survey matching backup, owner classification, historical monthly GeoJSON, dashboard metrics | `docs/landcare/data/refresh_manifest.json` generated 2026-07-07; assignments through 2026-06-15; survey completion through 2026-06-15 | Usable as fallback/cache. Runtime assignment and survey coverage now come from AGOL first | Keep read-only export on configured VM for QA/cache/finance support; fail refresh on count drift, stale periods, duplicate parcel-month rows, or missing geometry spikes |
| Excel workbook | Contract/budget, parcel count by contractor for finance view, square footage/acres, invoices, check-request history | `docs/landcare/data/finance_summary.json` generated 2026-07-07 from `\\ura-fs\share\Public\LandCare\Land Care Annual Budgeting and Contracting.xlsx` | Usable for finance view. Manual workbook edits remain a control risk | Validate workbook sheet names, required columns, totals, and parity with `gis.land_care_budgeting_contracts` after loader runs |

## Daily Refresh Requirement

The LandCare dashboard data must be checked and refreshed every day. The production VM should run the daily refresh at **7:00 AM Eastern**, three hours after the upstream Regrid survey pipeline finishes at **4:00 AM Eastern**.

Upstream Regrid automation lives in `URA-Data-Repository` under `\GIS Automations\REGRID`. See `docs/upstream-regrid-survey-pipeline.md`.

| Requirement | Implementation |
|---|---|
| Daily command | `.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance` |
| Task Scheduler setup | `.\scripts\register_landcare_daily_refresh_task.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance`; registers under `Task Scheduler Library\GIS Automations` by default |
| Run log | `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log` |
| Local status artifact | `C:\srv\logs\land-care-assurance\daily-refresh-status.json`; dated copies are written as `daily-refresh-status-YYYY-MM-DD.json` |
| QA runner | `scripts\validate_landcare_daily_refresh.py` |
| Publish policy | Commit and push `docs\landcare\data` only when generated dashboard data changes |
| Success with no data changes | Log successful validation and exit without a commit |
| Failure behavior | Exit nonzero before commit/push if export, rebuild, finance refresh, or QA validation fails |

Upstream VM prerequisites before the 7:00 AM LandCare refresh:

| Upstream requirement | Expected VM state |
|---|---|
| Upstream repo | `C:\srv\URA-Data-Repository` pulled from `URA-GIS-User/URA-Data-Repository` `main` |
| Daily Regrid task | `\GIS Automations\REGRID` runs `regrid_survey_daily_pipeline.py` at 4:00 AM Eastern |
| SQL migration | `sql\regrid_survey_pipeline_migration.sql` applied once to create the raw-submission uniqueness constraint, `gis.regrid_surveys`, and `gis.regrid_survey_unmatched_parcels` |
| AGOL all-period survey item | Item `a4012693d5d74dd8998610c4d235068d` is available and queryable as `gisdb_gis_regrid_surveys`; dashboard runtime reads this item for all service periods |
| AGOL current assignment item | Item `0b4733cb5d204da6ab936c9f6d49e401` is available and queryable as `gisdb_gis_regrid_bundle_assignments_current_period` |
| AGOL history assignment item | Item `df7d77eb57f14c68b717c2cf3cdaada4` is available and queryable as `gisdb_gis_regrid_bundle_assignments_history` |
| Monthly archive | `regrid_survey_monthly_export.py` runs at 4:15 AM on the 15th; G-drive CSV is an archive, not the daily source |

Daily QA/QC fails the run when:

- The PostgreSQL app-ready GeoJSON export is missing, invalid, or empty.
- Any required dashboard JSON/GeoJSON file under `docs\landcare\data` is missing or malformed.
- `refresh_manifest.json` or `finance_summary.json` was not generated on the run date.
- `latest_assignment_period` or `latest_survey_period` moves backward from the previous run.
- `survey_submission_count` or `latest_month_metrics.returned_assigned` decreases within the same survey period or latest month.
- Required counts are zero: all-month features, latest-month features, Active assigned, returned assigned, finance organization count, or finance parcel count.
- Duplicate `(period_month, parcel_key)` records appear in `all_months.geojson`.
- Latest-month status counts do not sum to the latest feature count.
- Missing geometry rows increase by more than the configured tolerance, currently 25 rows compared with the prior KPI summary.

For the broader ESRI + Codex + Task Scheduler operating model, see [`docs/task-scheduler-vm-operations.md`](../docs/task-scheduler-vm-operations.md) and [`docs/landcare-architecture.md`](../docs/landcare-architecture.md).

## Source Lineage

| Data product | Final file or endpoint | GIS source | PostgreSQL export source | Excel source | How it is sourced |
|---|---|---|---|---|---|
| Current parcel universe | Runtime query from `gisdb_gis_epp_parcels_full` FeatureServer | `gisdb_gis_epp_parcels_full` ArcGIS Online layer | Source layer appears to mirror `gis.epp_parcels_full` / `gis.epp_snapshot` context, but dashboard consumes ArcGIS REST directly | None | Monitoring and KPI pages query ArcGIS live with LandCare tag and `inventory_type = 'URA Owned'` filters |
| Historical monthly parcel map | Live AGOL assignment history plus live ArcGIS `gisdb_gis_regrid_surveys`; `docs/landcare/data/all_months.geojson` fallback | Assignment geometry comes from `gisdb_gis_regrid_bundle_assignments_history`; survey polygons come from `gisdb_gis_regrid_surveys` | `prototype/sql/export_prototype_data_readonly.sql` still builds fallback/cache data | None | `docs/landcare/assignment-layer.js` and `docs/landcare/survey-layer.js` query AGOL at page load; fallback uses checked-in GeoJSON |
| Latest monthly parcel map | `docs/landcare/data/latest_month.geojson` | Same as historical monthly map | Derived from the same app-ready Postgres export | None | Filtered by latest available `period_month` during `scripts/build_landcare_web_data.py` |
| Monthly metrics | `docs/landcare/data/monthly_metrics.json` | None directly after export; geometry already attached upstream | Derived from exported parcel-month rows | None | Counts distinct parcel keys by month, Active assigned, total assigned, returned assigned, and completion rate |
| Contractor monthly metrics | `docs/landcare/data/contractor_monthly.json` | None directly after export | Derived from exported parcel-month rows | None | Counts distinct Active assigned and returned parcel keys by contractor and month |
| KPI summary | `docs/landcare/data/kpi_summary.json` | Documents live ArcGIS current-universe source contract | Derived from exported monthly metrics and export metadata | References finance data as separate product | Built by `scripts/build_landcare_web_data.py` |
| Refresh manifest | `docs/landcare/data/refresh_manifest.json` | None directly | Export metadata from app-ready Postgres GeoJSON | None | Records generated date, source file, latest month, feature counts, assignment freshness, and survey freshness |
| Finance summary | `docs/landcare/data/finance_summary.json` | None | Optional parity table: `gis.land_care_budgeting_contracts` after `ContractsDriveToSQL.py` loads workbook | `\\ura-fs\share\Public\LandCare\Land Care Annual Budgeting and Contracting.xlsx`; sheets `2025 - 2027 Cycle` and `Sheet1` | `scripts/build_landcare_finance_data.py` reads workbook directly and publishes finance JSON |
| Finance Postgres export | `docs/landcare/data/finance_contracts.json` if generated | None | `prototype/sql/export_landcare_finance_readonly.sql` reads `gis.land_care_budgeting_contracts` | Workbook is upstream of that table | Optional read-only SQL export after workbook loader runs |

## Current Freshness Snapshot

| Area | Latest observed update | Evidence | Interpretation |
|---|---:|---|---|
| Live ArcGIS current EPP parcel layer | 2026-07-07 REST check | ArcGIS REST count query for `gisdb_gis_epp_parcels_full` | Current live parcel universe is queryable; URA-owned LandCare count is 1,125 |
| Live ArcGIS all-period Regrid survey layer | Observed through `2026-06`; `2026-06` has 219 records; total layer count is 13,577 | AGOL item `gisdb_gis_regrid_surveys`; item ID `a4012693d5d74dd8998610c4d235068d` | Runtime survey coverage across dashboard months; map defaults to all survey records |
| Live ArcGIS assignment snapshots | Current-period layer has 1,127 records; history layer has 10,380 records | AGOL items `0b4733cb5d204da6ab936c9f6d49e401` and `df7d77eb57f14c68b717c2cf3cdaada4` | Runtime assignment denominator for monitoring; static export remains fallback/cache |
| Published monthly dashboard data | Generated 2026-07-07 | `docs/landcare/data/refresh_manifest.json` on `origin/master` | Current daily refresh artifact exists for July 7 |
| Latest assignment period in published data | 2026-06-15 | `refresh_manifest.json` and `kpi_summary.json` | Assignment denominator includes the June 15 service period |
| Latest survey completion period in published data | 2026-06-15 | `refresh_manifest.json` and `kpi_summary.json` | Published survey-completion evidence is current through the June 15 service period |
| Finance dashboard data | Generated 2026-07-07 | `finance_summary.json` metadata on `origin/master` | Finance data was built from the workbook on the same date as the web data refresh |

## Current Counts to Reconcile

| Check | Current value | Source | QA/QC interpretation |
|---|---:|---|---|
| Live ArcGIS total records | 25,022 | `gisdb_gis_epp_parcels_full` REST count | Baseline for service health only, not LandCare scope |
| Live ArcGIS LandCare records | 1,221 | `tags LIKE '%LandCare%'` REST count | Compare to prior 1,221 observation; stable |
| Live ArcGIS URA-owned LandCare records | 1,125 | `tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'` REST count | Current-universe dashboard denominator |
| Live ArcGIS survey periods | 30 | `gisdb_gis_regrid_surveys` grouped REST query | Period list available for runtime survey-month options |
| Live ArcGIS survey records | 13,577 | `gisdb_gis_regrid_surveys` REST count | Raw all-period survey volume |
| Live ArcGIS survey records in 2026-06 | 219 | `period_label = '2026-06'` REST query | Default supervisor-facing survey coverage count |
| Live ArcGIS current assignment records | 1,127 | `gisdb_gis_regrid_bundle_assignments_current_period` REST count | Current assignment snapshot volume |
| Live ArcGIS history assignment records | 10,380 | `gisdb_gis_regrid_bundle_assignments_history` REST count | Historical assignment snapshot volume |
| Live AGOL matched returned assigned in 2026-06 | Recomputed in browser | Normalized `parcelnumb` match between assignment and survey layers | Reconciliation/completion count; intentionally lower than raw survey coverage when rows do not match assignment keys |
| Published all-month URA-owned parcel-month features | 2,776 | `refresh_manifest.json` | Historical fact-row volume after URA ownership filter |
| Published latest-month features | 210 | `refresh_manifest.json` | Latest monthly URA-owned assignment denominator after filtering |
| Latest-month Active assigned | 176 | `kpi_summary.json` | Active denominator for completion rate |
| Latest-month total assigned | 210 | `kpi_summary.json` | Active plus Request Only denominator |
| Latest-month returned assigned | 8 | `kpi_summary.json` | Returned survey evidence matched to Active assigned parcels |
| Latest-month open active | 168 | `assigned_active - returned_assigned` | Operational follow-up queue |
| Latest-month Request Only | 34 | `all_months.geojson` latest-month status counts | Excluded from Active completion denominator |
| Latest-month Active completion | 4.5% | `kpi_summary.json` | Primary completion KPI |
| Latest-month blended completion | 3.8% | `kpi_summary.json` | Secondary KPI; should not replace Active-only completion |
| Missing geometry rows in Postgres export | 106 | `kpi_summary.json` export metadata | Needs trend monitoring; review if this rises after refresh |
| Finance current contract organizations | 9 | `finance_summary.json` | Should reconcile to contractor list expectations |
| Finance contract parcel count | 1,237 | `finance_summary.json` | Does not equal monthly URA-owned dashboard denominator; this is contract scope, not the same filter |
| Finance annual run rate | $775,000.00 | `finance_summary.json` | Matches Power BI reference value captured in prior docs |

## Field-Level Source Classification

| Field / concept | Source family | Primary table, layer, or file | QA/QC check |
|---|---|---|---|
| `parcel_key` | PostgreSQL / GIS | Normalized parcel numbers from `gis.regrid_bundle_assignments`, `gis.pgh_parcels`, `gis.epp_parcels_full`, ArcGIS `parcel_number` | Strip non-digits consistently; detect blank keys; check duplicate parcel-month keys |
| `parcel_number` | GIS / PostgreSQL | ArcGIS `parcel_number`, Postgres assignment `parcelnumb`, parcel geometry tables | Confirm normalized key maps back to expected displayed parcel number |
| `period_month` | PostgreSQL | `gis.regrid_bundle_assignments.period`, `gis.regrid_survey_submissions.period` | Latest month must not move backward; months should be valid `YYYY-MM` |
| `organization` / contractor | PostgreSQL for history; GIS for current | Postgres `assigned_to`, EPP `property_maint_mgr_name`; ArcGIS `property_maint_mgr_name` | Normalize contact suffixes only in analysis, not source; flag null/unassigned |
| `maintenance_level` | PostgreSQL / GIS | Postgres `maintain_level`; fallback from `gis.epp_snapshot.tags`; ArcGIS `tags` | Must resolve to `Active`, `Request Only`, or explicit exception; blank historical values need fallback |
| `assigned_flag` | PostgreSQL | Derived from assignment rows in `gis.regrid_bundle_assignments` | All exported monthly rows should be assigned; fail if false/null unless deliberately supported |
| `returned_flag` | PostgreSQL | Match between `gis.regrid_survey_submissions` and assigned parcel keys | Only Active rows should count toward returned assignment KPI |
| `completion_status` | PostgreSQL derived | `returned`, `missing`, or `request_only` based on level and survey match | Status counts should sum to latest-month feature count |
| `ownership_type` | PostgreSQL derived from owner sources | `analysis.city_epp_properties.owner`, `analysis.assessment_snapshot.propertyowner` | Normalize owner names; specifically test URA and Pittsburgh Land Bank variants |
| `owner_name` | PostgreSQL | City EPP owner first, assessment owner fallback | Flag missing/unknown owner rows and sudden owner-source drift |
| `geometry` | GIS / PostgreSQL | `gis.pgh_parcels.geometry` preferred, `gis.epp_parcels_full.shape` fallback; ArcGIS service geometry for live view | Count missing geometries; confirm valid GeoJSON polygons/multipolygons |
| `neighborhood`, `council_district`, `current_status` | GIS / ArcGIS | `gisdb_gis_epp_parcels_full` fields | Live-current context only unless explicitly added to monthly export |
| contract amounts, invoice amounts, acres, square footage | Excel | LandCare budgeting workbook | Required columns present; totals equal expected contract amount; numeric fields nonnegative |
| check-request notes/history | Excel | Workbook `Sheet1` | Validate organization/date fields and preserve notes as review evidence |

## QA/QC Checklist for Each Refresh

| Stage | Check | Method | Expected result | Severity |
|---|---|---|---|---|
| Access | PostgreSQL connection succeeds | Run `scripts/export_landcare_postgres_data.py` on configured VM with environment credentials | Export completes read-only and writes app-ready GeoJSON | Blocker |
| Access | Excel workbook exists | Run `scripts/build_landcare_finance_data.py`; verify workbook path exists | Finance JSON generated | Blocker for finance refresh |
| Access | ArcGIS current universe query succeeds | REST count query for `gisdb_gis_epp_parcels_full` | Nonzero total and URA-owned LandCare count | Blocker for current dashboard cards |
| Freshness | Assignment period does not move backward | Compare new `latest_assignment_period` to prior manifest | New date is same or later | Blocker |
| Freshness | Survey period does not move backward | Compare new `latest_survey_period` to prior manifest | New date is same or later | Blocker |
| Freshness | Survey submission count does not regress within same period | Compare `survey_submission_count` when `latest_survey_period` unchanged | Same or higher | Blocker |
| Freshness | Returned assigned does not regress within same latest month | Compare `latest_month_metrics.returned_assigned` when `latest_month` unchanged | Same or higher | Blocker |
| Freshness | Survey period not stale | Warn if `latest_survey_period` is more than 45 days old | Within tolerance or explained | Warning |
| Freshness | Generated date is current | Check `generated_on` in manifest and output files | Matches refresh date | Warning if stale |
| Volume | Export has rows | `all_month_feature_count > 0` | Nonzero | Blocker |
| Volume | Latest month has rows | `latest_month_feature_count > 0` | Nonzero | Blocker |
| Volume | Current live ArcGIS count reconciles | Compare live URA-owned LandCare count to latest monthly denominator and finance parcel count with documented scope differences | Differences explained by scope, timing, or source type | Warning |
| Completeness | Missing geometry is within tolerance | Compare `missing_geometry_rows` to prior refresh | No unexplained spike | Warning / Blocker if map coverage breaks |
| Duplicates | No duplicate parcel-month facts | Count unique `(period_month, parcel_key)` in source export | Unique count equals fact-row count after dedupe rule | Blocker |
| Status logic | Status counts reconcile | `returned + missing + request_only + exceptions = latest_month_feature_count` | Exact match | Blocker |
| Completion logic | Active-only completion is separate | Active denominator excludes Request Only | Published `active_completion_rate_pct` calculated from Active rows only | Blocker |
| Ownership | URA filter is applied for web monthly data | Confirm `ownership_scope = URA owned only` and all features have `ownership_type = URA` in published monthly files | Exact match for current intended public scope | Blocker |
| Finance | Workbook required sheets exist | Read `2025 - 2027 Cycle` and `Sheet1` | Both present | Blocker |
| Finance | Finance totals reconcile | Sum monthly invoice, annual run rate, total contract, and parcel count | Totals match `finance_summary.json` and expected Power BI references | Warning / Blocker if public numbers differ |
| Contract | Metadata records source lineage | Check `source_tables`, `source_file`, `source_kind`, `generated_on` | Present in all published summary files | Warning |
| Publish | JSON/GeoJSON valid | Parse all files under `docs/landcare/data` | No parse errors | Blocker |
| Publish | Dashboard smoke test | Open monitoring and KPI pages after refresh | Cards, filters, map, and finance tabs render | Blocker |

## Known Source Gaps and Controls

| Gap | Why it matters | Current control | Recommended next control |
|---|---|---|---|
| ArcGIS current universe is live, but monthly history is checked-in static JSON | Live cards can differ from monthly history after source edits | `source_contract` in `kpi_summary.json` documents this split | Add a reconciliation panel or refresh log that shows live count versus latest exported monthly count |
| ArcGIS Regrid survey layer vs Postgres survey periods | AGOL layer is rebuilt daily upstream from `gis.regrid_surveys`; Postgres raw submissions remain the source of truth | `docs/upstream-regrid-survey-pipeline.md` and upstream `docs/regrid-survey-pipeline.md` document the split | Compare AGOL `gisdb_gis_regrid_surveys` period counts and max `period` to `gis.regrid_survey_submissions`; monitor `gis.regrid_survey_unmatched_parcels` for geometry-match issues |
| Finance workbook is manually maintained | Manual edits can change totals or column names | Script validates workbook existence and reads fixed sheet names | Add schema validation for required columns and an exception report for null dates, null organizations, and negative amounts |
| Ownership definitions differ by source and dashboard | URA-owned counts can differ across ArcGIS, Postgres export, finance contract list, and Power BI | Owner-name normalization in SQL and explicit `ownership_scope` metadata | Create a single ownership QA query with URA/PLB/City/Other counts before each export |
| Missing geometry rows exist in Postgres export | Parcels without geometry are absent from map outputs | Export metadata records `missing_geometry_rows = 106` | Log missing parcel keys to a separate QA artifact for GIS repair |

## Refresh Commands and Evidence

Run the full daily checked refresh on the configured VM:

```powershell
.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance
```

Register the daily 7:00 AM Task Scheduler job:

```powershell
.\scripts\register_landcare_daily_refresh_task.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance
```

Run Postgres export only:

```powershell
python scripts\export_landcare_postgres_data.py
```

Rebuild public monitoring and KPI data:

```powershell
python scripts\build_landcare_web_data.py
```

Rebuild finance data from the workbook:

```powershell
python scripts\build_landcare_finance_data.py
```

Optional direct finance export from PostgreSQL after workbook loader:

```powershell
psql "host=10.0.101.57 port=5432 dbname=gisdb user=rutomo" --tuples-only --no-align --output docs/landcare/data/finance_contracts.json --file prototype/sql/export_landcare_finance_readonly.sql
```

Validate existing generated outputs without rebuilding:

```powershell
python scripts\validate_landcare_daily_refresh.py
```

## Source-of-Truth Rules

| Question | Use this source first | Reason |
|---|---|---|
| What is the current URA-owned LandCare parcel universe today? | ArcGIS `gisdb_gis_epp_parcels_full` live query | It is the freshest current-state layer and was edited on 2026-06-30 |
| What was assigned and returned for a reporting month? | PostgreSQL read-only export from `gis.regrid_bundle_assignments` and `gis.regrid_survey_submissions` | It creates the monthly denominator and survey match needed for completion metrics |
| What geometry should the monthly map display? | Postgres export geometry from `gis.pgh_parcels`, with `gis.epp_parcels_full` fallback | It attaches geometry to monthly facts at export time |
| What is contractor budget, invoice, acreage, and check-request history? | LandCare budgeting workbook, with optional parity to `gis.land_care_budgeting_contracts` | The workbook is the currently documented finance source and upstream of the Postgres finance table |
| What should Power BI consume? | Same generated dashboard data contract where possible | Avoids separate metric definitions between the web dashboard and Power BI |
