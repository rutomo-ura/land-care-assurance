param(
  [string]$RepoRoot = "C:\srv\land-care-assurance",
  [string]$TaskName = "LandCare Daily Dashboard Refresh",
  [string]$TaskPath = "\GIS Automations\",
  [string]$StartTime = "07:00"
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $RepoRoot "scripts\refresh_landcare_dashboard.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Refresh script not found: $scriptPath"
}

$normalizedTaskPath = $TaskPath
if (-not $normalizedTaskPath.StartsWith("\")) {
  $normalizedTaskPath = "\$normalizedTaskPath"
}
if (-not $normalizedTaskPath.EndsWith("\")) {
  $normalizedTaskPath = "$normalizedTaskPath\"
}

$taskNameWithPath = "$normalizedTaskPath$TaskName"
$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -RepoRoot `"$RepoRoot`""

& schtasks.exe /Create /TN $taskNameWithPath /SC DAILY /ST $StartTime /TR $taskCommand /F
if ($LASTEXITCODE -ne 0) {
  throw "schtasks.exe failed to register '$taskNameWithPath' with exit code $LASTEXITCODE"
}

Write-Host "Registered '$taskNameWithPath' to run daily at $StartTime."
