# LandCare Map Dashboard Prototype

Static Week 1 prototype for reviewing monthly LandCare bundle assignment and survey completion.

## Current Build

- Runs on GitHub Pages with no backend.
- Uses `prototype/data/` files generated from a read-only PostgreSQL export.
- Uses real parcel geometry from GIS tables where a parcel key joins cleanly.
- Shows completion through April 2026, the latest month with survey submissions in `gis.regrid_survey_submissions`.
- Keeps May 2026 assignment freshness in `kpi_summary.json` because assignments are newer than survey submissions.

## Local Run

From the repo root:

```powershell
python prototype/scripts/build_prototype_data.py --app-ready-geojson prototype/source/app_ready_parcels_monthly.geojson
python -m http.server 8000 -d prototype
```

Open `http://localhost:8000`.

## Data Refresh

1. Export app-ready GeoJSON from PostgreSQL:

```powershell
psql "host=10.0.101.57 port=5432 dbname=gisdb user=rutomo" --tuples-only --no-align --output prototype/source/app_ready_parcels_monthly.geojson --file prototype/sql/export_prototype_data_readonly.sql
```

2. Rebuild dashboard files:

```powershell
python prototype/scripts/build_prototype_data.py --app-ready-geojson prototype/source/app_ready_parcels_monthly.geojson
```

3. Validate:

```powershell
python prototype/scripts/build_prototype_data.py --validate-only
```

Generated files land in `prototype/data/` for GitHub Pages.

## Data Sources

- `gis.regrid_bundle_assignments`
- `gis.regrid_survey_submissions`
- `gis.pgh_parcels`
- `gis.epp_parcels_full`
- `gis.epp_snapshot`

The SQL is read-only and starts with `begin read only`.

## Dashboard Fields

The browser app expects these parcel-month fields:

- `parcel_key`
- `period_month`
- `organization`
- `maintenance_level`
- `assigned_flag`
- `returned_flag`
- `completion_status`
- `geometry`

## ArcGIS Online Path

This prototype is structured so the same app-ready parcel-month layer can later become an ArcGIS Online dashboard layer. The key transfer item is the data contract above, not the Leaflet front end.
