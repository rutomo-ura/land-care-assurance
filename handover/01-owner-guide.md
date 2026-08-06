---
title: "LandCare Assurance"
subtitle: "Owner Guide"
author: "Prepared for the incoming owner, ura-gis/land-care-assurance"
---

> Current as of August 6, 2026. For status, sign-off, and outstanding successor work, use
> [`04-readiness-checklist.md`](04-readiness-checklist.md). This guide explains how the
> system works and why; the checklist tracks what is done.

# What you own

LandCare Assurance answers one question for URA supervisors: for this service period, which
assigned parcels were actually serviced, by whom, and with what evidence. It is a map-first
web application published from this repository. It queries live ArcGIS layers at page load
and embeds a secure Power BI report for finance.

Before it existed, contractor compliance was judged from a reported completion figure that
blended Active and Request Only parcels against a parcel universe with no ownership check.
The application replaces that single percentage with a map, a stated denominator, and a
photo per parcel.

## Live routes

All under `https://ura-gis.github.io/land-care-assurance/`.

| Route | Audience | Purpose |
|---|---|---|
| `/monitoring/` | Supervisors | Parcel map, evidence, field notes, filters |
| `/kpi/` | Leadership | Completion trend, contractor exposure, Power BI finance |
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
| Ingestion | GIS VM Task Scheduler at 4:00 AM, repo `URA-GIS-User/URA-Data-Repository` | GIS and data operations |
| Store | PostgreSQL `gisdb` and ArcGIS Online (`urap.maps.arcgis.com`) | GIS and data operations |
| Publish and application | This repository, GitHub Pages | Web and dashboard owner |
| Finance | Power BI semantic model, embedded as a secure report | Finance and BI |

\archdiagram

## The rule that explains most confusion

Live ArcGIS is authoritative at page load. The JSON and GeoJSON committed under
`docs/landcare/data/` is a compatibility fallback, not the current data source. A number on
the map changes during the day with no commit, because the browser queried ArcGIS directly.
Do not treat the committed files as truth, and do not report them as freshness.

This became the whole story on 6 August 2026, when the 7:00 AM refresh was deprecated.
Nothing on the live pages depends on it now.

## Daily schedule, Eastern time

| Time | Task | Output |
|---|---|---|
| 4:00 AM | `regrid_survey_daily_pipeline.py` upstream | Regrid CSV into `gis.regrid_survey_submissions`, then the ArcGIS survey layer |
| 4:15 AM on the 15th | `regrid_survey_monthly_export.py` | G-drive CSV archive only, not a dashboard source |
| 7:00 AM | `refresh_landcare_dashboard.ps1` | **Deprecated.** Retained only as a recovery reference |
| On demand | `ingest_landcare_netsuite_checks.py` | **Supervised reconciliation only.** Not a production feed |

The 4:00 AM pipeline is the only scheduled job the product depends on. Everything the
supervisor sees is queried live from ArcGIS afterwards, so completion counts rise through the
day without any repository publish.

The 7:00 AM job used to publish the static contract under `docs/landcare/data/`. Its last
automatic commit was 28 July 2026 and the checked-in files were last generated on 29 July.
The successor's retirement steps are in
[`04-readiness-checklist.md`](04-readiness-checklist.md); do not simply delete the task.

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
| Power BI embed URLs and report pages | `docs/kpi/index.html` |
| Native finance card behaviour | `docs/landcare/finance-semantic.js` |
| Optional Power BI aggregate extraction | `scripts/extract_landcare_powerbi_semantic.py` |
| NetSuite reconciliation import and vendor aliases | `scripts/ingest_landcare_netsuite_checks.py` |
| Deprecated 7:00 AM job and its QA gate | `scripts/refresh_landcare_dashboard.ps1`, `scripts/validate_landcare_daily_refresh.py` |

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

Finance is governed separately from the operational metrics, and it moved twice in three
days. Section 5 covers it in full; the rule that matters here is the vocabulary.

