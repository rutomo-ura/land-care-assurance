---
title: "LandCare Assurance"
subtitle: "Owner Guide"
author: "Prepared for the incoming owner, ura-gis/land-care-assurance"
---

# What you own

LandCare Assurance answers one question for URA supervisors: for this service period, which
assigned parcels were actually serviced, by whom, and with what evidence. It is a map-first
web application published from this repository, reading live ArcGIS layers, backed by a
nightly job on the GIS VM.

Before it existed, contractor compliance was judged from a reported completion figure that
blended Active and Request Only parcels against a parcel universe with no ownership check.
The application replaces that single percentage with a map, a stated denominator, and a
photo per parcel.

## Live routes

All under `https://ura-gis.github.io/land-care-assurance/`.

| Route | Audience | Purpose |
|---|---|---|
| `/monitoring/` | Supervisors | Parcel map, evidence, field notes, filters |
| `/kpi/` | Leadership | Completion trend, budget, contractor exposure |
| `/contractor/` | Contractors | Progress view and prefilled service submission |
| `/survey-submission/` | Legacy links | Redirect to `/contractor/` |
| `/design-system/example.html` | Developers | Portable BI kit reference page |

## Service period convention

A LandCare period runs the 15th of one month through the 14th of the next, stored as the
15th of the start month. `2026-06-15` means the June to July period. Every count in the
product is scoped to a period. When a number looks wrong, check the selected period first.

# System architecture and data flow

Three layers with three different owners.

| Layer | Where it runs | Owner |
|---|---|---|
| Ingestion | GIS VM Task Scheduler, repo `URA-GIS-User/URA-Data-Repository` | GIS and data operations |
| Store | PostgreSQL `gisdb` and ArcGIS Online (`urap.maps.arcgis.com`) | GIS and data operations |
| Publish and application | This repository, GitHub Pages | Web and dashboard owner |
| Finance actuals | NetSuite saved search, exported by hand into the VM refresh | Finance, with GIS operations running the import |

\archdiagram

## The rule that explains most confusion

Live ArcGIS is authoritative at page load. The JSON and GeoJSON committed under
`docs/landcare/data/` is a fallback cache plus the finance contract. A number on the map can
change during the day with no commit, because the browser queried ArcGIS directly. Do not
treat the committed files as truth.

## Daily schedule, Eastern time

| Time | Task | Output |
|---|---|---|
| 4:00 AM | `regrid_survey_daily_pipeline.py` upstream | Regrid CSV into `gis.regrid_survey_submissions`, then the ArcGIS survey layer |
| 4:15 AM on the 15th | `regrid_survey_monthly_export.py` | G-drive CSV archive only, not a dashboard source |
| 7:00 AM | `refresh_landcare_dashboard.ps1` in this repo | `docs/landcare/data/*` committed and pushed when changed |
| On demand | `ingest_landcare_netsuite_checks.py` | NetSuite check-request actuals folded into `finance_summary.json` |

The 7:00 AM job runs three hours after ingestion so the Postgres export reflects the latest
state. Because the browser also queries ArcGIS at page load, completion counts can rise
between publishes.

The NetSuite step is not automatic. The refresh script runs it only when the environment
variable `LANDCARE_NETSUITE_CHECKS_CSV` points at an exported CSV. With that variable unset,
the daily job skips it and the last published actuals stay in place. See section 4.

## Live ArcGIS sources

All on `services1.arcgis.com/0DMNBNaacQNEfN4H`.

| Layer | Item ID | Used for |
|---|---|---|
| `gisdb_gis_regrid_surveys` | `7a2e1d9bacba461296c54a63f104cf51` | Evidence, photos, comments, service dates |
| `..._bundle_assignments_current_period` | `0b4733cb5d204da6ab936c9f6d49e401` | Current assignment reference |
| `..._bundle_assignments_history` | `df7d77eb57f14c68b717c2cf3cdaada4` | Monthly assignment denominator |
| `gisdb_gis_epp_parcels_full` | live layer | Current URA-owned parcel universe |
| `CouncilDistricts2022` | reference | District highlight and filter |
| `LandCare_Survey123_Evidence_Parcels` | published layer | Approved evidence, not yet operational |

## The adapter boundary

`docs/landcare/survey-layer.js` and `docs/landcare/assignment-layer.js` are the only places
that talk to ArcGIS. Every source field rename gets absorbed there and nowhere else. That is
why `additional_comments`, `additional_notes`, `additional_note`, and `notes` all normalise
to one property, and why `service_date`, `date_of_services`, and `date_services` collapse to
one field.

