# LandCare Daily Refresh Monitor - Power Automate Build Kit

Last updated: 2026-07-01

## Purpose

Build a Power Automate cloud flow that monitors the VM-generated status file for the LandCare dashboard refresh. The flow should alert when the daily refresh is missing, stale, or failed, and optionally record successful runs in a SharePoint run-history list.

## Prerequisites

- On-premises data gateway can read the VM path:

```text
C:\srv\logs\land-care-assurance
```

- File System connector connection points to the gateway and can read:

```text
C:\srv\logs\land-care-assurance\daily-refresh-status.json
```

- Optional SharePoint list named:

```text
LandCare Refresh Runs
```

Use `power-platform/sharepoint-run-history-columns.csv` for the list columns.

## Flow Name

```text
LandCare Daily Refresh Monitor
```

## Trigger

Use **Recurrence**.

| Setting | Value |
|---|---|
| Frequency | Day |
| Interval | 1 |
| Time zone | Eastern Time |
| Start time | 7:30 AM |

The VM scheduled task runs at 7:00 AM Eastern, so 7:30 AM gives the refresh job time to finish.

## Actions

1. **File System - Get file content using path**

   Path:

   ```text
   C:\srv\logs\land-care-assurance\daily-refresh-status.json
   ```

2. **Data Operations - Parse JSON**

   Content: output body from the file content action.

   Schema: paste `power-platform/daily-refresh-status.schema.json`.

3. **Initialize variable - Today**

   Type: String

   Value:

   ```text
   formatDateTime(convertTimeZone(utcNow(), 'UTC', 'Eastern Standard Time'), 'yyyy-MM-dd')
   ```

4. **Condition - Status file stale**

   Expression:

   ```text
   not(equals(body('Parse_JSON')?['run_date'], variables('Today')))
   ```

   If true, send a high-priority stale alert.

5. **Condition - Refresh failed**

   Expression:

   ```text
   equals(body('Parse_JSON')?['status'], 'failed')
   ```

   If true, send a high-priority failure alert.

6. **Condition - Published data changed**

   Expression:

   ```text
   equals(body('Parse_JSON')?['outcome'], 'published')
   ```

   If true, send a normal-priority published notification.

7. **Optional - Create SharePoint item**

   Create one item in `LandCare Refresh Runs` for every monitor run, using the parsed JSON fields.

## Alert Message Template

Subject:

```text
LandCare refresh @{body('Parse_JSON')?['status']} - @{body('Parse_JSON')?['run_date']}
```

Body:

```text
LandCare daily refresh monitor

Status: @{body('Parse_JSON')?['status']}
Outcome: @{body('Parse_JSON')?['outcome']}
Run date: @{body('Parse_JSON')?['run_date']}
Started: @{body('Parse_JSON')?['started_at']}
Finished: @{body('Parse_JSON')?['finished_at']}
Duration seconds: @{body('Parse_JSON')?['duration_seconds']}
Branch: @{body('Parse_JSON')?['branch']}
Commit before: @{body('Parse_JSON')?['commit_before']}
Commit after: @{body('Parse_JSON')?['commit_after']}
Published data changes: @{body('Parse_JSON')?['published_data_changes']}
Failed stage: @{body('Parse_JSON')?['failed_stage']}
Message: @{body('Parse_JSON')?['message']}
Log path: @{body('Parse_JSON')?['log_path']}
Repo root: @{body('Parse_JSON')?['repo_root']}
```

## Expected Outcomes

| Status JSON values | Power Automate behavior |
|---|---|
| `status = success`, `outcome = unchanged` | Record run history; no urgent alert |
| `status = success`, `outcome = published` | Record run history; send optional success/published notification |
| `status = failed`, `outcome = failed` | Send failure alert with `failed_stage`, `message`, and `log_path` |
| `run_date != today` | Send stale alert |
| Status file missing | Flow action fails; configure run-after on the alert action to send missing-file alert |

## Missing File Handling

On the alert action for missing file, configure **Run after** on the file-read action:

- has failed
- has timed out

Message:

```text
Power Automate could not read C:\srv\logs\land-care-assurance\daily-refresh-status.json.
Check the VM scheduled task, on-premises gateway, and File System connector permissions.
```