| Term | What it is |
|---|---|
| Expected | Workbook contract forecast: term, parcels, monthly and annual amounts |
| Check requests | Requests posted to the LandCare lawn-maintenance account, governed in Power BI |
| Other program actuals | Amounts on the same account with no current contractor |

**A check request is not a cleared payment.** It records that payment was requested, not that
money moved. Do not describe it as paid, and do not treat a contractor showing zero in a
period as proof that no work happened or that no liability exists; it means no matching check
request was found in that period.

Quarterly comparisons use only records posted in the selected quarter. Other program actuals
are excluded from contractor-to-contract variance, because they are not attributable to a
contractor.

# Daily operations

## The three-minute morning check

1. Open Map Monitor and confirm the latest ArcGIS assignment and survey periods.
2. Compare the selected-period completion count between Map Monitor and KPI. They use the
   same numerator, so a difference is a defect.
3. Open one Field Note and confirm its parcel, contractor pill, comment, date, and image.
4. Open Land Care Budget and Parcel Area and confirm the secure Power BI report loads.
5. Check the Pages deployment if application code changed.

There is no status JSON to read any more. Freshness lives in the ArcGIS layers themselves and
in the Power BI report header. Use `docs/task-scheduler-vm-operations.md` only to archive,
disable, or deliberately reactivate the deprecated 7:00 AM process.

## Logs and gates

| Artifact | Path | Purpose |
|---|---|---|
| Pages validation | `.github/workflows/pages.yml` | Data contract check on merge; the live gate |
| QA validator | `scripts/validate_landcare_daily_refresh.py` | Used by the deprecated job and by manual reconciliation |
| Daily log | `C:\srv\logs\land-care-assurance\daily-refresh-YYYY-MM-DD.log` | Historical, from the deprecated job |
| Status JSON | `C:\srv\logs\land-care-assurance\daily-refresh-status.json` | Historical; archive it before disabling the task |

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

# Finance: Power BI and NetSuite

Finance moved twice in three days, so read this before touching any money figure.

| Date | Change |
|---|---|
| 4 August 2026 | NetSuite check-request actuals published into `finance_summary.json` |
| 5 to 6 August 2026 | Land Care Budget and Parcel Area became secure Power BI embeds |

## Who owns which number

**Power BI is the authoritative reporting source.** The Land Care Budget and Parcel Area tabs
on the KPI dashboard are authenticated Microsoft embeds, not copied values. Each viewer sees
the report through their own Power BI permissions, so the numbers cannot drift from what
Finance sees.

**NetSuite is the upstream accounting system.** It is where check requests originate. The
importer in this repository is now a supervised reconciliation tool, not a production feed.

**The budgeting workbook still defines contract expectations**: term, parcels, and forecast.

## Power BI configuration

| Setting | Value |
|---|---|
| Workspace | `GIS Dashboards`, `A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5` |
| Semantic model | `924c6c0b-6e29-41cf-9775-562ca646953a` |
| Report | `2d592a10-7083-470a-96aa-41fbdc59218c` |
| Land Care Budget page | `fe756b7016e6baa7351e` |
| Parcel Area Distribution page | `4a5502453e9080b7a655` |
| Required filter | `LandCare Check Requests[Item Type] = Landcare` |

**Page `8c93bab49c96aa8e3bd2` is Maintenance Check Requests and must never be embedded.** It
is a different scope and would publish the wrong number. The embed is authenticated, not
Publish to web; do not convert it.

Audited on 5 August 2026 the report showed $458,995.17 spent against a $775,000 limit,
59.23 per cent, with Q1 $188,579.00, Q2 $192,318.50, and Q3 $78,097.67.

## The honest status of the native finance cards

This is the part most likely to be misdescribed, so state it carefully.

The embedded Power BI tabs are live. The **native** KPI finance cards still read the
checked-in `finance_summary.json`, which was generated on 4 August from NetSuite. That file
has no `semantic_summary` key, and its `actual_invoice_source.source_system` still reads
`NetSuite`.

Do not describe the native finance feed as Power BI-backed until all three are true:

1. the published JSON contains `semantic_summary`,
2. `actual_invoice_source.source_system` is `Power BI semantic model`, and
3. the VM status reports `power_bi_finance.feed_status = current`.

