param(
  [string]$RepoRoot = "C:\srv\land-care-assurance",
  [string]$Python = "$RepoRoot\.venv\Scripts\python.exe",
  [string]$LogRoot = "C:\srv\logs\land-care-assurance",
  [string]$Branch = "master"
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $RepoRoot

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$runDate = Get-Date -Format "yyyy-MM-dd"
$logPath = Join-Path $LogRoot "daily-refresh-$runDate.log"
$tempDir = Join-Path $env:TEMP "landcare-refresh-$runDate"
$dataPathSpec = "docs/landcare/data"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Label,
    [Parameter(Mandatory=$true)]
    [scriptblock]$Command
  )

  Write-Host "[$(Get-Date -Format o)] Starting: $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
  Write-Host "[$(Get-Date -Format o)] Finished: $Label"
}

Start-Transcript -Path $logPath -Append | Out-Null

try {
  Write-Host "LandCare daily refresh started at $(Get-Date -Format o)"

  if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
      if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
      $name, $value = $_ -split "=", 2
      [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
    }
  }

  Invoke-Checked "Pull latest repository changes" {
    git pull --ff-only origin $Branch
  }

  if (-not (Test-Path -LiteralPath $Python)) {
    $venvPath = Join-Path $RepoRoot ".venv"
    $pythonLauncher = Get-Command py -ErrorAction SilentlyContinue
    $systemPython = Get-Command python -ErrorAction SilentlyContinue

    if ($pythonLauncher) {
      Invoke-Checked "Create Python virtual environment" {
        & py -3 -m venv $venvPath
      }
    } elseif ($systemPython) {
      Invoke-Checked "Create Python virtual environment" {
        & python -m venv $venvPath
      }
    } else {
      throw "No Python executable found. Install Python or pass -Python to this script."
    }
  }

  Invoke-Checked "Install refresh Python requirements" {
    & $Python -m pip install -r requirements-landcare-refresh.txt
  }

  $previousManifest = Join-Path $tempDir "previous-refresh_manifest.json"
  $previousKpi = Join-Path $tempDir "previous-kpi_summary.json"
  if (Test-Path "docs\landcare\data\refresh_manifest.json") {
    Copy-Item "docs\landcare\data\refresh_manifest.json" $previousManifest -Force
  }
  if (Test-Path "docs\landcare\data\kpi_summary.json") {
    Copy-Item "docs\landcare\data\kpi_summary.json" $previousKpi -Force
  }

  Invoke-Checked "PostgreSQL app-ready GeoJSON export" {
    & $Python scripts\export_landcare_postgres_data.py
  }
  Invoke-Checked "Web data rebuild" {
    & $Python scripts\build_landcare_web_data.py
  }
  Invoke-Checked "Finance data rebuild" {
    & $Python scripts\build_landcare_finance_data.py
  }

  $qaArgs = @("scripts\validate_landcare_daily_refresh.py")
  if (Test-Path $previousManifest) {
    $qaArgs += @("--previous-manifest", $previousManifest)
  }
  if (Test-Path $previousKpi) {
    $qaArgs += @("--previous-kpi-summary", $previousKpi)
  }
  Invoke-Checked "Daily QA/QC validation" {
    & $Python @qaArgs
  }

  Invoke-Checked "Stage dashboard data files" {
    git add $dataPathSpec
  }

  git diff --cached --quiet -- $dataPathSpec
  if ($LASTEXITCODE -eq 0) {
    Write-Host "No dashboard data changes to publish."
    exit 0
  }
  if ($LASTEXITCODE -gt 1) {
    throw "git diff failed with exit code $LASTEXITCODE"
  }

  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
  Invoke-Checked "Commit refreshed dashboard data" {
    git commit -m "Refresh LandCare dashboard data $stamp" -- $dataPathSpec
  }
  Invoke-Checked "Push refreshed dashboard data" {
    git push origin master
  }
}
finally {
  Write-Host "LandCare daily refresh finished at $(Get-Date -Format o)"
  Stop-Transcript | Out-Null
}
