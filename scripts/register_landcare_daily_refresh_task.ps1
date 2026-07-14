param(
  [string]$RepoRoot = "C:\srv\GISWebApp\land-care-assurance",
  [string]$TaskName = "LandCare-Daily-Dashboard-Refresh.task",
  [string]$TaskPath = "\GIS Automations\",
  [string]$StartTime = "07:00",
  [Parameter(Mandatory=$true)]
  [string]$TaskUser,
  [SecureString]$TaskPassword,
  [switch]$PromptForTaskPassword
)

$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $RepoRoot "scripts\refresh_landcare_dashboard.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Refresh script not found: $scriptPath"
}
if (-not $TaskPassword -and $PromptForTaskPassword) {
  $TaskPassword = Read-Host -AsSecureString "Password for scheduled-task account $TaskUser"
}
if (-not $TaskPassword) {
  throw "Provide -TaskPassword or -PromptForTaskPassword. A password-backed service account is required so the task can run while no user is logged on."
}
if ($StartTime -notmatch '^([01]\d|2[0-3]):[0-5]\d$') {
  throw "StartTime must be in 24-hour HH:mm format; got '$StartTime'."
}

$normalizedTaskPath = if ($TaskPath.StartsWith("\")) { $TaskPath } else { "\$TaskPath" }
$normalizedTaskPath = if ($normalizedTaskPath.EndsWith("\")) { $normalizedTaskPath } else { "$normalizedTaskPath\" }
$startAt = [datetime]::ParseExact($StartTime, "HH:mm", $null)
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -RepoRoot `"$RepoRoot`""
$taskTrigger = New-ScheduledTaskTrigger -Daily -At $startAt
$taskSettings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

$plainPassword = [System.Net.NetworkCredential]::new('', $TaskPassword).Password
try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -TaskPath $normalizedTaskPath `
    -Action $taskAction `
    -Trigger $taskTrigger `
    -Settings $taskSettings `
    -User $TaskUser `
    -Password $plainPassword `
    -RunLevel Highest `
    -Force | Out-Null
} finally {
  $plainPassword = $null
}

$registered = Get-ScheduledTask -TaskName $TaskName -TaskPath $normalizedTaskPath
if ($registered.Principal.UserId -ne $TaskUser) {
  throw "Task was registered, but its principal '$($registered.Principal.UserId)' does not match '$TaskUser'."
}
if ($registered.Principal.LogonType -ne "Password") {
  throw "Task must use password logon to run while logged off; got '$($registered.Principal.LogonType)'."
}

Write-Host "Registered '$normalizedTaskPath$TaskName' to run daily at $StartTime as $TaskUser with three 15-minute retries."
