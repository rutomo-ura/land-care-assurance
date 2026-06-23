# Agent Handoff Knowledge

Last updated: June 23, 2026

This is the living handoff document for future Codex or analyst sessions. Update it at the end of each meaningful work session so the next agent can continue without rediscovering the project.

## Safety Rule

Do not store passwords, API keys, tokens, database passwords, or browser session secrets in this file. Store only connection context, source names, and safe operational notes. If credentials are needed, ask the user to provide them through an approved secure path during the session.

## Project Goal

Improve URA LandCare assurance by making parcel assignment, survey completion, ownership validation, contractor performance, and dashboard clarity easier to inspect and act on.

## Current Repo

- Local repo: `C:\rutomo-codefolder\land-care-assurance`
- GitHub repo: `https://github.com/rutomo-ura/land-care-assurance`
- Main branch: `master`
- Prototype folder: `prototype/`
- Current local dev URL: `http://localhost:8010/`

## Current Prototype State

The Week 1 prototype is a working static web dashboard. As of June 23, 2026, the work has also moved beyond proposal mode into a public monitoring/KPI web app and ArcGIS Online dashboard shell. See `docs/landcare-monitoring-milestone-2026-06-23.md`.

- Frontend: `prototype/index.html`, `prototype/styles.css`, `prototype/app.js`
- Generated data: `prototype/data/`
- Data-prep script: `prototype/scripts/build_prototype_data.py`
- Read-only SQL export: `prototype/sql/export_prototype_data_readonly.sql`
- Handoff status: `docs/week-1-prototype-status-2026-06-09.md`

Current published monitoring deliverables:

- Public monitoring app: `https://rutomo-ura.github.io/land-care-assurance/monitoring/`
- Public KPI app: `https://rutomo-ura.github.io/land-care-assurance/kpi/`
- Main ArcGIS Online dashboard shell: `https://urap.maps.arcgis.com/apps/dashboards/341377524e02486ba71684ad67d9b273`
- ArcGIS Online hosted feature layer: `https://urap.maps.arcgis.com/home/item.html?id=47eb06a43565442d813189b78d318006`
- ArcGIS Online web map: `https://urap.maps.arcgis.com/home/item.html?id=82218aabb92d4903b247093b7a7be312`
- Deprecated old native dashboard: `https://urap.maps.arcgis.com/apps/dashboards/2fb899d781df444ca26a6231f505cc60`
- Data-source investigation note: `docs/landcare-data-source-milestone-2026-06-23.md`

Current map stack:

- Source database: PostgreSQL / PostGIS
- Export path: read-only SQL to app-ready GeoJSON
- Frontend map: Leaflet
- Basemap: CARTO Positron
- Charting: Plotly
- Next stack path: GeoPandas, GDAL/pyogrio, Shapely for data prep; Mapbox GL JS or MapLibre GL with vector tiles if parcel volume grows

## Key Data Sources

PostgreSQL database context:

- Database: `gisdb`
- Host observed during work: `10.0.101.57`
- Port: `5432`
- User observed during work: `rutomo`
- Credentials are intentionally not recorded here.

Core tables used by the prototype:

- `gis.regrid_bundle_assignments`
- `gis.regrid_survey_submissions`
- `gis.pgh_parcels`
- `gis.epp_parcels_full`
- `gis.epp_snapshot`
- `analysis.city_epp_properties`
- `analysis.assessment_snapshot`

Other source references:

- Power BI dashboard: `https://app.powerbi.com/links/2pxzsYoxHs?ctid=c77df146-c538-49e4-9577-c9ee1d243d16&pbi_source=linkShare`
- SharePoint documentation: listed in `README.md`
- Script repository: `https://github.com/URA-GIS-User/URA-Data-Repository`
- LandCare network path: `\\ura-fs\share\Public\LandCare\Y10-11 2025-2027 wPLB`

ArcGIS Online automated layer candidates checked on June 23, 2026:

