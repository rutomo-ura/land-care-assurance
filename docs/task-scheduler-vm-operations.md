# LandCare Task Scheduler VM Operations

Last updated: 2026-07-07

This is the operational runbook now that Power Automate is not available. Windows Task Scheduler, local logs, and local status JSON are the control plane.

## Operating Model

```mermaid
flowchart TB
    subgraph vm ["GIS VM"]
        TS["Windows Task Scheduler"]
        UpstreamTask["4:00 AM Regrid daily task"]
        MonthlyTask["4:15 AM monthly archive task"]
        DownstreamTask["7:00 AM LandCare dashboard task"]
        Logs["C:\\srv\\logs\\land-care-assurance"]
    end

    subgraph upstream ["C:\\srv\\URA-Data-Repository"]
        RegridDaily["regrid_survey_daily_pipeline.py"]
        RegridMonthly["regrid_survey_monthly_export.py"]
        SurveyTable["gis.regrid_survey_submissions"]
        SurveyView["gis.regrid_surveys"]
        SurveyAgol["AGOL gisdb_gis_regrid_surveys"]
    end

    subgraph dashboard ["C:\\srv\\GISWebApp\\land-care-assurance"]
        Refresh["scripts\\refresh_landcare_dashboard.ps1"]
        DataFiles["docs\\landcare\\data"]
        GitHub["GitHub master"]
        Pages["GitHub Pages dashboard"]
    end

    TS --> UpstreamTask --> RegridDaily
    TS --> MonthlyTask --> RegridMonthly
    TS --> DownstreamTask --> Refresh
    RegridDaily --> SurveyTable --> SurveyView --> SurveyAgol
    Refresh --> DataFiles --> GitHub --> Pages
    Refresh --> Logs
```

## Daily Scheduled Flow

```mermaid
flowchart TD
    A["4:00 AM Task Scheduler starts Regrid daily pipeline"] --> B["Download latest Regrid LandCare survey CSV"]
    B --> C["Load/upsert raw survey rows to gis.regrid_survey_submissions"]
    C --> D["Refresh gis.regrid_surveys PostGIS view"]
    D --> E["Overwrite existing AGOL survey item"]
    E --> F["7:00 AM Task Scheduler starts LandCare dashboard refresh"]
    F --> G["git pull --ff-only origin master"]
    G --> H["Export PostgreSQL app-ready GeoJSON"]
    H --> I["Build docs/landcare/data JSON and GeoJSON"]
    I --> J["Build finance_summary.json from workbook"]
    J --> K["Run QA/QC validation"]
    K --> L{"Generated data changed-"}
    L -->|No| M["Write success log/status: checked and unchanged"]
    L -->|Yes| N["Commit docs/landcare/data"]
    N --> O["Push to GitHub"]
    O --> P["GitHub Pages serves updated dashboard"]
```

## Task Registration Standard

Update `\GIS Automations\LandCare-Daily-Dashboard-Refresh.task` using the approved `DOMAIN\landcare-refresh` service account (or the locally approved equivalent), not an interactive personal account. The registration script requires a password-backed principal, verifies that the stored principal uses `Password` logon, runs at highest privilege, retries three times at 15-minute intervals, starts missed runs when available, and stops a run after two hours.

```powershell
cd C:\srv\GISWebApp\land-care-assurance
.\scripts\register_landcare_daily_refresh_task.ps1 `
  -RepoRoot C:\srv\GISWebApp\land-care-assurance `
  -TaskUser "DOMAIN\landcare-refresh" `
  -PromptForTaskPassword

Get-ScheduledTask -TaskPath "\GIS Automations\" -TaskName "LandCare-Daily-Dashboard-Refresh.task" |
  Select-Object TaskName, TaskPath, State, @{Name="RunAs";Expression={$_.Principal.UserId}}, @{Name="LogonType";Expression={$_.Principal.LogonType}}, @{Name="RunLevel";Expression={$_.Principal.RunLevel}}
Get-ScheduledTaskInfo -TaskPath "\GIS Automations\" -TaskName "LandCare-Daily-Dashboard-Refresh.task" |
  Select-Object LastRunTime, LastTaskResult, NextRunTime
```

Release evidence requires a successful manual run, followed by a successful scheduled invocation (`Start-ScheduledTask`), a `LastTaskResult` of `0`, and a same-day `daily-refresh-status.json` with `status: success`.

Run the proof command after registration. It starts the task, waits for it to finish, checks the exit result and same-day status JSON, and saves a durable verification JSON beside the daily logs:

```powershell
.\scripts\test_landcare_scheduled_refresh.ps1
```

## Monthly Archive Flow

```mermaid
flowchart TD
    A["15th of month, 4:15 AM"] --> B["Run regrid_survey_monthly_export.py"]
    B --> C["Read prior closed service period from gis.regrid_survey_submissions"]
    C --> D["Write landcare-network_YYYYMM-YYYYMM_snapshot.csv"]
    D --> E["G-drive monthly archive"]
    E --> F["Archive only; not daily dashboard source"]