Keep it that way. An ArcGIS URL appearing in `monitoring.js` or `kpi.js` is a defect.

## Where to make a change

| To change | Open |
|---|---|
| How survey evidence is read, normalised, matched | `docs/landcare/survey-layer.js` |
| How assignments are read and normalised | `docs/landcare/assignment-layer.js` |
| Supervisor map behaviour | `docs/landcare/monitoring.js` |
| KPI cards, trends, charts | `docs/landcare/kpi.js` |
| Contractor progress and submission | `docs/landcare/contractor-overview.js` |
| Survey123 URL, prefill names, evidence layer URL | `docs/landcare/survey-submission-config.js` |
| Product styling | `docs/landcare/app.css` |
| Nightly VM job and its QA gate | `scripts/refresh_landcare_dashboard.ps1`, `scripts/validate_landcare_daily_refresh.py` |
| Published data build | `scripts/build_landcare_web_data.py`, `scripts/build_landcare_finance_data.py` |
| NetSuite actuals import and vendor aliases | `scripts/ingest_landcare_netsuite_checks.py` |

# Metrics and the denominator rule

This section is the one to read before changing any number on screen. The full glossary is
`docs/landcare-metrics-context.md`.

## Completion

The numerator is the raw count of survey records whose normalised parcel number matches an
assignment in the active filter. The denominator is Active assigned. `Request Only` parcels
are excluded from the Active denominator.

Repeated records are kept on purpose, so this is **not** a unique-parcel count. Unique
completed parcels exist as a diagnostic only. Map Monitor and the KPI dashboard use the same
raw matched numerator, which is why their figures agree.

## Definitions in use

| Metric | Definition |
|---|---|
| Current URA-owned LandCare parcels | Live ArcGIS EPP records tagged LandCare with `inventory_type = 'URA Owned'` |
| Active assigned | Active assignment records in the selected period and filter |
| Request Only | Assignment rows at Request Only maintenance level; assigned inventory, not failure |
| Complete survey records | Raw survey records matched to an assignment parcel in the filter |
| Unique completed parcels | Distinct assignment parcel keys with at least one match; diagnostic only |
| Open active | Active assignment parcel keys with no matched evidence; the follow-up queue |
| Active completion % | Complete survey records over Active assigned; the primary operational KPI |
| Blended completion % | Complete survey records over assigned total, Request Only included; secondary context |
| All ArcGIS survey records | Raw survey features for the selected period, including unmatched rows |

## Reconciliation rules

Do not compare all ArcGIS survey records directly to complete survey records; the first
includes survey-only rows, the second is filtered to assignment matches. Do not compare the
current parcel universe to a monthly assignment period; the first is live inventory, the
second is a historical export. Treat Request Only as inventory context.

Contract expectations come from the LandCare budgeting workbook, not from ArcGIS. The
contract parcel count is contract scope and is a different population from either the EPP
universe or a monthly assignment slice. Do not mix them in one ratio.

## Finance actuals

Since 4 August 2026 the KPI dashboard shows actual spend alongside the workbook forecast.
The two are different things and the dashboard labels them separately.

| Term | What it is |
|---|---|
| Expected | Workbook contract forecast: term, parcels, monthly and annual amounts |
| Check requests | Actual check requests posted to the LandCare lawn-maintenance account in NetSuite |
| Other program actuals | Amounts on the same account that do not map to a current contractor |

**A check request is not a cleared payment.** It records that payment was requested, not that
money moved. Do not describe it as paid, and do not treat a contractor showing zero in a
period as proof that no work happened or that no liability exists; it means no matching check
request was found in that period.

Quarterly comparisons use only records posted in the selected quarter. Annual actuals include
current-cycle contractor check requests for the selected year. Other program actuals are
published in the data contract but excluded from contractor-to-contract variance, because
they are not attributable to a contractor.

# Daily operations

## The three-minute morning check

1. Confirm the 4:00 AM upstream pipeline ran and ArcGIS layer freshness moved.
2. Confirm the 7:00 AM task and read
   `C:\srv\logs\land-care-assurance\daily-refresh-status.json`.
3. Confirm the Pages workflow is green.

If the status JSON is not `success`, read `failed_stage` and fix only that stage. The full
triage tree is in `docs/task-scheduler-vm-operations.md`.