- `gisdb_gis_epp_parcels_full`: `https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_epp_parcels_full/FeatureServer`
  - Owner: `gis_urap`
  - Item ID: `a76345d353a343b99b3965e8028d2ae1`
  - Public/queryable Feature Service.
  - Data last edit observed through REST: June 23, 2026 at 2:12 AM ET.
  - Total records: `25,023`.
  - LandCare-tagged records: `1,221`.
  - `LandCare - Active`: `1,127`.
  - `LandCare - Request Only`: `94`.
  - URA-owned-only LandCare query: `1,125`.
  - Current dashboard mapped records: `1,103`, representing `1,102` unique parcel keys.
  - Current unique parcel counts: `1,015` Active and `87` Request Only.
  - Current mapped record counts: `1,015` Active and `88` Request Only; one Request Only parcel key appears twice.
  - `22` URA-owned LandCare records did not return usable geometry in the ArcGIS GeoJSON build.
  - Useful for current LandCare parcel universe and contractor assignment fields, but not a monthly completion fact layer.
- `gisdb_gis_regrid_surveys`: `https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_surveys/FeatureServer`
  - Owner: `gis_urap`
  - Item ID: `8a2395bcf9084e029a87f47346580a0a`
  - Public/queryable Feature Service.
  - Data last edit observed through REST: May 21, 2026 at 1:24 PM ET.
  - Total records: `9,389`.
  - Survey `created_at` observed range: November 15, 2023 through June 15, 2025.
  - Useful survey fields exist, but freshness and monthly matching need reconciliation before this can replace PostgreSQL survey data.

## Current Metrics Captured

Power BI landing page values captured during the Week 1 work:

- Data updated: June 9, 2026
- Assigned parcels: `1,214`
- Returned surveys: `142`
- URA owned parcels: `1,120`
- Pittsburgh Land Bank parcels: `28`
- Projected yearly limit: `$775,000.00`
- Total amount spent: `$343,523.44`
- Quarterly amount spent: `$154,944.44`

Prototype app data after the read-only PostgreSQL export:

- Latest assignment period: May 15, 2026
- Latest survey completion period: April 15, 2026
- April 2026 map layer assigned parcels: `1,076`
- April 2026 returned surveys matched to assigned parcel keys: `142`
- April 2026 active completion: `14.3%`
- April 2026 ownership split in map layer:
  - City of Pittsburgh: `540`
  - Other or unknown: `315`
  - URA: `218`
  - Pittsburgh Land Bank: `3`

Current public monitoring app values after narrowing the app to URA-owned LandCare parcels:

- Default monitoring data view: current ArcGIS universe from `gisdb_gis_epp_parcels_full`
- Current ArcGIS mapped URA-owned LandCare records: `1,103`
- Current ArcGIS unique URA-owned LandCare parcel keys: `1,102`
- Current ArcGIS Active records: `1,015`
- Current ArcGIS Request Only unique parcel keys: `87`
- Current ArcGIS contractors: `9`
- Latest map layer: April 2026
- Assignment freshness: May 15, 2026
- Survey completion freshness: April 15, 2026
- Available map months: May 2025, June 2025, July 2025, September 2025, October 2025, November 2025, December 2025, January 2026, February 2026, March 2026, and April 2026
- All-month URA-owned parcel-month records: `2,415`
- URA-owned latest-month assigned parcels: `218`
- Returned surveys matched to URA-owned assigned parcels: `14`
- Active completion: `7.7%`
- Open active assignments: `167`
- Request Only assignments: `37`
- Main app data files: `docs/landcare/data/current_universe.geojson`, `docs/landcare/data/current_universe_summary.json`, `docs/landcare/data/all_months.geojson`, `docs/landcare/data/latest_month.geojson`, `docs/landcare/data/latest_month_summary.json`, `docs/landcare/data/kpi_summary.json`, `docs/landcare/data/monthly_metrics.json`, `docs/landcare/data/contractor_monthly.json`, and `docs/landcare/data/refresh_manifest.json`

## Important Implementation Details

Map rendering:

