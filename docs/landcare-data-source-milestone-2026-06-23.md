# LandCare Data Source Milestone - June 23, 2026

This note records the current data-source investigation for the next LandCare monitoring milestone: move beyond the April 2026 static map, use all available data in the dashboard, and determine whether ArcGIS Online already has automated layers that can reduce local pull/push work.

## Current Dashboard State

- The monitoring page now has a data-view selector:
  - `Current ArcGIS Universe` queries ArcGIS Online `gisdb_gis_epp_parcels_full` live at runtime.
  - `Monthly Assurance History` uses `docs/landcare/data/all_months.geojson`, generated from the existing PostgreSQL export artifact.
- The monitoring page now reads `docs/landcare/data/all_months.geojson`, not only `latest_month.geojson`.
- The month selector exposes all available URA-owned parcel-month records from the current export artifact.
- Available months: May 2025, June 2025, July 2025, September 2025, October 2025, November 2025, December 2025, January 2026, February 2026, March 2026, and April 2026.
- Total URA-owned parcel-month records in the web data: `2,415`.
- Latest month still present in the source export: April 2026, with `218` URA-owned assigned parcel records.
- Assignment freshness in the export: May 15, 2026.
- Survey completion freshness in the export: April 15, 2026.
- The current web data was regenerated from `prototype/source/app_ready_parcels_monthly.geojson`; it was not a fresh direct PostgreSQL pull from this machine.
- The live current ArcGIS universe returns `1,125` current URA-owned LandCare records representing `1,124` unique parcel keys.
- The committed `current_universe.geojson` remains as a static fallback/reference artifact. That fallback maps `1,103` records representing `1,102` unique parcel keys, with `22` records omitted because they did not return usable geometry and `1` duplicate parcel key retained as a mapped record.

## Local PostgreSQL Pull Status

Direct refresh from PostgreSQL was not available in this Codex session.

- `C:\srv\secrets\.env` was not present.
- `psql` was not available on PATH.
- The default Python environment did not include the required database/GIS libraries.
- The bundled Python had `pandas`, but not the full PostgreSQL/GIS stack needed for a clean direct pull.

The practical near-term path is either:

- run the existing export from a configured URA machine or scheduled job, then run `python scripts\build_landcare_web_data.py`; or
- move the web app to query ArcGIS hosted layers directly where those layers already carry the required fields.

## ArcGIS Online Layer Findings

Public ArcGIS REST checks found two useful URA-owned hosted layers under `gis_urap`.

### `gisdb_gis_epp_parcels_full`

- Item ID: `a76345d353a343b99b3965e8028d2ae1`
- Service URL: `https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer`
- Public query layer: yes.
- Service data last edit: June 23, 2026 at 2:12 AM ET.
- Total records: `25,023`.
- LandCare-tagged records: `1,221`.
- `LandCare - Active` records: `1,127`.
- `LandCare - Request Only` records: `94`.
- URA-owned-only LandCare query: `1,125` records.
- Runtime dashboard current view: `1,125` records, `1,124` unique parcel keys, `1,035` Active parcel keys, and `89` Request Only parcel keys.
- Static fallback mapped records generated for the dashboard: `1,103`, representing `1,102` unique parcel keys.
- Static fallback mapped records by level: `1,015` Active and `88` Request Only.
- Static fallback unique parcel counts by level: `1,015` Active and `87` Request Only.
- Useful fields include `parcel_number`, `inventory_type`, `current_status`, `neighborhood`, `project_name`, `property_maint_mgr_name`, `tags`, and `mod_dt`.
- This is the strongest candidate for an automated current assignment/universe layer.

Limitations:

- It does not contain monthly assignment period, expected survey status, returned/open classification, or matched survey completion fields.
- It is current-state parcel inventory, not a monthly parcel-performance fact table.

### `gisdb_gis_regrid_surveys`

- Item ID: `8a2395bcf9084e029a87f47346580a0a`
- Service URL: `https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_surveys/FeatureServer`
- Public query layer: yes.
- Service data last edit: May 21, 2026 at 1:24 PM ET.
- Total records: `9,389`.
- Survey `created_at` range: November 15, 2023 through June 15, 2025.
- Useful fields include `parcelnumb`, `created_at`, `status`, `image_url`, `maintained_by`, `first_visit`, `litter_dumping`, `grass_cutting`, `snow_ice_removal`, `pruning_clipping`, and `vehicles_lot`.
- This is a useful survey-submission source, but not enough by itself for the monitoring dashboard.

Limitations:

- It does not expose the monthly assignment denominator.
- It does not expose URA ownership scope or Request Only/Active classification.
- The newest survey `created_at` observed through REST was June 15, 2025, so freshness needs reconciliation against PostgreSQL `gis.regrid_survey_submissions`.

## Private / Existing App Items

The existing LandCare hosted layer and web map referenced by the monitoring work were not publicly readable through unauthenticated REST:

- Hosted feature layer: `47eb06a43565442d813189b78d318006` returned `403`.
- Web map: `82218aabb92d4903b247093b7a7be312` returned `403`.

Chrome/ArcGIS logged-in inspection could not be completed from this session because the Codex Chrome control pipe failed even though Chrome, the extension, and the native host diagnostics passed. Plugin guidance requires user permission before opening a fresh Chrome window for retry, so this was left as a follow-up.

## Architecture Recommendation

Do not replace the dashboard data with only one ArcGIS layer yet.

Recommended next architecture:

1. Use `gisdb_gis_epp_parcels_full` as the automated current LandCare parcel universe and contractor assignment source.
2. Use `gisdb_gis_regrid_surveys` or PostgreSQL `gis.regrid_survey_submissions` as the survey-completion feed after freshness is reconciled.
3. Build one derived monthly assurance table/layer with the dashboard-ready contract: `period_month`, `parcel_number`, `ownership_type`, `maintenance_level`, `contractor`, `survey_status`, `returned/open/request-only`, freshness dates, and geometry.
4. Let the web dashboard query that derived layer directly, matching the current live EPP-layer pattern.

This avoids relying on this local machine for manual pull/push while preserving the dashboard's operational metrics.