```

## Bundle Install / Update Flow

```mermaid
flowchart TD
    A["Copy bundle ZIP to VM staging folder"] --> B["Extract ZIP"]
    B --> C["Open PowerShell in extracted bundle folder"]
    C --> D["Run install_landcare_daily_refresh.ps1"]
    D --> E{"Target repo exists-"}
    E -->|No or empty| F["Clone rutomo-ura/land-care-assurance into C:\\srv\\GISWebApp\\land-care-assurance"]
    E -->|Git repo| G["Fetch, checkout master, pull --ff-only"]
    E -->|Non-empty non-git| H["Stop without changing folder"]
    F --> I["Copy refresh scripts and docs with backups"]
    G --> I
    I --> J["Write VM-local .env if credentials supplied"]
    J --> K{"-RegisterTask supplied-"}
    K -->|Yes| L["Register 7:00 AM Task Scheduler job"]
    K -->|No| M["Skip task registration"]
    L --> N{"-RunOnce supplied-"}
    M --> N
    N -->|Yes| O["Run one checked refresh immediately"]
    N -->|No| P["Install/update complete"]
```

## Manual VM Update Flow

```mermaid
flowchart TD
    A["Open PowerShell as VM user"] --> B["cd C:\\srv\\URA-Data-Repository"]
    B --> C["git pull --ff-only origin main"]
    C --> D["Apply regrid_survey_pipeline_migration.sql once if not applied"]
    D --> E["Run/test regrid_survey_daily_pipeline.py"]
    E --> F["Confirm AGOL survey layer updates"]
    F --> G["cd C:\\srv\\GISWebApp\\land-care-assurance"]
    G --> H["git pull --ff-only origin master"]
    H --> I["Run refresh_landcare_dashboard.ps1"]
    I --> J["Review daily log and status JSON"]
```

Commands:

```powershell
cd C:\srv\URA-Data-Repository
git pull --ff-only origin main
psql -h localhost -U postgres -d gisdb -f sql\regrid_survey_pipeline_migration.sql
C:\ProgramData\ESRI\conda\envs\arcgispro-py3-clone\python.exe .\regrid_survey_daily_pipeline.py

cd C:\srv\GISWebApp\land-care-assurance
git pull --ff-only origin master
.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance
```

## Failure Triage Flow

```mermaid
flowchart TD
    A["Dashboard stale or Task Scheduler reports failure"] --> B["Open latest C:\\srv\\logs\\land-care-assurance\\daily-refresh-YYYY-MM-DD.log"]
    B --> C{"Failed stage-"}
    C -->|Pull latest repository changes| D["Check git auth, dirty worktree, network, branch"]
    C -->|PostgreSQL export| E["Check .env PG_HOST/PG_DB/PG_USER/PG_PASSWORD and GISDB availability"]
    C -->|Web data rebuild| F["Check exported GeoJSON and build script errors"]
    C -->|Finance rebuild| G["Check workbook path and sheet schema"]
    C -->|QA validation| H["Check manifest dates, counts, regressions, malformed JSON"]
    C -->|Commit/push| I["Check git auth and remote permissions"]
    D --> J["Fix root cause"]
    E --> J
    F --> J
    G --> J
    H --> J
    I --> J
    J --> K["Run refresh script manually"]
    K --> L["Confirm status JSON says success"]
```

## Local Monitoring Artifacts

```mermaid
flowchart LR
    Refresh["refresh_landcare_dashboard.ps1"] --> Log["daily-refresh-YYYY-MM-DD.log"]
    Refresh --> CurrentStatus["daily-refresh-status.json"]
    Refresh --> DatedStatus["daily-refresh-status-YYYY-MM-DD.json"]
    CurrentStatus --> Human["Human review / Task Scheduler history"]
    DatedStatus --> History["Run history archive"]
    Log --> Triage["Failure triage"]
```

| Artifact | Path | Use |
|---|---|---|
| Current run status | `C:\srv\logs\land-care-assurance\daily-refresh-status.json` | Quick success/failure check |
| Dated status | `C:\srv\logs\land-care-assurance\daily-refresh-status-YYYY-MM-DD.json` | Historical run record |
| Transcript log | `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log` | Full troubleshooting log |
| Task history | Windows Task Scheduler UI | Confirms scheduled trigger and exit code |

## Source Rules

```mermaid
flowchart TD
    Regrid["Regrid survey submissions"] --> GISDBSurvey["gis.regrid_survey_submissions"]
    GISDBSurvey --> AGOLSurvey["AGOL gisdb_gis_regrid_surveys"]
    Bundle["Bundle assignments"] --> GISDBAssign["gis.regrid_bundle_assignments"]
    Workbook["Finance workbook"] --> FinanceJson["finance_summary.json"]
    GISDBSurvey --> Export["LandCare Postgres export"]
    GISDBAssign --> Export
    Export --> DataJson["docs/landcare/data"]
    AGOLSurvey --> Runtime["Web app runtime returned evidence"]
    DataJson --> Runtime
    FinanceJson --> Runtime
```

- Daily survey source of truth: `gis.regrid_survey_submissions`.
- Runtime returned survey map layer: AGOL `gisdb_gis_regrid_surveys`.
- Assignment denominator source: `gis.regrid_bundle_assignments`.
- Finance source: LandCare budgeting workbook.
- G-drive survey CSV: archive only.
- Metric definitions and denominator rules: [`docs/landcare-metrics-context.md`](landcare-metrics-context.md).