## Logs and gates

| Artifact | Path | Purpose |
|---|---|---|
| Daily log | `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log` | Human troubleshooting |
| Status JSON | `C:\srv\logs\land-care-assurance\daily-refresh-status.json` | Success or failure artifact |
| QA validator | `scripts/validate_landcare_daily_refresh.py` | Blocks publish on regression or stale manifest |
| Pages validation | `.github/workflows/pages.yml` | Data contract check on merge |

The Pages workflow does more than deploy. It checks that all routes exist, that the summary
JSON, GeoJSON, and refresh manifest agree on counts, and that ownership values stay within
URA and Pittsburgh Land Bank. Treat a red Pages workflow as a data contract failure, not a
deployment failure.

## Morning executive brief

`.github/workflows/landcare-morning-brief.yml` runs at 9:00 AM Eastern, handling daylight
saving by firing at both candidate UTC hours and publishing only in the real window. It
sends HTML email through Microsoft 365 Graph when the secrets are present, and otherwise
creates an assigned GitHub Issue labelled `landcare-brief`.

After the transfer, set the repository variables `LANDCARE_EMAIL_RECIPIENTS` and
`LANDCARE_ISSUE_ASSIGNEE`, then test with the `dry-run` delivery mode before going live.

# NetSuite finance actuals

Deployed 4 August 2026. This is the newest part of the system and the part most likely to go
stale, because refreshing it is a manual task rather than a scheduled one.

## What it is

NetSuite supplies actual LandCare check-request amounts to the KPI dashboard. It complements
the budgeting workbook rather than replacing it: the workbook still defines contract
expectations, term, parcels, and forecast; ArcGIS still owns assignments, evidence, and
completion.

| Item | Value |
|---|---|
| Saved search | `All URA LandCare Check Requests`, ID `1618` |
| Transaction type | Check Request |
| Account | `66220 Property Management : Lawn Maintenance` |
| Supporting report | `All URA LandCare Check Requests`, report ID `697` |
| Funding reference | `All URA LandCare Funding Requests`, report ID `704`, reconciliation only |

## Reading as published on 4 August 2026

| Figure | Value |
|---|---:|
| Saved-search records | 628 |
| Saved-search total | $4,538,233.89 |
| Current cycle records, from 1 November 2025 | 85 |
| Current cycle total | $618,513.87 |
| Mapped to current contractors | $592,179.76 |
| Retained as other LandCare program expense | $26,334.11 |
| Latest transaction date | 4 August 2026 |

These live in `finance_summary.json` under `actual_invoice_source`, which is where you check
freshness. If `refreshed_at` is old, the dashboard is showing stale actuals.

## What is published and what is not

`actual_invoices` holds one aggregate row per posting month and current-cycle contractor.
`other_program_actuals` holds monthly amounts on the LandCare account with no current
contractor. `actual_invoice_source` records report identity, freshness, row counts, and
reconciliation totals.

Document numbers, memos, and transaction-level vendor records are deliberately not published.
GitHub Pages serves this file to anyone, so transaction detail must never enter it.

## Refreshing it

