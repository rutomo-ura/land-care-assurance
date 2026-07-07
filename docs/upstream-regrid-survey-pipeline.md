# Upstream Regrid Survey Pipeline

Canonical architecture: [`docs/landcare-architecture.md`](landcare-architecture.md)

This document summarizes how Regrid survey data reaches the LandCare dashboard. The full operational runbook lives in the upstream repository:

- **Repo:** `URA-GIS-User/URA-Data-Repository` (local clone: `ura-gis-user`)
- **Primary doc:** `docs/regrid-survey-pipeline.md` in that repo

## End-to-End Timing

| Time (Eastern) | Task Scheduler folder | Script | Output |
|---|---|---|---|
| 4:00 AM daily | `\GIS Automations\REGRID` | `regrid_survey_daily_pipeline.py` | Regrid CSV â†’ `gis.regrid_survey_submissions`; AGOL current-period layer should be checked separately until upstream publisher is aligned |
| 4:15 AM on the 15th | `\GIS Automations\REGRID` | `regrid_survey_monthly_export.py` | G-drive CSV archive snapshot (not the daily source) |
| 7:00 AM daily | `\GIS Automations` | `refresh_landcare_dashboard.ps1` in this repo | `docs/landcare/data/*` â†’ GitHub Pages |

The dashboard refresh runs three hours after the daily Regrid pipeline so incremental survey submissions are available in GISDB before export. The web app also queries AGOL directly at page load, so returned survey evidence can update even between 7:00 AM publishes.

## What This Repo Consumes

This repository does **not** talk to Regrid directly. It reads PostgreSQL tables populated by the upstream loaders:

| Table | Upstream loader | Cadence |
|---|---|---|
| `gis.regrid_survey_submissions` | `SurveysDriveToSQL.py` via `regrid_survey_daily_pipeline.py` | Daily |
| `gis.regrid_bundle_assignments` | `BundlesDriveToSQL.py` via `bundle_assignment_creation.py` | Monthly (15th) |

The read-only export in `prototype/sql/export_prototype_data_readonly.sql` joins these tables with parcel geometry and ownership sources, then `scripts/build_landcare_web_data.py` publishes dashboard JSON/GeoJSON.

## Source of Truth

- **Surveys:** GISDB (`gis.regrid_survey_submissions`) is the source of truth. G-drive CSV files are monthly archives only.
- **Assignments:** Still loaded monthly from bundle exports; assignment denominator updates on the 15th.
- **AGOL current-period survey layer:** `gisdb_gis_regrid_surveys_current_period` ([ArcGIS item](https://urap.maps.arcgis.com/home/item.html?id=1f29883ea3bb4d6aa834c6a9feeeb6f1)) was created as an Oscar-hosted current-period Regrid layer. The monitoring map and KPI dashboard query this layer directly for current-period returned survey evidence and freshness metadata. Historical assignment denominators still come from the published Postgres export in this repo. The upstream `ura-gis-user` publisher should be aligned before treating this item as the official scheduled publish target.

## Current Upstream Assessment

The local `ura-gis-user` clone is clean against `origin/main` and includes the Regrid survey pipeline updates. The most recent observed upstream commit line is:

```text
c59ec89 Merge Regrid survey pipeline updates
```

The important architecture change is that Regrid survey data is now handled as a daily GISDB/AGOL pipeline:

| Upstream component | Current role | Dashboard dependency |
|---|---|---|
| `regrid_survey_download.py` | Downloads the current LandCare Network Regrid survey CSV to `C:\srv\regrid-survey-downloads\daily` | Must complete before the daily GISDB load |
| `SurveysDriveToSQL.py` | Upserts raw submissions to `gis.regrid_survey_submissions` | Static monthly completion metrics are built from this table |
| `sql/regrid_survey_pipeline_migration.sql` | Creates the raw-submission uniqueness rule and AGOL/QA views | Must be applied once on the VM after pulling upstream changes |
| `publish_regrid_snapshot.py` | Publishes `gis.regrid_surveys` to the existing AGOL item | Runtime returned-survey map evidence comes from this layer |
| `regrid_survey_monthly_export.py` | Writes prior service-period CSV archives to the G drive | Archive only; not the daily dashboard source |

The dashboard should not read the monthly G-drive survey CSV as a freshness source. Daily freshness should be checked from GISDB, AGOL metadata, Task Scheduler history, and this repo's `daily-refresh-status.json`.

## Service Period Convention

LandCare service periods run from the **15th of one month through the 14th of the next**. Both assignments and surveys store the period as the 15th of the start month (for example, `2026-06-15` for the Juneâ€“July period).

## Daily Incremental Updates

With daily survey ingestion, `returned_assigned` counts for the current service period can increase every day even when `latest_survey_period` stays the same. The 7:00 AM refresh should publish those updates when survey evidence grows.

QA checks in `scripts/validate_landcare_daily_refresh.py` guard against survey count regression within the same period and warn when `latest_survey_period` is stale.

## Monitoring

After each refresh, `C:\srv\logs\land-care-assurance\daily-refresh-status.json` may include an optional `upstream` object:

```json
{
  "upstream": {
    "regrid_survey_pipeline": "URA-Data-Repository daily 4:00 AM",
    "latest_survey_period": "2026-06-15",
    "survey_submission_count": 412,
    "latest_returned_assigned": 96
  }
}
```

See `docs/task-scheduler-vm-operations.md` for the active Task Scheduler monitoring and failure-triage flow.
