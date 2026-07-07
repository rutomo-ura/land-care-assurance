# VM Smoke Test: Regrid Daily to Dashboard Daily Sync

Run this checklist on the GIS VM after deploying the Regrid daily flow updates to `land-care-assurance`.

## Prerequisites

- Upstream task `\GIS Automations\REGRID` runs daily at 4:00 AM
- Dashboard task `\GIS Automations\LandCare Daily Dashboard Refresh` runs daily at 7:00 AM
- Repo path: `C:\srv\GISWebApp\land-care-assurance`
- DB migration applied: `regrid_survey_submissions_period_parcel_created_image_key` constraint exists

## 1. Confirm Task Scheduler

```powershell
Get-ScheduledTask -TaskPath "\GIS Automations\REGRID\*" | Format-Table TaskName, State
Get-ScheduledTask -TaskPath "\GIS Automations\" | Where-Object { $_.TaskName -like "*LandCare*" } | Format-Table TaskName, State
```

Expected:

- `regrid_survey_daily_pipeline.py` (or equivalent) scheduled at 4:00 AM
- `LandCare Daily Dashboard Refresh` scheduled at 7:00 AM

## 2. Confirm Upstream Survey Data in GISDB

```sql
SELECT period, COUNT(*) AS row_count
FROM gis.regrid_survey_submissions
GROUP BY period
ORDER BY period DESC
LIMIT 5;
```

Expected: latest period reflects the current LandCare service period (15th-based).

## 3. Run Manual Dashboard Refresh

```powershell
cd C:\srv\GISWebApp\land-care-assurance
.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance
```

Expected: exit code 0; log at `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log`.

## 4. Verify Manifest Metadata

```powershell
Get-Content docs\landcare\data\refresh_manifest.json | ConvertFrom-Json |
  Select-Object generated_on, latest_survey_period, survey_submission_count, survey_distinct_parcels, latest_returned_assigned
```

Also check KPI summary:

```powershell
$kpi = Get-Content docs\landcare\data\kpi_summary.json | ConvertFrom-Json
$kpi.latest_month_metrics
```

Expected:

- `generated_on` matches today's date
- `survey_submission_count` is present and positive for the latest survey period
- `latest_month_metrics.returned_assigned` reflects current survey evidence

## 5. Verify Status JSON Upstream Block

```powershell
Get-Content C:\srv\logs\land-care-assurance\daily-refresh-status.json | ConvertFrom-Json | Select-Object status, outcome, upstream
```

Expected:

```json
{
  "status": "success",
  "outcome": "published or unchanged",
  "upstream": {
    "regrid_survey_pipeline": "URA-Data-Repository daily 4:00 AM",
    "latest_survey_period": "...",
    "survey_submission_count": ...,
    "latest_returned_assigned": ...
  }
}
```

## 6. Incremental Update Test (next day)

After the 4:00 AM Regrid run on a day with new survey submissions:

1. Note `survey_submission_count` and `returned_assigned` from step 4.
2. Wait for the 7:00 AM dashboard refresh (or run manually).
3. Confirm counts stayed the same or increased; they must not decrease within the same survey period.

## 7. Validation-Only Check

```powershell
python scripts\validate_landcare_daily_refresh.py `
  --previous-manifest docs\landcare\data\refresh_manifest.json `
  --previous-kpi-summary docs\landcare\data\kpi_summary.json `
  --expected-date (Get-Date -Format yyyy-MM-dd)
```

Expected: passes after a successful refresh on the run date.

## 7. Web App Smoke Test

Open the monitoring and KPI pages after deploy and confirm:

- History view map shows returned surveys from the live ArcGIS layer (`gisdb_gis_regrid_surveys_current_period`).
- Month selector includes the latest survey period from ArcGIS (for example `2026-06` when upstream has loaded that period).
- KPI latest-month returned count reflects live survey evidence, not only the last checked-in Postgres export.

ArcGIS item: https://urap.maps.arcgis.com/home/item.html?id=1f29883ea3bb4d6aa834c6a9feeeb6f1

## Failure Escalation

| Symptom | Check |
|---|---|
| `survey_submission_count` decreased | Upstream Regrid load logs; `SurveysDriveToSQL.py` output |
| `latest_survey_period` stale (>45 days) | `\GIS Automations\REGRID` task history; Regrid login credentials |
| Dashboard refresh fails QA | `daily-refresh-YYYY-MM-DD.log`; run validator with `--previous-manifest` |
| Status JSON missing `upstream` | Confirm latest `refresh_landcare_dashboard.ps1` is deployed |
