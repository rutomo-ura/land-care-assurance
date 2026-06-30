param(
  [string]$RepoRoot = "C:\srv\land-care-assurance",
  [string]$Python = "$RepoRoot\.venv\Scripts\python.exe"
)

$ErrorActionPreference = "Stop"

Set-Location -LiteralPath $RepoRoot

if (Test-Path ".env") {
  Get-Content ".env" | ForEach-Object {
    if ($_ -match "^\s*#" -or $_ -notmatch "=") { return }
    $name, $value = $_ -split "=", 2
    [Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim(), "Process")
  }
}

& $Python scripts\export_landcare_postgres_data.py
& $Python scripts\build_landcare_web_data.py
& $Python scripts\build_landcare_finance_data.py

git add docs\landcare\data
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No dashboard data changes to publish."
  exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Refresh LandCare dashboard data $stamp"
git push origin master
