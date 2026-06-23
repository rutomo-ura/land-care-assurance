# LandCare Monitoring Milestone - June 23, 2026

This note preserves the current state after moving the LandCare work from proposal mode into an operational monitoring front end. Use it as the memory file for future improvement planning, deck updates, and implementation handoff.

## Current Deliverables

- Public GitHub Pages monitoring app: https://rutomo-ura.github.io/land-care-assurance/monitoring/
- Public GitHub Pages KPI app: https://rutomo-ura.github.io/land-care-assurance/kpi/
- ArcGIS Online dashboard shell: https://urap.maps.arcgis.com/apps/dashboards/341377524e02486ba71684ad67d9b273
- ArcGIS Online item page: https://urap.maps.arcgis.com/home/item.html?id=341377524e02486ba71684ad67d9b273
- ArcGIS Online hosted feature layer: https://urap.maps.arcgis.com/home/item.html?id=47eb06a43565442d813189b78d318006
- ArcGIS Online web map: https://urap.maps.arcgis.com/home/item.html?id=82218aabb92d4903b247093b7a7be312

## What Changed

The project is no longer only a proposal/demo. It now has a front-end monitoring experience that can be opened from ArcGIS Online and shared with URA and contractor audiences.

The latest ArcGIS dashboard is intentionally simple: it embeds the full GitHub Pages web app instead of recreating the interface with stacked native ArcGIS Dashboard widgets. This keeps the layout closer to the custom web app and preserves all existing web functionality inside the ArcGIS Online access path.

The older native ArcGIS dashboard, `LandCare Assurance Monitoring Dashboard` (`2fb899d781df444ca26a6231f505cc60`), is deprecated because the layout was too rigid and stacked. Cleanup target: remove this item after confirming no stakeholder still needs it.

## Verified Functionality

- The ArcGIS dashboard loads the monitoring web app in runtime mode.
- The monitoring page shows the URA-branded header, real Pittsburgh parcel map, metrics, contractor filter, selected parcel panel, and action focus panel.
- The latest map view is limited to URA-owned LandCare parcels only.
- The monitoring page can now switch across all available URA-owned parcel-month records from the current export artifact.
- All-month data currently covers 2,415 URA-owned parcel-month records across 11 available months from May 2025 through April 2026.
- The monitoring page now also has a `Current ArcGIS Universe` data view backed live by the public `gisdb_gis_epp_parcels_full` hosted layer.
- The live current ArcGIS view returns 1,125 current URA-owned LandCare records representing 1,124 unique parcel keys, across 9 contractors.
- Current unique parcel counts are 1,035 Active and 89 Request Only.
- Current ArcGIS universe data is no longer committed as a snapshot; the monitoring and KPI pages query the hosted layer live.
- KPI headline cards now use the same live ArcGIS current-universe counts as the map monitor: 1,125 current records, 1,124 unique parcels, 1,035 Active, 89 Request Only, and 9 contractors.
- Latest-map counts: 218 assigned URA-owned parcels, 14 returned, 167 open, 37 request-only, 7.7% completion.
- Map color mode toggles between Survey Status and Contractor.
- The legend changes correctly when switching from Survey Status to Contractor.
- Contractor filtering is available from the monitoring controls.
- The KPI page loads inside the ArcGIS dashboard.
- The KPI page includes the monthly completion line chart, contractor completion detail, dashboard reconciliation, automation notes, and source notes.
- The new ArcGIS dashboard item is shared as Everyone (public), confirmed through unauthenticated ArcGIS REST metadata.

## Current Data Contract

The current static web app is backed by exported data files in:

- `docs/landcare/data/latest_month.geojson`
- `docs/landcare/data/all_months.geojson`
- `docs/landcare/data/latest_month_summary.json`
- `docs/landcare/data/kpi_summary.json`
- `docs/landcare/data/monthly_metrics.json`
- `docs/landcare/data/contractor_monthly.json`
- `docs/landcare/data/refresh_manifest.json`

The source narrative shown in the app:

- PostgreSQL export filtered to URA-owned LandCare parcels only.
- Assignment freshness: May 15, 2026.
- Survey completion freshness: April 15, 2026.
- Latest map layer: 2026-04.
- Available map months: 2025-05, 2025-06, 2025-07, 2025-09, 2025-10, 2025-11, 2025-12, 2026-01, 2026-02, 2026-03, and 2026-04.
- Source tables include `gis.regrid_bundle_assignments`, `gis.regrid_survey_submissions`, `gis.pgh_parcels`, `gis.epp_parcels_full`, `gis.epp_snapshot`, `analysis.city_epp_properties`, and `analysis.assessment_snapshot`.

