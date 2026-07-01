# LandCare Platform Architecture: ESRI, Codex, and Power Platform

Last updated: 2026-07-01

## Architecture Summary

LandCare uses a hardened hybrid architecture:

| Platform | Role | Owns | Does not own |
|---|---|---|---|
| ESRI / ArcGIS | Mapping layer and live current-parcel reference | Current parcel geography, current parcel attributes, map context, live FeatureServer access | Historical assurance metrics, CI/CD, dashboard build logic |
| Codex + GitHub + VM | Web app builder, data build runner, QA/QC, publish path | Custom web app, source-controlled scripts, daily refresh, generated dashboard files, operational run logs | Source-system editing, Power BI semantic model ownership |
| Power Platform | Orchestration, monitoring, reporting, and workflow layer | Power Automate monitoring/alerts, Power BI consumption, future review/approval workflows | Core Python data build, ESRI map services, GitHub source control |

The custom Codex-built web app remains the primary user-facing dashboard. ArcGIS supplies live map layers and current parcel geography. The VM remains the controlled build/publish runner until a future CI/CD runner is approved.

## Daily Operating Flow

1. Overnight source processes update ArcGIS, PostgreSQL/PostGIS, and the LandCare finance workbook.
2. Windows Task Scheduler runs the VM refresh job after overnight jobs finish.
3. The refresh job pulls latest GitHub code, loads VM-local `.env`, exports PostgreSQL data, rebuilds web JSON/GeoJSON, rebuilds finance data from Excel, and runs QA/QC.
4. If `docs/landcare/data` changed, the VM commits and pushes those generated dashboard files to GitHub.
5. If the generated files are unchanged, the VM logs a successful checked-and-unchanged run without creating a commit.
6. The web app uses checked-in static dashboard data plus live ESRI map-layer queries.
7. Power Automate reads the status artifact and alerts on failure, stale status, or QA-blocked outcomes.
8. Power BI consumes the same published summary outputs or a curated mirror of those outputs.

## Power Automate Contract

Power Automate should monitor this machine-readable artifact on the VM:

```text
C:\srv\logs\land-care-assurance\daily-refresh-status.json
```

Each run also writes a dated copy:

```text
C:\srv\logs\land-care-assurance\daily-refresh-status-YYYY-MM-DD.json
```

Expected fields:

| Field | Meaning |
|---|---|
| `status` | `success` or `failed` |
| `outcome` | `published`, `unchanged`, or `failed` |
| `run_date` | Local run date in `YYYY-MM-DD` |
| `started_at`, `finished_at` | ISO timestamps for run duration and freshness checks |
| `repo_root`, `branch` | VM repo path and Git branch used by the runner |
| `commit_before`, `commit_after` | Git commit before and after the run |
| `published_data_changes` | `true` only when generated dashboard data was committed and pushed |
| `log_path` | Transcript log for human troubleshooting |
| `failed_stage` | Last refresh stage when a failure occurred |
| `message` | Human-readable success or failure summary |

Power Automate alert conditions:

| Condition | Severity | Action |
|---|---|---|
| Status file missing after expected run window | High | Alert dashboard owner and check Task Scheduler |
| `run_date` is not today | High | Alert stale refresh |
| `status = failed` | High | Alert with `failed_stage`, `message`, and `log_path` |
| `status = success` and `outcome = unchanged` | Info | Record successful daily check; no data publication needed |
| `status = success` and `outcome = published` | Info | Record successful publication and include `commit_after` |

## Source Ownership Rules

| Question | Primary source | Reason |
|---|---|---|
| What is the current LandCare parcel universe? | ArcGIS `gisdb_gis_epp_parcels_full` live query | ESRI is the freshest current-state map layer |
| What was assigned and returned for a reporting month? | PostgreSQL read-only export | Historical assurance facts require stable monthly assignment and survey matching |
| What does the public dashboard consume? | `docs/landcare/data` generated files | GitHub-published files are the web app data contract |
| What are current finance, contract, and invoice metrics? | LandCare finance workbook, with optional Postgres parity | Workbook is current finance source until a structured finance store replaces it |
| What should Power BI consume? | Same generated dashboard outputs or a curated mirror | Prevents metric drift between web dashboard and Power BI |

## Rollout Phases

| Phase | Implementation |
|---|---|
| Phase 1: Harden current runner | Keep VM Task Scheduler runner, GitHub publish path, daily logs, QA gates, and status JSON. Confirm VM git auth can pull/push non-interactively. |
| Phase 2: Power Platform monitoring | Build Power Automate flow that checks `daily-refresh-status.json` after the run window and sends success/failure/stale notifications. |
| Phase 3: Power BI alignment | Point Power BI to the generated summary outputs or a curated mirror with the same definitions as the web app. |
| Phase 4: Operational workflows | Add Power Apps, SharePoint, or Dataverse only for intake, correction requests, approvals, and non-technical review workflows. |

