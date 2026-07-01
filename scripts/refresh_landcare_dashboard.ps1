param(
  [string]$RepoRoot = "C:\srv\land-care-assurance",
  [string]$Python = "$RepoRoot\.venv\Scripts\python.exe",
  [string]$LogRoot = "C:\srv\logs\land-care-assurance",
  [string]$Branch = "master",
  [string]$StatusPath = ""
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $RepoRoot

New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$runDate = Get-Date -Format "yyyy-MM-dd"
$logPath = Join-Path $LogRoot "daily-refresh-$runDate.log"
$datedStatusPath = Join-Path $LogRoot "daily-refresh-status-$runDate.json"
if (-not $StatusPath) {
  $StatusPath = Join-Path $LogRoot "daily-refresh-status.json"
}
$tempDir = Join-Path $env:TEMP "landcare-refresh-$runDate"
$dataPathSpec = "docs/landcare/data"
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$startedAt = Get-Date
$currentStage = "initializing"
$outcome = "failed"
$message = ""
$commitBefore = ""
$commitAfter = ""
$publishedDataChanges = $false

function Get-GitCommit {
  try {
    $commit = git rev-parse HEAD 2>$null
    if ($LASTEXITCODE -eq 0) {
      return ($commit | Select-Object -First 1)
    }
  } catch {
    return ""
  }
  return ""
}

function Write-RunStatus {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Status,
    [Parameter(Mandatory=$true)]
    [string]$Outcome,
    [string]$Message = "",
    [string]$FailedStage = ""
  )

  $finishedAt = Get-Date
  $statusPayload = [ordered]@{
    schema_version = 1
    app = "land-care-assurance"
    status = $Status
    outcome = $Outcome
    run_date = $runDate
    started_at = $startedAt.ToString("o")
    finished_at = $finishedAt.ToString("o")
    duration_seconds = [math]::Round(($finishedAt - $startedAt).TotalSeconds, 3)
    repo_root = $RepoRoot
    branch = $Branch
    commit_before = $commitBefore
    commit_after = $commitAfter
    data_path = $dataPathSpec
    published_data_changes = $publishedDataChanges
    log_path = $logPath
    failed_stage = $FailedStage
    message = $Message
  }

  $statusJson = $statusPayload | ConvertTo-Json -Depth 4
  Set-Content -LiteralPath $StatusPath -Value $statusJson -Encoding UTF8
  Set-Content -LiteralPath $datedStatusPath -Value $statusJson -Encoding UTF8
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Label,
    [Parameter(Mandatory=$true)]
    [scriptblock]$Command
  )

  $script:currentStage = $Label
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
  $commitBefore = Get-GitCommit

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
    $commitAfter = Get-GitCommit
    $outcome = "unchanged"
    $message = "Daily refresh validated successfully; generated dashboard data matched the checked-in data."
    Write-RunStatus -Status "success" -Outcome $outcome -Message $message
    return
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
  $publishedDataChanges = $true
  $commitAfter = Get-GitCommit
  $outcome = "published"
  $message = "Daily refresh validated successfully and published changed dashboard data."
  Write-RunStatus -Status "success" -Outcome $outcome -Message $message
}
catch {
  $commitAfter = Get-GitCommit
  $message = $_.Exception.Message
  Write-RunStatus -Status "failed" -Outcome "failed" -Message $message -FailedStage $currentStage
  throw
}
finally {
  Write-Host "LandCare daily refresh finished at $(Get-Date -Format o)"
  Stop-Transcript | Out-Null
}
