# LandCare GitHub morning executive brief

## Purpose

The **LandCare morning executive brief** turns the published LandCare data contract into one short daily leadership update. Once Microsoft 365 Graph is configured, it sends a simple, mobile-friendly Executive BI HTML email. Until then, it falls back to an assigned repository Issue so no daily update is lost.

The brief answers four questions:

1. Did published survey and completion metrics move since the prior published data snapshot?
2. How did Active completion and the Open Active queue change?
3. Which assigned contractors contributed new assignment-matched returns?
4. What is the freshness of the published assignment and survey evidence?

## Delivery and notification model

- The workflow is [`landcare-morning-brief.yml`](../.github/workflows/landcare-morning-brief.yml).
- Direct recipients come from the repository variable `LANDCARE_EMAIL_RECIPIENTS`.
- The HTML email uses the LandCare Executive BI color system: deep blue masthead, readable decision cards, responsive single-column phone layout, source/freshness footer, and direct Map/KPI links.
- Configure the four GitHub Actions secrets below to enable direct Microsoft 365 delivery. No secret is stored in code or documentation.

| Secret | Purpose |
|---|---|
| `M365_TENANT_ID` | URA Microsoft 365 tenant ID |
| `M365_CLIENT_ID` | App registration client ID |
| `M365_CLIENT_SECRET` | App registration client secret |
| `M365_SENDER_UPN` | Approved service mailbox used as the sender |

- The app registration needs Microsoft Graph **Application** `Mail.Send` permission, admin consent, and a mailbox policy that permits the configured sender.
- Until all four secrets exist, the workflow creates one open Issue per Eastern-calendar day, optionally assigned to the username in `LANDCARE_ISSUE_ASSIGNEE` and labelled `landcare-brief`. GitHub then provides the account notification fallback.
- GitHub Actions scheduled workflows are best-effort. The Issue creation timestamp is the delivery record.

## Schedule

GitHub Actions cron uses UTC, while the executive brief is intended for 9:00 AM America/New_York. The workflow starts at both candidate UTC hours and emits a brief only when the actual New York local hour is 09. This covers daylight saving time.

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

In GitHub, open **Actions → LandCare morning executive brief → Run workflow**. The manual run bypasses the 9 AM time gate. Use `dry-run` to upload Markdown/HTML without email or issue delivery; use `live` only after the notification variables and secrets are verified.

For a local rendering-only check:

```powershell
python scripts\generate_landcare_morning_brief.py `
  --current-dir docs\landcare\data `
  --output $env:TEMP\landcare-morning-brief.md `
  --html-output $env:TEMP\landcare-morning-brief.html
```

The command writes Markdown and HTML only; it does not create a GitHub Issue or send email.
