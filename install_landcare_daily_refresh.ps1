param(
  [string]$TargetRepoRoot = "C:\srv\GISWebApp\land-care-assurance",
  [string]$RepositoryUrl = "https://github.com/ura-gis/land-care-assurance.git",
  [string]$Branch = "master",
  [string]$PgHost,
  [int]$PgPort = 5432,
  [string]$PgDb,
  [string]$PgUser,
  [SecureString]$PgPassword,
  [switch]$PromptForPgPassword,
  [switch]$RegisterTask,
  [string]$TaskUser,
  [SecureString]$TaskPassword,
  [switch]$PromptForTaskPassword,
  [switch]$RunOnce
)

$ErrorActionPreference = "Stop"
$BundleRoot = $PSScriptRoot

function Backup-And-Copy {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Source)) { throw "Bundle file missing: $Source" }
  if (Test-Path -LiteralPath $Destination) {
    Copy-Item -LiteralPath $Destination -Destination "$Destination.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

if (-not (Test-Path -LiteralPath $TargetRepoRoot)) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetRepoRoot) | Out-Null
  git clone --branch $Branch $RepositoryUrl $TargetRepoRoot
  if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }
} else {
  $children = Get-ChildItem -LiteralPath $TargetRepoRoot -Force
  $targetGitPath = Join-Path $TargetRepoRoot ".git"
  if (-not (Test-Path -LiteralPath $targetGitPath)) {
    if ($children.Count -gt 0) {
      throw "Target exists and is not a Git repository: $TargetRepoRoot"
    }
    git clone --branch $Branch $RepositoryUrl $TargetRepoRoot
    if ($LASTEXITCODE -ne 0) { throw "git clone failed with exit code $LASTEXITCODE" }
  }
}

Set-Location -LiteralPath $TargetRepoRoot
git fetch origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git fetch failed with exit code $LASTEXITCODE" }
git checkout $Branch
if ($LASTEXITCODE -ne 0) { throw "git checkout failed with exit code $LASTEXITCODE" }
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { throw "git pull failed with exit code $LASTEXITCODE" }

$bundleFiles = @(
  "requirements-landcare-refresh.txt",
  "README.md",
  "docs\landcare-architecture.md",
  "docs\task-scheduler-vm-operations.md",
  "power-platform\daily-refresh-status.schema.json",
  "scripts\refresh_landcare_dashboard.ps1",
  "scripts\register_landcare_daily_refresh_task.ps1",
  "scripts\test_landcare_scheduled_refresh.ps1",
  "scripts\validate_landcare_daily_refresh.py",
  "scripts\export_landcare_postgres_data.py",
  "scripts\build_landcare_web_data.py",
  "scripts\build_landcare_finance_data.py"
)
foreach ($relativePath in $bundleFiles) {
  Backup-And-Copy -Source (Join-Path $BundleRoot $relativePath) -Destination (Join-Path $TargetRepoRoot $relativePath)
}

if ($PromptForPgPassword -and -not $PgPassword) {
  $PgPassword = Read-Host -AsSecureString "PostgreSQL password for $PgUser"
}
if ($PgPassword) {
  if (-not $PgHost -or -not $PgDb -or -not $PgUser) {
    throw "PgHost, PgDb, and PgUser are required when writing PostgreSQL credentials."
  }
  $plainPgPassword = [System.Net.NetworkCredential]::new('', $PgPassword).Password
  try {
    $envPath = Join-Path $TargetRepoRoot ".env"
    if (Test-Path -LiteralPath $envPath) {
      Copy-Item -LiteralPath $envPath -Destination "$envPath.bak-$(Get-Date -Format 'yyyyMMdd-HHmmss')" -Force
    }
    @("PG_HOST=$PgHost", "PG_PORT=$PgPort", "PG_DB=$PgDb", "PG_USER=$PgUser", "PG_PASSWORD=$plainPgPassword") |
      Set-Content -LiteralPath $envPath -Encoding UTF8
  } finally {
    $plainPgPassword = $null
  }
}

if ($RegisterTask) {
  if (-not $TaskUser) { throw "TaskUser is required with -RegisterTask." }
  & (Join-Path $TargetRepoRoot "scripts\register_landcare_daily_refresh_task.ps1") `
    -RepoRoot $TargetRepoRoot `
    -TaskUser $TaskUser `
    -TaskPassword $TaskPassword `
    -PromptForTaskPassword:$PromptForTaskPassword
}

if ($RunOnce) {
  & (Join-Path $TargetRepoRoot "scripts\refresh_landcare_dashboard.ps1") -RepoRoot $TargetRepoRoot
}

Write-Host "LandCare daily refresh installation completed for $TargetRepoRoot."
