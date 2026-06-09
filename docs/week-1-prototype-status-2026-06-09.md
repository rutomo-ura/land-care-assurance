# Week 1 Prototype Status

Date: June 9, 2026

## What We Built

- Created a working LandCare map dashboard prototype.
- Pulled current data from PostgreSQL with a read-only export.
- Rendered real parcel geometry on an interactive Leaflet map.
- Added month, contractor, status, and ownership filters.
- Added KPIs for assigned parcels, returned surveys, active completion, open assignments, and ownership focus.
- Added contractor ranking and action-focus panels.
- Matched the visual direction closer to URA and a CARTO-style civic map surface.
- Added GitHub Pages workflow support, while keeping deployment flexible for a better host later.

## Current Stack

- Source database: PostgreSQL / PostGIS.
- Export: read-only SQL from GIS tables.
- Data-prep path: Python script producing app-ready GeoJSON, JSON, and CSV files.
- Frontend: static HTML, CSS, JavaScript, Leaflet, Plotly.
- Basemap: CARTO Positron.

## Data Notes

- Latest assignment data: May 15, 2026.
- Latest survey completion data: April 15, 2026.
- Current map layer shows 1,076 assigned parcels for April 2026.
- Returned surveys matched to assigned parcel keys: 142.
- Active completion: 14.3%.
- Ownership matching normalizes owner names before classifying URA and Pittsburgh Land Bank parcels.

## What Needs To Be Done

- Confirm the final production hosting path.
- Decide whether the next prototype should stay static or move to a backend service.
- Move data-prep toward GeoPandas, GDAL/pyogrio, and Shapely for stronger GIS handling.
- Evaluate Mapbox GL JS or MapLibre GL with vector tiles if parcel volume grows.
- Reconcile ownership definitions against Power BI and URA/PLB business rules.
- Confirm public-sharing rules for parcel-level data before publishing beyond internal review.
- Add a repeatable refresh checklist for PostgreSQL export, validation, and deployment.

## Next Practical Step

Use this prototype as the Week 1 demo surface. For Week 2, focus on data definition alignment, ownership logic, and a deployment path that can support future ArcGIS Online or vector-tile integration.