## ArcGIS Source Check

See `docs/landcare-data-source-milestone-2026-06-23.md` for the full source investigation.

Important findings:

- `gisdb_gis_epp_parcels_full` is a public/queryable ArcGIS hosted layer owned by `gis_urap`, updated June 23, 2026 at 2:12 AM ET. It has 25,023 records and 1,221 LandCare-tagged records, split into 1,127 Active and 94 Request Only records.
- `gisdb_gis_regrid_surveys` is a public/queryable ArcGIS hosted layer owned by `gis_urap`, updated May 21, 2026 at 1:24 PM ET. It has 9,389 survey records and Regrid-style survey fields.
- The monitoring app now queries `gisdb_gis_epp_parcels_full` live for the current LandCare universe. A derived monthly fact layer is still needed for live completion metrics because survey completion requires assignment universe, ownership scope, contractor, survey completion, and period to be joined.
- The KPI page also queries `gisdb_gis_epp_parcels_full` live for current-universe headline cards. Its timeline, contractor completion, reconciliation, and open-assignment metrics still use the monthly assurance export until the derived monthly fact layer exists.
- The existing dashboard-specific hosted layer (`47eb06a43565442d813189b78d318006`) and web map (`82218aabb92d4903b247093b7a7be312`) returned `403` through unauthenticated REST.

## Improvement Plan

### 1. Data Pipeline

- Turn the current export into a repeatable script that refreshes the JSON and GeoJSON files from PostgreSQL.
- Add a single command for monthly map/KPI refresh.
- Add a daily survey-completion ingestion path that can feed both the web app and Power BI.
- Write data-quality checks for stale survey period, duplicate parcel-period records, unmatched survey completions, and missing assignment keys.
- Produce a refresh manifest with row counts, latest dates, and warnings after each run.

### 2. Metric Integrity

- Keep URA-owned monitoring separate from broader Power BI program totals.
- Preserve separate denominators for Active parcels and Request Only parcels.
- Reconcile each app number to the SQL source and to the Power BI definitions.
- Add explicit freshness cards for assignment date, survey completion date, and publication date.
- Define contractor compliance metrics beyond completion rate, including overdue count, returned-on-time count, and evidence attachment rate.

### 3. ArcGIS Online

- Keep the new full-web-app dashboard as the main AGOL front door.
- Retire the older stacked native dashboard after deletion is confirmed.
- Decide whether the hosted feature layer should remain a snapshot, be overwritten monthly, or become a stable layer view backed by the pipeline.
- Consider an Experience Builder version later only if it can preserve the custom app's interaction density.

### 4. Visual Improvements

- Refine desktop layout spacing so the map stays dominant and control panels remain scannable.
- Improve mobile surveyor mode: parcel selection, take-survey button, land care form, photo/evidence attachment, and submission confirmation.
- Add map screenshots or compact evidence views for deck and stakeholder updates.
- Strengthen URA visual identity while keeping the dashboard operational, not marketing-style.
- Add a clearer active state for contractor filters and map color mode.

### 5. Survey And Contractor Workflow

- Keep survey interface and optimization as phase-two work unless monitoring adoption requires it sooner.
- Later, add parcel-to-survey handoff from the map: select parcel, open survey form, prefill parcel and contractor fields, attach evidence.
- Later, add bundle optimization using parcel area, contractor capacity, prior month succession, and open-survey burden.

## Recommended Next Sprint

1. Reconcile ArcGIS `gisdb_gis_epp_parcels_full` counts against PostgreSQL `gis.epp_snapshot` and the Power BI assignment denominator.
2. Reconcile ArcGIS `gisdb_gis_regrid_surveys` freshness against PostgreSQL `gis.regrid_survey_submissions`.
3. Promote the derived monthly assurance contract into a scheduled job or hosted feature layer so the dashboard is not dependent on a local export.
4. Add automated checks that fail when row counts, latest dates, or ownership filters look wrong.
5. Publish updated data to GitHub Pages or a stable ArcGIS layer and confirm the embedded ArcGIS dashboard reflects the change.

## Related Deployment Decision

See `docs/arcgis-github-cicd-decision.md` for the recommended GitHub CI/CD and ArcGIS Online lab strategy. Current recommendation: GitHub Pages remains the source-controlled public mirror and custom app surface; ArcGIS Online remains the GIS-facing shell and can later receive automated hosted layer/item updates.
