# LandCare Assurance v1.0

LandCare Assurance is a map-first operational product for URA LandCare: a contractor selects an assigned parcel, submits field evidence, URA reviews it, and supervisors monitor trusted Regrid, assignment, and approved-evidence context.

Public application:

- [Map Monitor](https://ura-gis.github.io/land-care-assurance/monitoring/)
- [KPI Dashboard](https://ura-gis.github.io/land-care-assurance/kpi/)
- [Survey Submission](https://ura-gis.github.io/land-care-assurance/survey-submission/)
- [Public Survey123 form](https://survey123.arcgis.com/share/02a003254ba546c28b4997b42e0f220b)

## Start here

| Need | Read this |
|---|---|
| **Take over this project** | [`handover/`](handover/) - owner guide, agent playbook, and briefing deck |
| Run the repository and Pages cutover | [`HANDOVER.md`](HANDOVER.md) and [`AGENTS.md`](AGENTS.md) |
| Understand the full data and submission lifecycle | [`docs/landcare-submission-and-evidence-flow.md`](docs/landcare-submission-and-evidence-flow.md) |
| Understand sources, metric rules, runtime layers, and daily refresh | [`docs/landcare-architecture.md`](docs/landcare-architecture.md) |
| Refresh NetSuite check-request actuals for KPI | [`docs/netsuite-landcare-finance-source.md`](docs/netsuite-landcare-finance-source.md) |
| Operate the VM daily refresh | [`docs/task-scheduler-vm-operations.md`](docs/task-scheduler-vm-operations.md) |
| Configure Survey123 review, webhook, PostgreSQL, and public evidence | [`docs/survey123-landcare-network-setup.md`](docs/survey123-landcare-network-setup.md) |
| Present or hand over the product | [`docs/v1.0-operational-handover.md`](docs/v1.0-operational-handover.md) and [`docs/v1.0-presentation-script.md`](docs/v1.0-presentation-script.md) |

## Core operating rules

- **Completion evidence is displayed at the assignment polygon.** The Map and KPI completion numerator uses raw survey records whose parcel key matches an assignment; unique completed parcels remain diagnostic only. The Survey123 point is never displayed on the public map.
- **Contractors can choose a parcel from the list or directly on the map.** Both controls use the same assignment ID and prefill the same Survey123 fields.
- **Public intake is anonymous; evidence is validated.** A Survey123 record affects the dashboard only when its parcel, period, contractor, and assignment ID match an authoritative assignment. A photo is optional and shown when available.
- **Images are lazy-loaded.** Map Monitor exposes a safe full-image link for existing Regrid photos and, once the VM endpoint is enabled, approved Survey123 photos.

---

# LandCare Daily Refresh VM Bundle

Architecture: [`docs/landcare-architecture.md`](docs/landcare-architecture.md)

This bundle bootstraps or updates the LandCare dashboard repo on the VM, then installs the daily refresh scripts.

## What It Includes

- `scripts\refresh_landcare_dashboard.ps1`
- `scripts\validate_landcare_daily_refresh.py`
- `scripts\register_landcare_daily_refresh_task.ps1`
- `data engineering\current-data-qaqc-source-inventory.md`
- `install_landcare_daily_refresh.ps1`

## Install

Copy this extracted folder to the VM, then run PowerShell from the bundle folder. `C:\srv\GISWebApp` is treated as the umbrella folder; this installer clones or updates the LandCare repo one level below it.

```powershell
.\install_landcare_daily_refresh.ps1 -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance
```

## Install With Database Settings

Database credentials are VM-local and should not be committed. Let the installer prompt for the PostgreSQL password when writing `.env`:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `
  -PgHost 10.0.101.57 `
  -PgPort 5432 `
  -PgDb gisdb `
  -PgUser rutomo `
  -PromptForPgPassword
```

When a password is supplied, the installer writes VM-local credentials to:

```powershell
C:\srv\GISWebApp\land-care-assurance\.env
```

Existing `.env` files are backed up before replacement. The `.env` file is not part of the bundle and should not be committed.

To update the existing daily 7:00 AM `LandCare-Daily-Dashboard-Refresh.task` job under `Task Scheduler Library\GIS Automations`:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `
  -RegisterTask `
  -TaskUser "DOMAIN\landcare-refresh" `
  -PromptForTaskPassword
```

Use the approved VM service account, not an interactive personal account. The password is stored only by Windows Task Scheduler so the job can run whether or not anyone is logged on. Registration configures highest privilege, three 15-minute retries, a two-hour execution limit, and catch-up for a missed start.

To install, create `.env`, register the task, and immediately run one checked refresh:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `
  -RegisterTask `
  -TaskUser "DOMAIN\landcare-refresh" `
  -PromptForTaskPassword `
  -RunOnce
```

## Safety Behavior

- Existing target files are backed up beside the originals with a `.bak-YYYYMMDD-HHMMSS` suffix before replacement.
- If the target folder is empty, the installer clones `https://github.com/ura-gis/land-care-assurance.git`.
- If the target folder is already a git repo, the installer fetches, checks out `master`, and runs `git pull --ff-only`.
- If the target folder is non-empty and not a git repo, the installer stops without changing it.
- The installer only creates or modifies `.env` when a PostgreSQL password is supplied or prompted.
- The installer only runs the refresh job when `-RunOnce` is supplied.
- The scheduled task registration only happens when `-RegisterTask` is supplied.

## After Install

Manual checked refresh command:

```powershell
.\scripts\refresh_landcare_dashboard.ps1 -RepoRoot C:\srv\GISWebApp\land-care-assurance
```

Validate existing generated outputs only:

```powershell
.\.venv\Scripts\python.exe scripts\validate_landcare_daily_refresh.py
```

Daily logs are written to:

```powershell
C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log
```