Until then the embeds are governed and current, and the native cards are a dated snapshot.
`scripts/extract_landcare_powerbi_semantic.py` exists to close that gap and is optional; it
is only needed if public KPI finance cards must survive without a Microsoft sign-in.

## Access still outstanding

The audited user can view the shared report but cannot open the workspace. Refresh history,
gateway and source connections, and service-principal Build permission all require a
workspace administrator. Getting that access is successor work.

## NetSuite reconciliation

Still useful when a Power BI figure looks wrong and you need the underlying requests.

| Item | Value |
|---|---|
| Saved search | `All URA LandCare Check Requests`, ID `1618` |
| Account | `66220 Property Management : Lawn Maintenance` |
| Supporting report | ID `697`; funding reference ID `704` |

Export the saved search to CSV on the secured VM, never into this repository, then run:

```powershell
python scripts\ingest_landcare_netsuite_checks.py `
  --source C:\secure\exports\landcare-checks.csv
```

The 4 August read found 628 records totalling $4,538,233.89; for the cycle from 1 November
2025, 85 records totalling $618,513.87, of which $592,179.76 mapped to current contractors
and $26,334.11 stayed as other LandCare program expense.

Do not automate the authenticated Power BI DOM or a browser CSV download to get these
numbers. Show as a table and Export data are fine for supervised reconciliation; unattended
extraction must use the semantic model Execute Queries API. Browser markup, visual
identifiers, and download behaviour are not a stable contract.

## Vendor aliases

NetSuite vendor names do not match contractor names in the assignment layer, so
`scripts/ingest_landcare_netsuite_checks.py` holds an alias table. One contractor can appear
under several NetSuite names, for example `K.R.J. Enterprises Inc` and
`K.R.J. Enterprises Inc. - Eltridra` both map to KRJ Enterprises.

An unrecognised vendor is not dropped. It stays in `other_program_actuals`. **Add an alias
only after Finance or the LandCare program owner confirms the relationship.** Guessing moves
money onto the wrong contractor's variance line.

## What is published and what is not

`finance_summary.json` carries aggregates only: one row per posting month and current-cycle
contractor, monthly other-program amounts, and source metadata. Document numbers, memos, and
transaction-level vendor records are deliberately excluded, because GitHub Pages serves this
file to anyone.

`scripts/validate_landcare_daily_refresh.py` fails the publish if the published contractor
aggregates do not sum to `current_cycle_contractor_total`. If that fails, re-run the import
rather than editing the JSON.

## Access and security

Use named accounts with read-only report access for both systems. Never store passwords,
session cookies, browser profiles, certificates, raw exports, document numbers, or memos in
GitHub. The Power BI certificate lives only under `C:\srv\secrets\powerbi\`.

Full detail in `docs/powerbi-landcare-finance-source.md`,
`docs/powerbi-landcare-dataflow-audit-2026-08-05.md`, and
`docs/netsuite-landcare-finance-source.md`.

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

Five areas have distinct owners: ArcGIS source freshness, GitHub Pages and application code,
the Power BI report, contractor follow-up, and retiring the deprecated 7:00 AM task. The
escalation table lives in `HANDOVER.md`.

## Open items to decide, not defects

| Item | What it means for you |
|---|---|
| Survey123 evidence path is code-complete but not deployed | Approved photos cannot appear and Regrid stays the only evidence source. The single blocker on the replacement |
| Native KPI finance cards are not yet Power BI-backed | The embeds are governed and live, but the native cards read a 4 August NetSuite snapshot. Decide whether public cards need to survive without a Microsoft sign-in |
| Power BI workspace administration is not granted | Refresh history, gateway connections, and service-principal Build permission all need a workspace administrator |
| The deprecated 7:00 AM task is still on the VM | Archive its definition and logs, disable it, then remove after two clean business days |
| One check request, $26,334.11, sits in other program actuals | It is on the LandCare account with no current contractor. Ask Finance whether it should be aliased to a contractor or stay separate |
| Survey123 submissions do not change official completion in v1 | Whether they should is a governance decision, not a code change |
| Checked-in data was last generated 29 July 2026 while ArcGIS moves daily | Static and live numbers differ. Decide whether the compatibility fallback stays at all |
| Morning brief falls back to a GitHub Issue without Microsoft 365 secrets | Set the two repository variables and test with `dry-run` first |
| GitHub redirects the old repository path, Pages URLs do not | Every ArcGIS embed, bookmark, and operational link moves to the `ura-gis` Pages URL by hand |

## First week

1. Confirm you can clone, push, and run the tests.
2. Watch two 4:00 AM ArcGIS publication cycles and confirm the layer timestamps move.
3. Run the morning brief manually in `dry-run` mode and read the artifact.
4. Open all four routes and reconcile one contractor's numbers by hand against the map.
5. Open Land Care Budget and Parcel Area and confirm the authenticated report loads for you.
6. Request Power BI workspace administration access; several open items depend on it.
7. Archive and disable the deprecated 7:00 AM task, following the readiness checklist.
8. Make one harmless documentation change through an agent, end to end, including tests.
9. Decide whether to deploy the Survey123 evidence path this quarter.

# Appendix

## Repository map

```text
land-care-assurance/
  handover/              <- start here; 04-readiness-checklist.md is the status page
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