1. Open saved search `1618` in NetSuite. Do not edit or resave the search.
2. Export CSV to the secured GIS VM or approved finance share. Never into this repository.
3. Rebuild the workbook portion of `finance_summary.json` if contract terms changed.
4. Run the importer:

   ```powershell
   python scripts\ingest_landcare_netsuite_checks.py `
     --source C:\secure\exports\landcare-checks.csv
   ```

5. Check source count, source total, current-cycle total, contractor total, other-program
   total, and latest date against NetSuite.
6. Run the tests and Pages validation before publishing.

Setting `LANDCARE_NETSUITE_CHECKS_CSV` on the VM makes the 7:00 AM refresh run step 4
automatically. The export in step 2 is still manual, so a stale CSV produces stale actuals
without any error.

## Vendor aliases

NetSuite vendor names do not match contractor names in the assignment layer, so
`scripts/ingest_landcare_netsuite_checks.py` holds an alias table. One contractor can appear
under several NetSuite names, for example `K.R.J. Enterprises Inc` and
`K.R.J. Enterprises Inc. - Eltridra` both map to KRJ Enterprises.

An unrecognised vendor is not dropped. It stays in `other_program_actuals`, which is why that
bucket exists. **Add an alias only after Finance or the LandCare program owner confirms the
relationship.** Guessing moves money onto the wrong contractor's variance line.

## The reconciliation gate

`scripts/validate_landcare_daily_refresh.py` fails the publish if the published contractor
aggregates do not sum to `current_cycle_contractor_total` in the source metadata. It also
rejects malformed periods and aggregate rows missing an organisation or amount. If that check
fails, the import and the metadata disagree; re-run the import rather than editing the JSON.

## Access

Use a named NetSuite account with read-only report access. Never store passwords, session
cookies, browser profiles, raw exports, document numbers, or memos in GitHub. Inspection and
export must not submit forms, edit records, customise searches, schedule reports, or change
NetSuite settings.

Full detail in `docs/netsuite-landcare-finance-source.md`.

# Replacing Regrid with a URA front end

## Scope it honestly

Regrid provides one thing URA does not yet own: the contractor capture form and its daily
export, which lands in `gis.regrid_survey_submissions` and publishes to
`gisdb_gis_regrid_surveys`. Assignments, parcel geometry, ownership, the dashboard, and the
contractor portal are already URA property.

You are replacing an intake form and an export, not a platform. ArcGIS stays.

## Most of it is already written

| Piece | Where | State |
|---|---|---|
| Contractor portal, map and list parcel selection | `docs/contractor/`, `contractor-overview.js` | Live |
| Survey123 intake and prefill contract | `survey-submission-config.js` | Live |
| Webhook receiver | `landcare_survey123_webhook.py` | Written, not deployed |
| Evidence validation and sync | `survey123_evidence_sync.py` | Written, not deployed |
| Evidence layer publisher, REST, no ArcGIS Pro licence | `publish_landcare_survey_evidence_parcels.py` | Written, not deployed |
| Database migration | `sql/20260728_landcare_survey123_evidence_parcels.sql` | Not applied |

## What is left

Apply the migration. Set the VM environment variables listed in
`docs/survey123-landcare-network-setup.md`. Run the receiver behind the approved URA HTTPS
host. Register the Survey123 webhook for new records and edits with the
`X-LandCare-Webhook-Token` header. Bootstrap the evidence hosted layer once in the
`LandCare - Published Layers` folder and record its item ID. Then run in parallel with
Regrid.

## Three gates

| Stage | Outcome | Done when |
|---|---|---|
| 1. Intake | Contractor picks a parcel on the URA map or list, Survey123 opens prefilled with organisation, parcel, address, and period | Map tap and dropdown produce the same prefill for the same `OBJECTID`; an anonymous browser loads the form without sign-in |
| 2. Review and evidence | URA approves or rejects in a restricted view; only approved records reach the public evidence layer | One approved submission creates exactly one database row and one evidence feature, even after a webhook retry; pending and rejected records appear nowhere public |
| 3. Cutover | Map Monitor and KPI read the URA evidence source instead of Regrid | Two full service periods of parallel running with matching counts, parcel matches, contractors, dates, comments, and photos |

## Guardrails, not preferences

Never publish the raw Survey123 point layer or the review QA view on a public map. No
publisher token, password, or portal credential goes into GitHub Pages, because Pages
content is public. Public views are add-only for submission and query-only for reference.
Only approved evidence becomes visible.

## After sign-off

Repoint Map Monitor and KPI, update `docs/landcare-metrics-context.md` and the tests in the
same pull request, then retire the Regrid scheduled task and its credential. Retiring Regrid
also removes the browser-automation download step, which is the most fragile part of the
current pipeline.

If Survey123 later constrains the contractor experience, replace only the form. Build a
custom LandCare form that posts to a protected URA API which validates and writes to
PostgreSQL or a secured feature service. Keep the browser adapter contract unchanged: parcel
number, period, contractor, service date, image URL, and canonical `additional_notes`. The
application does not need to know which form produced the record.

# Working with AI agents

This repository was built with agent-assisted development and is set up to keep working that
way. The detailed prompt library is `handover/02-agent-playbook.md`. This section is the
summary.

`AGENTS.md` at the repository root is read automatically by Codex and by Claude Code. It
carries the source-of-truth rules, the change rules, and the verification requirement. Keep
it current. It is the cheapest way to stop an agent from doing the wrong thing.

Every prompt should carry four blocks: the files to read first, the contract (goal, source,
metric rule), the commands the agent must actually run, and a task-specific snippet.

## Four failure modes specific to this repository

1. **Denominator drift.** An agent will switch the numerator to unique parcels because it
   looks more correct. It is not the agreed metric and it changes every published number.
2. **Stale cache-busting.** Modules import each other with `?v=` strings, for example
   `survey-layer.js?v=20260803-raw-completion-v2`. Change a shared adapter and every
   importer's version must move together, or browsers serve a mixed bundle.
3. **Hardcoded endpoints.** ArcGIS URLs belong in the two adapter files and in
   `survey-submission-config.js`, nowhere else.
4. **Hand-editing generated data.** Files under `docs/landcare/data/` come from the VM
   refresh, so hand edits are silently reverted by the next run.

## Verification before any push

```bash
python -m unittest discover -s tests
node --test tests/survey-layer.test.mjs
```

`tests/test_handover_contract.py` guards the handover file set and the portability of the
design system CSS. Then open the four routes and confirm counts, comments, photos, field
notes, filters, and the selected period.

# Design system

There are three style sources and they are not interchangeable. Knowing which is which saves
a great deal of confusion.

| Source | What it is | Use it for |
|---|---|---|
| `docs/landcare/app.css` | About 2,800 lines, the live product style, coupled to the ArcGIS JS API 4.30 theme | Changing an existing page |
| `.claude/skills/ura-landcare-design/` | The formalised design system extracted from `app.css`: tokens, 8 components, guidelines, 3 screen templates | Designing anything new, with or without an agent |
| `docs/design-system/executive-bi.css` | 156 portable lines with its own scoped `--bi-*` tokens, same palette, different naming | A standalone BI dashboard outside LandCare |

The skill's `tokens/colors.css` is an exact extraction of the `:root` block in `app.css`, so
the product and the design system cannot drift apart silently. `github.md` inside the skill
carries a screen map from each design artifact back to its repo source.

The export was taken before the NetSuite deployment, so its KPI template and some copy
examples still show the pre-NetSuite wording such as "NetSuite feed required". Tokens,
components, and visual rules are unaffected. See
`.claude/skills/ura-landcare-design/SYNC-NOTES.md`.

## Invoking it

The design system is installed as a Claude Code skill. Any agent opening this repository
discovers it automatically and can be asked to use it by name:

```text
/ura-landcare-design
```

It also works as plain reference material. Open `readme.md` inside the skill folder for the
full content and visual rules.

## The rules that get checked in review

One brand blue family carries almost everything. Orange means risk or action needed,
exclusively. Green means success, target, or complete, exclusively. Gold is a rare tertiary
accent. Never more than these four hues plus ink, muted, and line neutrals on a page.

Manrope only, weights 400 to 800, no serif or mono in the UI. Headings are heavy with tight
negative letter-spacing; body copy is never bold. A small uppercase kicker precedes every
heading.

Flat backgrounds, no photography, no texture, and exactly one gradient reserved for the
single featured metric card per band. Hairline 1px borders, two shadow tokens, corner radii
of 12, 18, 22, and full pill. Animation limited to short colour transitions on hover.

Never use colour alone; pair every status colour with a text label. Every important number
shows its source, period, denominator, and freshness. Normal text contrast at least 4.5:1.
Tabs and actions are real buttons or links with `aria-selected`. Tables keep `table`, `th`,
and `td`. Layout stacks at 760px and below. Loading, empty, stale, and error states are
explicit, because live ArcGIS queries fail in ways static pages do not.

Copy is operational and procedural, never marketing-toned. Sentence case throughout. No
emoji, no exclamation points, no filler adjectives. State unavailable data directly rather
than showing a vague empty state.

One caution: `tokens/typography.css` imports Manrope from Google Fonts, so the skill's
templates need network access. This does not affect `executive-bi.css`, which is deliberately
import-free and is asserted so by `tests/test_handover_contract.py`.

# Ownership, risks, and open decisions

Five areas have distinct owners: source freshness, VM refresh, application code, contractor
follow-up, and finance. The escalation table lives in `HANDOVER.md`.

## Open items to decide, not defects

| Item | What it means for you |
|---|---|
| Survey123 evidence path is code-complete but not deployed | Approved photos cannot appear and Regrid stays the only evidence source. The single blocker on the replacement |
| NetSuite actuals refresh by hand, not on a schedule | A stale CSV publishes stale money figures with no error. Decide who owns the export and how often |
| One check request, $26,334.11, sits in other program actuals | It is on the LandCare account with no current contractor. Ask Finance whether it should be aliased to a contractor or stay separate |
| Survey123 submissions do not change official completion in v1 | Whether they should is a governance decision, not a code change |
| Committed snapshot is dated 2026-07-07 while live ArcGIS moves daily | Static and live numbers differ. Decide whether the fallback stays once the live path is trusted |
| Morning brief falls back to a GitHub Issue without Microsoft 365 secrets | Set the two repository variables and test with `dry-run` first |
| GitHub redirects the old repository path, Pages URLs do not | Every ArcGIS embed, bookmark, and operational link moves to the `ura-gis` Pages URL by hand |

## First week

1. Confirm you can clone, push, and run the tests.
2. Watch two unattended refresh cycles complete with `status: success`.
3. Run the morning brief manually in `dry-run` mode and read the artifact.
4. Open all four routes and reconcile one contractor's numbers by hand against the map.
5. Refresh the NetSuite actuals once end to end, so you have done it before it is urgent.
6. Make one harmless documentation change through an agent, end to end, including tests.
7. Decide whether to deploy the Survey123 evidence path this quarter.

# Appendix

## Repository map

```text
land-care-assurance/
  handover/              <- this folder: start here
  AGENTS.md              <- agent start rules, read automatically
  HANDOVER.md            <- cutover checklist
  .claude/skills/ura-landcare-design/   <- design system skill
  docs/
    monitoring/ kpi/ contractor/        <- the three app routes
    landcare/            <- app JS, CSS, assets, and published data contract
    design-system/       <- portable Executive BI kit
    *.md                 <- architecture, metrics, runbooks
  scripts/               <- VM daily refresh, data build, brief generation
  sql/                   <- Survey123 evidence migration
  tests/                 <- Python and Node tests
  .github/workflows/     <- Pages deploy and morning brief
