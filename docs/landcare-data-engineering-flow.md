# LandCare Data Engineering Flow

This note is the quick visual reference for the LandCare monitoring data pipeline. It complements the longer implementation plan in `docs/landcare-production-data-engineering-plan.md`.

## Operating Architecture

```mermaid
flowchart LR
    subgraph Sources["Operational sources"]
        Regrid["Regrid survey submissions"]
        BundleExport["Monthly bundle assignment export"]
        EPP["ArcGIS EPP parcel layer"]
        Budget["LandCare budget / contract workbook"]
        NetSuite["NetSuite check request history"]
    end

    subgraph Ingestion["Ingestion and normalization"]
        SurveyLoader["Survey loader"]
        BundleLoader["Bundle loader"]
        ParcelQuery["Live ArcGIS parcel query"]
        FinanceLoader["Finance / contract loader"]
        Validation["Data quality checks"]
    end

    subgraph Store["Authoritative data layer"]
        PG["PostgreSQL gisdb"]
        DataContract["LandCare reporting contract"]
    end

    subgraph Products["User-facing products"]
        WebMonitor["GitHub Pages monitoring map"]
        WebKPI["GitHub Pages KPI dashboard"]
        ArcGISShell["ArcGIS Online dashboard shell"]
        PowerBI["Power BI semantic model"]
        PrintPDF["GIS-style map PDF export"]
    end

    Regrid --> SurveyLoader
    BundleExport --> BundleLoader
    EPP --> ParcelQuery
    Budget --> FinanceLoader
    NetSuite --> FinanceLoader

    SurveyLoader --> PG
    BundleLoader --> PG
    FinanceLoader --> PG
    ParcelQuery --> DataContract
    PG --> DataContract
    DataContract --> Validation

    Validation --> WebMonitor
    Validation --> WebKPI
    Validation --> PowerBI
    WebMonitor --> ArcGISShell
    WebKPI --> ArcGISShell
    WebMonitor --> PrintPDF
```

## Current Production Behavior

```mermaid
flowchart TD
    A["User opens monitoring app"] --> B{"Which data is needed?"}
    B --> C["Current URA-owned LandCare universe"]
    B --> D["Monthly survey history"]
    C --> E["Query ArcGIS Online gisdb_gis_epp_parcels_full live"]
    D --> F["Read committed JSON / GeoJSON under docs/landcare/data"]
    E --> G["Map monitor: current parcels, contractor colors, status colors"]
    F --> H["KPI dashboard: survey history, contractor completion, timeline"]
    G --> I["Export selected map as GIS-style PDF"]
    H --> J["Program performance review"]
```

## Target Daily Refresh Plan

```mermaid
flowchart TD
    Start["Scheduled refresh starts"] --> PullSurvey["Pull latest survey completion output"]
    PullSurvey --> Normalize["Normalize parcel, contractor, period, status, evidence fields"]
    Normalize --> JoinParcels["Join to current URA-owned LandCare parcel universe"]
    JoinParcels --> Deduplicate["Deduplicate parcel-period records"]
    Deduplicate --> ValidateCounts["Validate row counts, unique parcels, active vs request-only"]
    ValidateCounts --> ValidateArea["Validate area using unique parcel keys"]
    ValidateArea --> BuildContract["Build reporting contract"]
    BuildContract --> PublishWeb["Publish web JSON / GeoJSON contract"]
    BuildContract --> PublishPowerBI["Publish Power BI-ready table or dataflow"]
    PublishWeb --> Smoke["Run dashboard smoke checks"]
    PublishPowerBI --> Smoke
    Smoke --> Notify["Notify owner with success/failure and row counts"]
```

## Two-Month Delivery Plan

```mermaid
gantt
    title LandCare Monitoring Data Engineering Plan
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Foundation
    Confirm source fields and metric definitions     :a1, 2026-06-25, 5d
    Document data contract and validation rules      :a2, after a1, 5d

    section Pipeline
    Build daily survey completion ingestion          :b1, after a2, 10d
    Add row-count, freshness, and duplicate checks   :b2, after b1, 5d
    Generate dashboard-ready JSON / GeoJSON          :b3, after b2, 5d

    section Products
    Wire monitoring app to refreshed contract        :c1, after b3, 5d
    Wire KPI dashboard to refreshed contract         :c2, after c1, 5d
    Prepare Power BI consumption contract            :c3, after b3, 10d

    section Hardening
    Add scheduled run and logs                       :d1, after c2, 5d
    Add GitHub Pages / dashboard smoke checks        :d2, after d1, 5d
    Handoff runbook and improvement backlog          :d3, after d2, 5d
```

## Data Contract Checklist

- `parcel_key`: normalized parcel identifier used across ArcGIS, Regrid, PostgreSQL, web, and Power BI.
- `period_month`: reporting month for assignment and completion status.
- `organization`: contractor name normalized without contact suffixes.
- `maintenance_level`: `Active`, `Request Only`, or explicit exception value.
- `completion_status`: `returned`, `missing`, `request_only`, or current-active status.
- `returned_flag`: boolean for survey completion.
- `ownership_type`: URA/PLB/other classification used for metric scope.
- `council_district`, `neighborhood`, `geometry`: spatial context for map filters and export.
- `area_acres`: unique-parcel area using the selected authoritative ArcGIS field.
- `source_updated_at`: freshness timestamp for each source adapter.

## Near-Term Decisions

- Decide whether Power BI should read the web JSON contract, a PostgreSQL view, or a Power BI dataflow built from the same contract.
- Decide whether ArcGIS Online needs a hosted monthly assurance layer or should continue embedding the GitHub Pages app while querying existing hosted layers.
- Decide whether Regrid remains a temporary source adapter or gets replaced later by ArcGIS Survey123, Field Maps, or a custom survey form.
- Decide the alert owner for failed refreshes, stale survey periods, and count drift.