Checked-in under `docs/landcare/data/`. Last generated 29 July 2026 by the now-deprecated
7:00 AM job, and kept only for compatibility.

| File | Contents |
|---|---|
| `all_months.geojson` | URA-owned assignment rows with geometry |
| `latest_month.geojson`, `latest_month_summary.json` | Latest month slice |
| `monthly_metrics.json` | Completion rates by month |
| `contractor_monthly.json` | Contractor completion by month |
| `kpi_summary.json` | Summary metadata and latest metrics |
| `finance_summary.json` | Workbook and NetSuite aggregates; compatibility only |
| `refresh_manifest.json` | Freshness, counts, survey metadata |

## Environment variable names

Names only. Values are VM-local or repository secrets and are never committed.

VM `.env`: `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PWD`.

Survey123 evidence path: `LANDCARE_PG_DSN`, `LANDCARE_SURVEY_WEBHOOK_TOKEN`,
`SURVEY123_FEATURE_LAYER_URL`, `SURVEY123_ARCGIS_TOKEN`,
`SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL`, `LANDCARE_ASSIGNMENT_HISTORY_LAYER_URL`,
`LANDCARE_SURVEY_EVIDENCE_ENABLED`, `LANDCARE_SURVEY_EVIDENCE_AGOL_ITEM_ID`,
`LANDCARE_SURVEY_EVIDENCE_LAYER_URL`, `LANDCARE_SURVEY_EVIDENCE_ARCGIS_TOKEN`.

Power BI extraction, only if the optional aggregate path is enabled:
`LANDCARE_POWERBI_TENANT_ID`, `LANDCARE_POWERBI_CLIENT_ID`,
`LANDCARE_POWERBI_CERTIFICATE_PATH`, `LANDCARE_POWERBI_CERTIFICATE_THUMBPRINT`,
`LANDCARE_POWERBI_WORKSPACE_ID`, `LANDCARE_POWERBI_DATASET_ID`. The certificate lives only
under `C:\srv\secrets\powerbi\`. Removing these four authentication variables rolls the
extraction back without losing the published contract.

NetSuite reconciliation: `LANDCARE_NETSUITE_CHECKS_CSV`, the path to the exported CSV.

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
- `docs/powerbi-landcare-finance-source.md` for the Power BI model, embed pages, and rollback
- `docs/powerbi-landcare-dataflow-audit-2026-08-05.md` for the audit evidence
- `docs/netsuite-landcare-finance-source.md` for the NetSuite saved search and reconciliation
- `docs/landcare-submission-and-evidence-flow.md` for the contractor intake contract
- `docs/survey123-landcare-network-setup.md` for Survey123 and webhook configuration
- `docs/task-scheduler-vm-operations.md` for the VM runbook and failure triage
- `docs/github-handover-runbook.md` for the repository and Pages cutover