- Leaflet external CSS may fail or load late in local review, so `prototype/styles.css` includes critical Leaflet pane layout rules.
- Tile pane is explicitly below the parcel overlay.
- Parcel overlay must remain above the basemap.
- Current pane stacking:
  - Tile pane: `z-index: 200`
  - Parcel overlay pane: `z-index: 400`
- Parcel shapes are SVG paths, not canvas, so they are easier to inspect during Week 1.
- Parcel hover updates the side detail pane and shows a sticky map tooltip.
- Hover is handled with map-level nearest-parcel detection plus invisible parcel-center hit targets, because full-city parcel polygons can be too small for reliable direct SVG hover.
- Parcel click still sets the side detail pane as the selected parcel.

Basemap:

- The prototype uses CARTO Positron tiles:
  - `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png`
- The base map is visually softened so parcel polygons remain readable.

Ownership classification:

- Owner matching normalizes owner names before classification.
- URA and Pittsburgh Land Bank matching should tolerate spacing, punctuation, and common abbreviations.
- The current map-layer ownership definition does not exactly match the broader Power BI ownership cards. Treat this as a reconciliation task, not an error to hide.

Survey completion:

- Completion uses survey submissions matched to assignment parcel keys.
- Active completion should be shown separately from blended completion.
- Request Only parcels should not be treated the same as Active recurring survey expectations.

Contractor analysis:

- Current dashboard ranks contractors by completion rate.
- Future reassignment work should compare total parcel area, not only parcel count.
- Contractor-colored map mode is a requested future enhancement.

## Useful Commands

Run local prototype:

```powershell
python -m http.server 8010 -d prototype
```

Validate generated prototype data:

```powershell
python prototype/scripts/build_prototype_data.py --validate-only
```

Rebuild prototype data from an app-ready export:

```powershell
python prototype/scripts/build_prototype_data.py --app-ready-geojson prototype/source/app_ready_parcels_monthly.geojson
```

Rebuild current public monitoring/KPI data from the app-ready export artifact:

```powershell
python scripts/build_landcare_web_data.py
```

Rebuild current ArcGIS LandCare universe data from hosted public ArcGIS layers:

```powershell
python scripts/build_landcare_arcgis_current.py
```

Export app-ready GeoJSON from PostgreSQL:

```powershell
psql "host=10.0.101.57 port=5432 dbname=gisdb user=rutomo" --tuples-only --no-align --output prototype/source/app_ready_parcels_monthly.geojson --file prototype/sql/export_prototype_data_readonly.sql
```

Use the bundled runtime when system tools are blocked:

- Bundled Python path was available through the Codex workspace dependencies.
- Bundled Node path was used for `node --check prototype/app.js`.

## Files To Treat Carefully

Local generated or sensitive-adjacent data:

- `prototype/source/` is ignored and should remain a local staging folder.
- `outputs/` contains analysis outputs and package folders from previous work.
- Parcel-level public sharing needs approval before broad publication.

Known uncommitted local items from earlier sessions may remain in the worktree. Do not revert them unless the user explicitly asks.

## Recent Commit Trail

Most recent pushed commits at the time this file was created:

- `518bdbe` Update prototype progress and next steps
- `a9b8019` Document Week 1 prototype and update map stack
- `3720903` Refine LandCare dashboard map and ownership filters
- `6a9f84b` Build LandCare map dashboard prototype

## Next Work Queue

- Confirm production deployment path.
- Reconcile ownership definitions with Power BI and URA/PLB business rules.
- Reconcile ArcGIS `gisdb_gis_epp_parcels_full` and `gisdb_gis_regrid_surveys` with PostgreSQL and decide whether to build a hosted monthly assurance layer from them.
- Add contractor-colored parcel map mode.
- Add last surveyed period as a map mode or coordinated filter.
- Add reassignment planning that balances contractor workload by total parcel area.
- Decide when to move from static GeoJSON to vector tiles or a backend map API.
- Build a repeatable refresh checklist for PostgreSQL export, validation, review, and deployment.

## End-Of-Session Update Checklist

Before ending future sessions, update this file with:

- What changed
- What was validated
- New metrics or source observations
- New commands or paths that matter
- Any blockers
- Next practical action

Do not add credentials.
