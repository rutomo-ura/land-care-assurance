@echo off
setlocal DisableDelayedExpansion

rem One-time LandCare Survey123 evidence bootstrap for the URA VM.
rem Safe to rerun: the SQL migration and canonical reconciliation are idempotent.

set "REPO_ROOT=%~dp0"
if "%REPO_ROOT:~-1%"=="\" set "REPO_ROOT=%REPO_ROOT:~0,-1%"
set "SECRETS_FILE=C:\srv\secrets\.env"
set "ARCGIS_PYTHON=C:\Program Files\ArcGIS\Pro\bin\Python\envs\arcgispro-py3\python.exe"
set "PSQL_PATH="

if not "%~1"=="" set "SECRETS_FILE=%~1"
if not "%~2"=="" set "ARCGIS_PYTHON=%~2"

echo.
echo === LandCare Survey123 Evidence Parcel Bootstrap ===
echo Repository: %REPO_ROOT%
echo Secrets:    %SECRETS_FILE%

if not exist "%SECRETS_FILE%" (
  echo ERROR: VM secrets file not found: %SECRETS_FILE%
  exit /b 1
)

rem Load KEY=VALUE entries without echoing values. Keep the secrets file outside Git.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%SECRETS_FILE%") do set "%%A=%%B"

if "%LANDCARE_PG_DSN%"=="" if "%PG_DB%"=="" (
  echo ERROR: Set LANDCARE_PG_DSN or the existing Regrid PG_DB/PG_USER/PG_PWD values in %SECRETS_FILE%
  exit /b 1
)
if "%SURVEY123_FEATURE_LAYER_URL%"=="" set "SURVEY123_FEATURE_LAYER_URL=https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/LandCare_Network_Internal_Survey_3_view/FeatureServer/0"
if "%SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL%"=="" set "SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL=%SURVEY123_FEATURE_LAYER_URL%"
if not exist "%ARCGIS_PYTHON%" (
  echo ERROR: ArcGIS Pro Python was not found: %ARCGIS_PYTHON%
  exit /b 1
)

for %%V in (18 17 16 15 14) do if not defined PSQL_PATH if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" set "PSQL_PATH=C:\Program Files\PostgreSQL\%%V\bin\psql.exe"
if not defined PSQL_PATH for /f "delims=" %%P in ('where psql.exe 2^>nul') do if not defined PSQL_PATH set "PSQL_PATH=%%P"
if not defined PSQL_PATH (
  echo ERROR: psql.exe was not found in PostgreSQL 14-18 or on PATH.
  exit /b 1
)

echo.
if "%LANDCARE_PG_DSN%"=="" (
  set "PGPASSWORD=%PG_PWD%"
  set "PGCONNECT=-h %PG_HOST% -p %PG_PORT% -U %PG_USER% -d %PG_DB%"
) else (
  set "PGCONNECT=%LANDCARE_PG_DSN%"
)

echo [1/4] Applying idempotent PostGIS migration...
"%PSQL_PATH%" %PGCONNECT% -v ON_ERROR_STOP=1 -f "%REPO_ROOT%\sql\20260728_landcare_survey123_evidence_parcels.sql"
if errorlevel 1 goto :failed

echo [2/4] Installing Survey123 worker dependencies in ArcGIS Pro Python...
"%ARCGIS_PYTHON%" -m pip install -r "%REPO_ROOT%\requirements-landcare-survey-evidence.txt"
if errorlevel 1 goto :failed

echo [3/4] Backfilling and validating Survey123 submissions as authoritative parcel polygons...
"%ARCGIS_PYTHON%" "%REPO_ROOT%\survey123_evidence_sync.py"
if errorlevel 1 goto :failed

echo [4/4] Publishing the stable hosted evidence parcel layer...
set "PUBLISH_LOG=%TEMP%\landcare-survey-evidence-publish.log"
if "%LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID%"=="" (
  "%ARCGIS_PYTHON%" "%REPO_ROOT%\publish_landcare_survey_evidence_parcels.py" --bootstrap > "%PUBLISH_LOG%" 2>&1
) else (
  "%ARCGIS_PYTHON%" "%REPO_ROOT%\publish_landcare_survey_evidence_parcels.py" > "%PUBLISH_LOG%" 2>&1
)
set "PUBLISH_EXIT=%ERRORLEVEL%"
type "%PUBLISH_LOG%"
if not "%PUBLISH_EXIT%"=="0" goto :failed

for /f "tokens=1,* delims==" %%A in ('findstr /b "LANDCARE_SURVEY_EVIDENCE_" "%PUBLISH_LOG%"') do set "%%A=%%B"
if "%LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID%"=="" (
  echo ERROR: Publisher did not report a stable hosted layer item ID.
  goto :failed
)

if "%LANDCARE_SURVEY_EVIDENCE_BOOTSTRAPPED%"=="" (
  >> "%SECRETS_FILE%" echo.
  >> "%SECRETS_FILE%" echo # LandCare Survey123 evidence parcels - managed by bootstrap.
  >> "%SECRETS_FILE%" echo SURVEY123_FEATURE_LAYER_URL=%SURVEY123_FEATURE_LAYER_URL%
  >> "%SECRETS_FILE%" echo SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL=%SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL%
  >> "%SECRETS_FILE%" echo LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID=%LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID%
  >> "%SECRETS_FILE%" echo LANDCARE_SURVEY_EVIDENCE_LAYER_URL=%LANDCARE_SURVEY_EVIDENCE_LAYER_URL%
  >> "%SECRETS_FILE%" echo LANDCARE_SURVEY_EVIDENCE_ENABLED=true
  >> "%SECRETS_FILE%" echo LANDCARE_SURVEY_EVIDENCE_BOOTSTRAPPED=true
)

echo.
echo SUCCESS: Canonical Survey123 evidence polygons were reconciled and published.
echo Next: configure the webhook service, then set LANDCARE_SURVEY_EVIDENCE_ENABLED=true for the 7 AM task.
exit /b 0

:failed
echo.
echo FAILED: Bootstrap stopped. Review the error above; no later step was run.
exit /b 1