```

## Published data contract

Generated daily by the VM refresh into `docs/landcare/data/`.

| File | Contents |
|---|---|
| `all_months.geojson` | URA-owned assignment rows with geometry |
| `latest_month.geojson`, `latest_month_summary.json` | Latest month slice |
| `monthly_metrics.json` | Completion rates by month |
| `contractor_monthly.json` | Contractor completion by month |
| `kpi_summary.json` | Summary metadata and latest metrics |
| `finance_summary.json` | Workbook expectations plus NetSuite aggregates |
| `refresh_manifest.json` | Freshness, counts, survey metadata |

## Environment variable names

Names only. Values are VM-local or repository secrets and are never committed.

VM `.env`: `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PWD`.

Survey123 evidence path: `LANDCARE_PG_DSN`, `LANDCARE_SURVEY_WEBHOOK_TOKEN`,
`SURVEY123_FEATURE_LAYER_URL`, `SURVEY123_ARCGIS_TOKEN`,
`SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL`, `LANDCARE_ASSIGNMENT_HISTORY_LAYER_URL`,
`LANDCARE_SURVEY_EVIDENCE_ENABLED`, `LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID`,
`LANDCARE_SURVEY_EVIDENCE_LAYER_URL`, `LANDCARE_SURVEY_EVIDENCE_ARCGIS_TOKEN`.

NetSuite actuals: `LANDCARE_NETSUITE_CHECKS_CSV`, the path to the exported CSV on the VM.
Unset means the daily refresh skips the import and keeps the last published actuals.

GitHub Actions secrets: `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`,
`M365_SENDER_UPN`. Repository variables: `LANDCARE_EMAIL_RECIPIENTS`,
`LANDCARE_ISSUE_ASSIGNEE`.

## Command reference

```bash
python -m unittest discover -s tests            # Python tests
node --test tests/survey-layer.test.mjs         # survey adapter tests
python handover/build/build_report.py           # rebuild this PDF
```

On the VM:

```powershell
.\scripts\refresh_landcare_dashboard.ps1 `
  -RepoRoot C:\srv\GISWebApp\land-care-assurance
.\.venv\Scripts\python.exe scripts\validate_landcare_daily_refresh.py
```

## Further reading

- `docs/landcare-architecture.md` for source and runtime architecture
- `docs/landcare-metrics-context.md` for the full metric glossary
- `docs/netsuite-landcare-finance-source.md` for the NetSuite saved search and refresh procedure
- `docs/landcare-submission-and-evidence-flow.md` for the contractor intake contract
- `docs/survey123-landcare-network-setup.md` for Survey123 and webhook configuration
- `docs/task-scheduler-vm-operations.md` for the VM runbook and failure triage
- `docs/github-handover-runbook.md` for the repository and Pages cutover
