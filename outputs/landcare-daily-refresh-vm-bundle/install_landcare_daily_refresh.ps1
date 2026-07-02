param(
  [string]$TargetRepoRoot = "C:\srv\GISWebApp\land-care-assurance",
  [string]$RepoUrl = "https://github.com/rutomo-ura/land-care-assurance.git",
  [string]$Branch = "master",
  [string]$Python = "",
  [string]$PgHost = "10.0.101.57",
  [string]$PgPort = "5432",
  [string]$PgDb = "gisdb",
  [string]$PgUser = "rutomo",
  [string]$PgPassword = "rutomo_pg2026",
  [switch]$PromptForPgPassword,
  [switch]$RegisterTask,
  [switch]$RunOnce,
  [string]$TaskName = "LandCare Daily Dashboard Refresh",
  [string]$TaskPath = "\GIS Automations\",
  [string]$StartTime = "07:00"
)

$ErrorActionPreference = "Stop"

$BundleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Label,
    [Parameter(Mandatory=$true)]
    [scriptblock]$Command
  )

  Write-Host "Starting: $Label"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
  Write-Host "Finished: $Label"
}

if (-not (Test-Path -LiteralPath $TargetRepoRoot)) {
  New-Item -ItemType Directory -Force -Path $TargetRepoRoot | Out-Null
}

$gitDir = Join-Path $TargetRepoRoot ".git"
$existingItems = @(Get-ChildItem -LiteralPath $TargetRepoRoot -Force)

if (Test-Path -LiteralPath $gitDir) {
  Push-Location $TargetRepoRoot
  try {
    Invoke-Checked "Fetch latest repository changes" {
      git fetch origin $Branch
    }
    Invoke-Checked "Checkout $Branch" {
      git checkout $Branch
    }
    Invoke-Checked "Pull latest $Branch" {
      git pull --ff-only origin $Branch
    }
  }
  finally {
    Pop-Location
  }
} elseif ($existingItems.Count -eq 0) {
  $parent = Split-Path -Parent $TargetRepoRoot
  $leaf = Split-Path -Leaf $TargetRepoRoot
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Push-Location $parent
  try {
    Remove-Item -LiteralPath $TargetRepoRoot -Force
    Invoke-Checked "Clone $RepoUrl into $TargetRepoRoot" {
      git clone --branch $Branch $RepoUrl $leaf
    }
  }
  finally {
    Pop-Location
  }
} else {
  throw "Target folder is not empty and is not a git repo: $TargetRepoRoot. Move its contents or choose an empty/repo folder."
}

if (-not $Python) {
  $Python = Join-Path $TargetRepoRoot ".venv\Scripts\python.exe"
}

if ($PromptForPgPassword -and -not $PgPassword) {
  $securePassword = Read-Host "Enter PostgreSQL password for $PgUser@$PgHost/$PgDb" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Copy-WithBackup {
  param(
    [Parameter(Mandatory=$true)]
    [string]$RelativePath
  )

  $source = Join-Path $BundleRoot $RelativePath
  $target = Join-Path $TargetRepoRoot $RelativePath
  $targetDir = Split-Path -Parent $target

  if (-not (Test-Path -LiteralPath $source)) {
    throw "Bundle file is missing: $source"
  }

  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

  if (Test-Path -LiteralPath $target) {
    $backup = "$target.bak-$Stamp"
    Copy-Item -LiteralPath $target -Destination $backup -Force
    Write-Host "Backed up $target to $backup"
  }

  Copy-Item -LiteralPath $source -Destination $target -Force
  Write-Host "Installed $RelativePath"
}

Copy-WithBackup "scripts\refresh_landcare_dashboard.ps1"
Copy-WithBackup "scripts\validate_landcare_daily_refresh.py"
Copy-WithBackup "scripts\register_landcare_daily_refresh_task.ps1"
Copy-WithBackup "data engineering\current-data-qaqc-source-inventory.md"
Copy-WithBackup "data engineering\platform-architecture-esri-codex-power-platform.md"
Copy-WithBackup "docs\landcare-architecture.md"
Copy-WithBackup "docs\landcare-data-engineering-flow.md"
Copy-WithBackup "docs\landcare-production-data-engineering-plan.md"
Copy-WithBackup "docs\task-scheduler-vm-operations.md"
Copy-WithBackup "docs\upstream-regrid-survey-pipeline.md"
Copy-WithBackup "docs\vm-smoke-test-regrid-daily-sync.md"

if ($PgPassword) {
  $envPath = Join-Path $TargetRepoRoot ".env"
  if (Test-Path -LiteralPath $envPath) {
    $envBackup = "$envPath.bak-$Stamp"
    Copy-Item -LiteralPath $envPath -Destination $envBackup -Force
    Write-Host "Backed up existing .env to $envBackup"
  }

  $envLines = @(
    "PG_HOST=$PgHost",
    "PG_PORT=$PgPort",
    "PG_DB=$PgDb",
    "PG_USER=$PgUser",
    "PG_PASSWORD=$PgPassword"
  )
  Set-Content -LiteralPath $envPath -Value $envLines -Encoding ASCII
  Write-Host "Wrote VM-local .env PostgreSQL settings to $envPath. Password was not printed."
} else {
  Write-Host "No PostgreSQL password supplied; skipped .env creation."
}

if (Test-Path -LiteralPath $Python) {
  & $Python -m py_compile (Join-Path $TargetRepoRoot "scripts\validate_landcare_daily_refresh.py")
  if ($LASTEXITCODE -ne 0) {
    throw "Python validation script compile check failed."
  }
  Write-Host "Python validation script compile check passed."
} else {
  Write-Host "Python not found at $Python; skipped compile check."
}

if ($RegisterTask) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $TargetRepoRoot "scripts\register_landcare_daily_refresh_task.ps1") `
    -RepoRoot $TargetRepoRoot `
    -TaskName $TaskName `
    -TaskPath $TaskPath `
    -StartTime $StartTime

  if ($LASTEXITCODE -ne 0) {
    throw "Task Scheduler registration failed."
  }
}

if ($RunOnce) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass `
    -File (Join-Path $TargetRepoRoot "scripts\refresh_landcare_dashboard.ps1") `
    -RepoRoot $TargetRepoRoot

  if ($LASTEXITCODE -ne 0) {
    throw "One-time refresh run failed."
  }
}

Write-Host "LandCare daily refresh bundle install complete."
