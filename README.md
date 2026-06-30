# LandCare Daily Refresh VM Bundle

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

This credential-included bundle defaults to:


Run this to install/update the repo and write the VM-local `.env`:

```powershell
.\install_landcare_daily_refresh.ps1 -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance
```

To avoid using the embedded default, let the installer prompt for the PostgreSQL password:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `
  -PgHost 10.0.101.57 `
  -PgPort 5432 `
  -PgDb gisdb `
  -PgUser rutomo `
  -PromptForPgPassword
```

Fast path, if command history exposure is acceptable:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `

When a password is supplied, the installer writes VM-local credentials to:

```powershell
C:\srv\GISWebApp\land-care-assurance\.env
```

Existing `.env` files are backed up before replacement. The `.env` file is not part of the bundle and should not be committed.

To also register the daily 7:00 AM Task Scheduler job under `Task Scheduler Library\GIS Automations`:

```powershell
.\install_landcare_daily_refresh.ps1 -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance -RegisterTask
```

To install, create `.env`, register the task, and immediately run one checked refresh:

```powershell
.\install_landcare_daily_refresh.ps1 `
  -TargetRepoRoot C:\srv\GISWebApp\land-care-assurance `
  -RegisterTask `
  -RunOnce
```

## Safety Behavior

- Existing target files are backed up beside the originals with a `.bak-YYYYMMDD-HHMMSS` suffix before replacement.
- If the target folder is empty, the installer clones `https://github.com/rutomo-ura/land-care-assurance.git`.
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
