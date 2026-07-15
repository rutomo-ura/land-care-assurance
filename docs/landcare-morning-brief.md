# LandCare GitHub morning executive brief

## Purpose

The **LandCare morning executive brief** turns the published LandCare data contract into one short daily leadership update. It is deliberately GitHub-native: it creates and assigns a repository Issue rather than sending email directly from the VM.

The brief answers four questions:

1. Did published survey and completion metrics move since the prior published data snapshot?
2. How did Active completion and the Open Active queue change?
3. Which assigned contractors contributed new assignment-matched returns?
4. What is the freshness of the published assignment and survey evidence?

## Delivery and notification model

- The workflow is [`landcare-morning-brief.yml`](../.github/workflows/landcare-morning-brief.yml).
- It creates one open Issue per Eastern-calendar day, assigned to `rutomo-ura` and labelled `landcare-brief`.
- GitHub sends the normal account email/in-app notification for an assigned Issue. Enable Issue notifications for the `rutomo-ura` account and ensure that account's notification email is monitored.
- This is not direct SMTP delivery to `rutomo@ura.org`; it does not require mailbox credentials, Graph approval, or a secret in the repository.
- GitHub Actions scheduled workflows are best-effort. The Issue creation timestamp is the delivery record.

## Schedule

GitHub Actions cron uses UTC, while the executive brief is intended for 9:00 AM America/New_York. The workflow starts at both candidate UTC hours and emits an Issue only when the actual New York local hour is 09. This covers daylight saving time.

The 7:00 AM VM refresh remains the producer of the committed data contract. The brief reads the current repository data and compares it to the immediately preceding commit that changed `docs/landcare/data`.

## Metric rules

| Brief measure | Calculation | Interpretation |
|---|---|---|
| New raw survey submissions | Change in `refresh_manifest.survey_submission_count` | Raw submitted survey volume for the latest published survey period |
| New assignment-matched returns | Change in `latest_month_summary.status_counts.returned` | New returned evidence that matched an Active assignment |
| Active completion | Returned / Active assignments, plus percentage-point change | Performance against the governed Active denominator |
| Open Active queue | Change in `status_counts.missing` | Active assignments without matched returned evidence |
| Contractor contribution | Change in `contractor_returned` by assigned contractor | Contractor-level attribution for new matched returns |

Contractor contribution means the **assigned contractor**. It is not a claim about the individual who submitted a Regrid survey; a verified individual submitter field is not currently in the published contract.

## First run and no-change behavior

- If there is no prior data-changing commit, the first Issue is labelled **baseline established** and reports the current executive position without invented deltas.
- If values are unchanged from the prior data snapshot, the Issue says **no material movement** and still confirms published freshness.
- If required metric files are missing or invalid, the workflow fails before creating an Issue. Use the failed workflow log and the daily VM refresh status JSON to resolve the source issue.

## Manual test

In GitHub, open **Actions → LandCare morning executive brief → Run workflow**. The manual run bypasses the 9 AM time gate, creates the daily Issue if one does not already exist, and is safe to re-run because duplicate protection checks the Eastern date marker.

For a local rendering-only check:

```powershell
python scripts\generate_landcare_morning_brief.py `
  --current-dir docs\landcare\data `
  --output $env:TEMP\landcare-morning-brief.md
```

The command writes Markdown only; it does not create a GitHub Issue.
