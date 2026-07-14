param(
  [string]$TaskName = "LandCare Daily Dashboard Refresh",
  [string]$TaskPath = "\GIS Automations\",
  [string]$LogRoot = "C:\srv\logs\land-care-assurance",
  [int]$TimeoutMinutes = 20
)

$ErrorActionPreference = "Stop"
$normalizedTaskPath = if ($TaskPath.StartsWith("\")) { $TaskPath } else { "\$TaskPath" }
$normalizedTaskPath = if ($normalizedTaskPath.EndsWith("\")) { $normalizedTaskPath } else { "$normalizedTaskPath\" }
$task = Get-ScheduledTask -TaskName $TaskName -TaskPath $normalizedTaskPath
if ($task.Principal.LogonType -ne "Password") {
  throw "Task logon type must be Password to prove a logged-off run; got '$($task.Principal.LogonType)'."
}

$startedAt = Get-Date
Start-ScheduledTask -TaskName $TaskName -TaskPath $normalizedTaskPath
$deadline = $startedAt.AddMinutes($TimeoutMinutes)
do {
  Start-Sleep -Seconds 10
  $task = Get-ScheduledTask -TaskName $TaskName -TaskPath $normalizedTaskPath
} while ($task.State -eq "Running" -and (Get-Date) -lt $deadline)

$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -TaskPath $normalizedTaskPath
$statusPath = Join-Path $LogRoot "daily-refresh-status.json"
if (-not (Test-Path -LiteralPath $statusPath)) { throw "Scheduled task finished but did not create $statusPath" }
$status = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
$evidence = [ordered]@{
  verified_at = (Get-Date).ToString("o")
  task_name = "$normalizedTaskPath$TaskName"
  run_as = $task.Principal.UserId
  logon_type = $task.Principal.LogonType
  run_level = $task.Principal.RunLevel
  task_state = $task.State.ToString()
  last_run_time = $taskInfo.LastRunTime.ToString("o")
  last_task_result = $taskInfo.LastTaskResult
  status_path = $statusPath
  refresh_status = $status.status
  refresh_outcome = $status.outcome
  refresh_run_date = $status.run_date
  refresh_finished_at = $status.finished_at
  refresh_log_path = $status.log_path
}
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null
$evidencePath = Join-Path $LogRoot "scheduled-refresh-verification-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').json"
$evidence | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $evidencePath -Encoding UTF8

if ($task.State -eq "Running") { throw "Scheduled task exceeded the $TimeoutMinutes minute verification window. Evidence: $evidencePath" }
if ($taskInfo.LastTaskResult -ne 0) { throw "Scheduled task returned $($taskInfo.LastTaskResult). Evidence: $evidencePath" }
if ($status.status -ne "success" -or $status.run_date -ne (Get-Date -Format "yyyy-MM-dd")) {
  throw "Refresh status is not a successful same-day run. Evidence: $evidencePath"
}

Write-Host "Scheduled refresh verified. Evidence: $evidencePath"
