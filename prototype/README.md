# LandCare Map Dashboard Prototype

Static Week 1 prototype for reviewing monthly LandCare bundle assignment and survey completion.

## Current Build

- Runs on GitHub Pages with no backend.
- Uses `prototype/data/` files generated from a read-only PostgreSQL export.
- Uses real parcel geometry from GIS tables where a parcel key joins cleanly.
- Classifies ownership as URA, Pittsburgh Land Bank, City of Pittsburgh, or Other/unknown using normalized owner-name matching.
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
- `analysis.city_epp_properties`
- `analysis.assessment_snapshot`

The SQL is read-only and starts with `begin read only`.

Owner names are normalized before matching. This handles common variants such as missing punctuation, inconsistent spacing, `URA`, `Urban Redevelopment Authority`, `Pittsburgh Land Bank`, and `PLB`.

## Dashboard Fields

The browser app expects these parcel-month fields:

- `parcel_key`
- `period_month`
- `organization`
- `maintenance_level`
- `ownership_type`
- `owner_name`
- `assigned_flag`
- `returned_flag`
- `completion_status`
- `geometry`

## Power BI Reference

The dashboard uses these current Power BI landing page values as reference metrics:

- Assigned parcels: `1,214`
- Returned surveys: `142`
- URA owned parcels: `1,120`
- Pittsburgh Land Bank parcels: `28`
- Data updated: `June 9, 2026`

## ArcGIS Online Path

This prototype is structured so the same app-ready parcel-month layer can later become an ArcGIS Online dashboard layer. The key transfer item is the data contract above, not the Leaflet front end.
