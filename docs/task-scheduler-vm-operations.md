# LandCare VM Scheduler Operations

Last updated: 2026-08-06

The current production data path is the upstream 4 AM Regrid/Oscar process that publishes PostgreSQL-backed ArcGIS layers. The former 7 AM LandCare dashboard task is deprecated and should not be treated as an application dependency.

## Current and legacy tasks

| Process | Status | Purpose |
|---|---|---|
| Upstream Regrid task, 4 AM | Active | Download Regrid survey output, load GISDB, publish live ArcGIS survey data |
| Upstream assignment publication | Active | Publish current and historical ArcGIS assignment layers |
| `LandCare-Daily-Dashboard-Refresh.task`, 7 AM | Deprecated | Former static export, finance, optional Survey123, QA, commit, and push process |

Repository history shows the last identifiable automatic 7 AM data commit on July 28, 2026. The checked-in static GIS contract was generated July 29. Live ArcGIS now contains newer data and is queried directly by the browser.

## Controlled retirement on the GIS VM

Run these checks on the actual GIS VM with the approved administrator. They are not available from a normal workstation clone.

### 1. Capture the task state

```powershell
$taskPath = "\GIS Automations\"
$taskName = "LandCare-Daily-Dashboard-Refresh.task"

Get-ScheduledTask -TaskPath $taskPath -TaskName $taskName |
  Select-Object TaskName, TaskPath, State,
    @{Name="RunAs";Expression={$_.Principal.UserId}},
    @{Name="LogonType";Expression={$_.Principal.LogonType}},
    Actions, Triggers

Get-ScheduledTaskInfo -TaskPath $taskPath -TaskName $taskName |
  Select-Object LastRunTime, LastTaskResult, NextRunTime, NumberOfMissedRuns

Export-ScheduledTask -TaskPath $taskPath -TaskName $taskName |
  Set-Content "C:\srv\logs\land-care-assurance\LandCare-Daily-Dashboard-Refresh.retired.xml"
```

Retain, when present:

- `C:\srv\logs\land-care-assurance\daily-refresh-status.json`
- recent `daily-refresh-YYYY-MM-DD.log` transcripts
- the exported scheduled-task XML

Do not copy secrets, `.env` values, tokens, or private keys into Git.

### 2. Confirm the live replacement path

Before disabling the legacy task:

1. Confirm the upstream 4 AM task completed successfully.
2. Confirm current edit timestamps on the survey, current-assignment, and history-assignment ArcGIS layers.
3. Open Map Monitor, KPI, contractor, and survey-submission routes.
4. Reconcile one selected period and one parcel with a comment and image.
5. Confirm Land Care Budget and Parcel Area load from Power BI.

### 3. Disable, observe, then remove

```powershell
Disable-ScheduledTask -TaskPath $taskPath -TaskName $taskName
```

Observe two business days and two upstream ArcGIS cycles. If the public application remains current, remove the deprecated task or retain it disabled according to the organization’s retention policy.

```powershell
Unregister-ScheduledTask -TaskPath $taskPath -TaskName $taskName -Confirm
```

The final removal command is intentionally interactive. Review the exported definition before confirming.

## What the deprecated script did

[`scripts/refresh_landcare_dashboard.ps1`](../scripts/refresh_landcare_dashboard.ps1) performed these stages:

1. Pull `master`.
2. Install the refresh environment.
3. Optionally reconcile and publish Survey123 evidence.
4. Export PostgreSQL app-ready data.
5. Rebuild static web and finance contracts.
6. Optionally extract Power BI semantic aggregates.
7. Validate generated data.
8. Commit and push `docs/landcare/data/` if changed.
9. Write local status JSON and transcripts.

These scripts remain tracked as recovery and audit references. They are not instructions to register a new scheduled task.

## Reactivation gate

Do not reactivate the 7 AM process unless a current product requirement cannot be met by live ArcGIS, secure Power BI, or the existing compatibility files. Reactivation requires all of the following:

- A named data consumer and owner.
- An organization-managed Windows automation account.
- Read-only PostgreSQL credentials with an explicit database host.
- A repository-scoped deploy key, not a personal credential.
- Documented Power BI or Survey123 configuration if those stages are enabled.
- Python, survey-layer, Pages, and live ArcGIS validation.
- One checked manual run and two unattended successful cycles.
- Updated architecture and handover status.

## Failure ownership

| Failure | Owner |
|---|---|
| 4 AM Regrid download, GISDB load, or ArcGIS publication | GIS/data operations |
| ArcGIS layer schema, periods, or counts | GIS/data operations and application owner |
| GitHub Pages deployment | Repository maintainer |
| Power BI report access or values | Finance/BI owner |
| Deprecated task still enabled under a departing account | GIS VM administrator |

See [`../handover/04-readiness-checklist.md`](../handover/04-readiness-checklist.md) for final sign-off.
