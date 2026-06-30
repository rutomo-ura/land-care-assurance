# LandCare Current Data QA/QC and Source Inventory

Last updated: 2026-06-30  
Review scope: current checked-in dashboard data, live public ArcGIS REST metadata, repository SQL/scripts, and generated JSON/GeoJSON manifests.  
Important note: PostgreSQL values below come from the committed read-only export metadata generated on 2026-06-24, not a fresh direct database query from this session.

## Executive Summary

The current LandCare dashboard data is a three-source pipeline:

| Source family | What it supplies | Current refresh evidence | Current QA/QC status | Owner action |
|---|---|---:|---|---|
| GIS / ArcGIS Online | Live current parcel universe, current URA-owned LandCare record counts, parcel tags, current contractor assignment, neighborhood/council district context, map geometry for live current view | `gisdb_gis_epp_parcels_full` data last edited 2026-06-30 02:11:41 ET; live query returned 25,022 total records, 1,221 LandCare records, 1,125 URA-owned LandCare records | Usable for current universe. Not sufficient for monthly assurance history by itself | Keep querying live for current-universe cards; reconcile against Postgres monthly facts after each refresh |
| PostgreSQL / PostGIS read-only export | Monthly parcel-assignment denominator, returned survey matching, owner classification, historical monthly GeoJSON, dashboard metrics | `docs/landcare/data/refresh_manifest.json` generated 2026-06-24; assignments through 2026-06-15; survey completion through 2026-05-15 | Usable for published monthly history. Needs direct DB refresh validation before next production update | Run read-only export on configured VM; fail refresh on count drift, stale periods, duplicate parcel-month rows, or missing geometry spikes |
| Excel workbook | Contract/budget, parcel count by contractor for finance view, square footage/acres, invoices, check-request history | `docs/landcare/data/finance_summary.json` generated 2026-06-24 from `\\ura-fs\share\Public\LandCare\Land Care Annual Budgeting and Contracting.xlsx` | Usable for finance view. Manual workbook edits remain a control risk | Validate workbook sheet names, required columns, totals, and parity with `gis.land_care_budgeting_contracts` after loader runs |

## Daily Refresh Requirement

The LandCare dashboard data must be checked and refreshed every day. The production VM should run the daily refresh at 7:00 AM Eastern after the existing overnight source jobs finish.

| Requirement | Implementation |
|---|---|
| Daily command | `.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance` |
| Task Scheduler setup | `.\scripts\register_landcare_daily_refresh_task.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance`; registers under `Task Scheduler Library\GIS Automations` by default |
| Run log | `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log` |
| QA runner | `scripts\validate_landcare_daily_refresh.py` |
| Publish policy | Commit and push `docs\landcare\data` only when generated dashboard data changes |
| Success with no data changes | Log successful validation and exit without a commit |
| Failure behavior | Exit nonzero before commit/push if export, rebuild, finance refresh, or QA validation fails |

Daily QA/QC fails the run when:

- The PostgreSQL app-ready GeoJSON export is missing, invalid, or empty.
- Any required dashboard JSON/GeoJSON file under `docs\landcare\data` is missing or malformed.
- `refresh_manifest.json` or `finance_summary.json` was not generated on the run date.
- `latest_assignment_period` or `latest_survey_period` moves backward from the previous run.
- Required counts are zero: all-month features, latest-month features, Active assigned, returned assigned, finance organization count, or finance parcel count.
- Duplicate `(period_month, parcel_key)` records appear in `all_months.geojson`.
- Latest-month status counts do not sum to the latest feature count.
- Missing geometry rows increase by more than the configured tolerance, currently 25 rows compared with the prior KPI summary.

## Source Lineage

| Data product | Final file or endpoint | GIS source | PostgreSQL export source | Excel source | How it is sourced |
|---|---|---|---|---|---|
| Current parcel universe | Runtime query from `gisdb_gis_epp_parcels_full` FeatureServer | `gisdb_gis_epp_parcels_full` ArcGIS Online layer | Source layer appears to mirror `gis.epp_parcels_full` / `gis.epp_snapshot` context, but dashboard consumes ArcGIS REST directly | None | Monitoring and KPI pages query ArcGIS live with LandCare tag and `inventory_type = 'URA Owned'` filters |
| Historical monthly parcel map | `docs/landcare/data/all_months.geojson` | Geometry originates from `gis.pgh_parcels` and `gis.epp_parcels_full`; current maintenance fallback from `gis.epp_snapshot` | `prototype/sql/export_prototype_data_readonly.sql` joins assignment, survey, geometry, and owner tables | None | `scripts/export_landcare_postgres_data.py` writes `prototype/source/app_ready_parcels_monthly.geojson`; `scripts/build_landcare_web_data.py` publishes web GeoJSON |
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
| Live ArcGIS current EPP parcel layer | 2026-06-30 02:11:41 ET | ArcGIS REST `editingInfo.dataLastEditDate` for `gisdb_gis_epp_parcels_full` | Current live parcel universe appears fresh as of this review date |
| Live ArcGIS Regrid survey layer | 2026-05-21 13:24:25 ET service edit; survey `created_at` range 2023-11-15 through 2025-06-15 | ArcGIS REST metadata and statistics for `gisdb_gis_regrid_surveys` | Useful survey source candidate, but not current enough to replace Postgres survey submissions without reconciliation |
| Published monthly dashboard data | Generated 2026-06-24 | `docs/landcare/data/refresh_manifest.json` and file timestamps | Checked-in web data is six days old as of 2026-06-30 |
| Latest assignment period in published data | 2026-06-15 | `refresh_manifest.json` and `kpi_summary.json` | Assignment denominator includes the June 15 load date, while comparable monthly dashboard history is through May 2026 |
| Latest survey completion period in published data | 2026-05-15 | `refresh_manifest.json` and `kpi_summary.json` | Survey-completion evidence is current through the May 15 survey period in the checked-in export |
| Finance dashboard data | Generated 2026-06-24 | `finance_summary.json` metadata | Finance data was built from the workbook on the same date as the web data refresh |

## Current Counts to Reconcile

| Check | Current value | Source | QA/QC interpretation |
|---|---:|---|---|
| Live ArcGIS total records | 25,022 | `gisdb_gis_epp_parcels_full` REST count | Baseline for service health only, not LandCare scope |
| Live ArcGIS LandCare records | 1,221 | `tags LIKE '%LandCare%'` REST count | Compare to prior 1,221 observation; stable |
| Live ArcGIS URA-owned LandCare records | 1,125 | `tags LIKE '%LandCare%' AND inventory_type = 'URA Owned'` REST count | Current-universe dashboard denominator |
| Published all-month URA-owned parcel-month features | 2,660 | `refresh_manifest.json` | Historical fact-row volume after URA ownership filter |
| Published latest-month features | 222 | `refresh_manifest.json` | Latest monthly URA-owned assignment denominator after filtering |
| Latest-month Active assigned | 186 | `kpi_summary.json` | Active denominator for completion rate |
| Latest-month total assigned | 222 | `kpi_summary.json` | Active plus Request Only denominator |
| Latest-month returned assigned | 96 | `kpi_summary.json` | Returned survey evidence matched to Active assigned parcels |
| Latest-month Active completion | 51.6% | `kpi_summary.json` | Primary completion KPI |
| Latest-month blended completion | 43.2% | `kpi_summary.json` | Secondary KPI; should not replace Active-only completion |
| Missing geometry rows in Postgres export | 103 | `kpi_summary.json` export metadata | Needs trend monitoring; review if this rises after refresh |
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
| ArcGIS Regrid survey layer is stale relative to Postgres survey periods | It cannot currently replace Postgres survey submissions | Treat it as a candidate only | Compare ArcGIS `gisdb_gis_regrid_surveys` to `gis.regrid_survey_submissions` by max date and parcel count |
| Finance workbook is manually maintained | Manual edits can change totals or column names | Script validates workbook existence and reads fixed sheet names | Add schema validation for required columns and an exception report for null dates, null organizations, and negative amounts |
| Ownership definitions differ by source and dashboard | URA-owned counts can differ across ArcGIS, Postgres export, finance contract list, and Power BI | Owner-name normalization in SQL and explicit `ownership_scope` metadata | Create a single ownership QA query with URA/PLB/City/Other counts before each export |
| Missing geometry rows exist in Postgres export | Parcels without geometry are absent from map outputs | Export metadata records `missing_geometry_rows = 103` | Log missing parcel keys to a separate QA artifact for GIS repair |

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
