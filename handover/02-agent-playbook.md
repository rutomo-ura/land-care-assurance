# Agent Playbook

How to change and extend LandCare Assurance using an AI coding agent, whether that is Codex,
Claude Code, or whatever comes next. Written so a GIS analyst who does not write JavaScript
daily can still ship correct changes.

The companion document is `handover/01-owner-guide.md`, which explains the system itself.
Read that first if you have not.

## Why this works here

`AGENTS.md` at the repository root is read automatically by Codex and Claude Code. It carries
the source-of-truth rules, the change rules, and the verification requirement, so an agent
inherits them before it plans anything. Keeping `AGENTS.md` current is the cheapest control
you have.

The design system is installed as a skill at `.claude/skills/ura-landcare-design/`. An agent
opening this repository discovers it with no setup, so anything it builds can be on brand by
default.

---

# The four blocks

Every good prompt for this repository carries four blocks. Missing block B is what causes
most wrong answers.

## A. Context calling: what to read first

```text
Read AGENTS.md, handover/04-readiness-checklist.md, handover/01-owner-guide.md,
docs/landcare-architecture.md, and docs/landcare-metrics-context.md before editing.
```

This makes the agent inherit the source-of-truth and change rules before it plans.

## B. Contract: goal, source, metric rule

```text
Goal: [the business outcome and which page it affects].
Source: [ArcGIS item, service, PostgreSQL table, or published JSON].
Metric rule: completion uses raw assignment-matched survey records over Active
assigned; Request Only is excluded from the Active denominator.
```

State the metric rule even when the task looks unrelated to metrics. Agents reach for what
looks more correct rather than what is agreed.

## C. Tool calls: what must actually run

```text
Run the Python tests, the survey-layer Node test, and the Pages validation.
Report the result, the evidence, and the rollback path before commit.
```

If the agent can drive a browser, add: open the live route, confirm the map and the console.
Name the tool in the prompt rather than hoping.

## D. Task snippet

One extra paragraph specific to the job. The recipes below are those snippets.

---

# The standing prompt

Paste this above any task, then add one recipe from the next section.

```text
Work in the land-care-assurance repository. Read AGENTS.md,
handover/04-readiness-checklist.md, handover/01-owner-guide.md,
docs/landcare-architecture.md, and docs/landcare-metrics-context.md before
editing.

Goal: [business outcome and which page it affects].
Source: [ArcGIS item, service, PostgreSQL table, or published JSON].
Metric rule: completion uses raw assignment-matched survey records over Active
assigned; Request Only is excluded from the Active denominator.

Before editing, state the source, field mapping, affected pages, tests, and
rollback. Preserve live ArcGIS-first behaviour with static fallback, HTML
escaping of ArcGIS values, URL validation, record ordering, evidence
deduplication, and shared adapter cache-busting versions.

Implement the smallest complete change. Run the Python tests, the survey-layer
Node test, and the Pages validation. Report the result, the test evidence, and
the rollback path before commit.
```

---

# Recipes

## Add or change a KPI

```text
Task: add a KPI card to the KPI dashboard showing [metric].

Work in docs/landcare/kpi.js and docs/kpi/index.html only. Derive the value from
data already loaded on the page; do not add a new ArcGIS query unless you show me
why an existing one cannot serve it. Show the period, denominator, and source
beside the number, as every other card does. Use the existing card markup and
classes from docs/landcare/app.css; do not add new CSS if an existing class fits.
State the before and after value for the latest period.
```

## Change a metric or denominator

This is the highest-risk change in the repository. It moves every published number.

```text
Task: change [metric] from [current definition] to [new definition].

This changes a published number. In the same change you must update
docs/landcare-metrics-context.md, handover/01-owner-guide.md, and the affected
test. Show the before and after value for the latest period, for both Map Monitor
and the KPI dashboard, and confirm they still agree with each other. If they
diverge, stop and tell me rather than adjusting one of them.
```

## Add a filter to the map

```text
Task: add a [field] filter to Map Monitor.

Work in docs/landcare/monitoring.js. Filter the already-loaded feature set in the
browser rather than issuing a new ArcGIS query. The filter must survive opening
and closing the field notes pane, and must be cleared by the existing clear-all
control. Keep the KPI counts in the sidebar consistent with the filtered set.
```

## Change an ArcGIS endpoint or field mapping

```text
Task: the source layer now exposes [new field name] instead of [old field name].

Change this only in docs/landcare/survey-layer.js or
docs/landcare/assignment-layer.js. Normalise the new name to the existing
app-level property and keep the old aliases so a rolled-back layer still works,
following the pattern already used for additional_comments and service_date. Do
not touch monitoring.js, kpi.js, or contractor-overview.js. Bump the ?v= import
version in every file that imports the adapter you changed. Add a case to
tests/survey-layer.test.mjs.
```

## Add a new page

```text
Task: build a new [purpose] page.

Use the design system skill ura-landcare-design. Follow the fixed page order:
masthead, tabs, context and filter row, decision question, three to five metrics,
one dominant map or chart, then an operational ledger. Use tokens from the skill,
not hardcoded hex values. No framework and no build step; this repository is
plain HTML, CSS, and ES modules served by GitHub Pages. Add the route to the
validation list in .github/workflows/pages.yml.
```

## Restyle an existing page

```text
Task: restyle [page] to [goal].

Edit docs/landcare/app.css, which is the production stylesheet. Do not import
docs/design-system/executive-bi.css into a product page; that kit is for
standalone BI surfaces outside LandCare. Read
.claude/skills/ura-landcare-design/readme.md for the visual rules before
changing anything. Keep status colour paired with a text label, keep contrast at
4.5:1, and keep the 760px stacking behaviour.
```

## Finish and deploy the Survey123 evidence path

The single blocker on retiring Regrid. Do this in order, and stop at each gate.

```text
Task: bring the Survey123 approved-evidence path into service.

Read docs/landcare-submission-and-evidence-flow.md and
docs/survey123-landcare-network-setup.md first. The receiver, evidence sync, and
layer publisher are already written and unit-tested; the work is deployment and
configuration, not new code.

Order: apply sql/20260728_landcare_survey123_evidence_parcels.sql, set the VM
environment variables, run the receiver behind URA HTTPS, register the Survey123
webhook with the X-LandCare-Webhook-Token header, bootstrap the evidence hosted
layer, record its item ID.

Prove each of these before moving on: an approved submission creates exactly one
database row and one evidence feature; a duplicate webhook delivery creates no
second row; a pending record and a rejected record appear nowhere public. Never
publish the raw Survey123 point layer or the review view. No token goes into any
file under docs/, because Pages content is public.
```

## Cut over from Regrid

```text
Task: repoint Map Monitor and KPI from the Regrid survey layer to the URA
approved-evidence source.

Do not start until two full service periods of parallel running show matching
counts, parcel matches, contractors, service dates, comments, and photos. Produce
that comparison as a table first and let me approve it.

On approval: change the source only in docs/landcare/survey-layer.js, keeping the
normalised property names identical so no consumer changes. Update
docs/landcare-metrics-context.md and the tests in the same pull request. Do not
retire the Regrid scheduled task in the same change.
```

## Change a Power BI embed

```text
Task: change the Power BI embed on [Land Care Budget / Parcel Area].

Read docs/powerbi-landcare-finance-source.md first. Work in docs/kpi/index.html.

The report is 2d592a10-7083-470a-96aa-41fbdc59218c in workspace
A4C26AF1-2334-4FF6-BCCC-FCC7BB0862F5. Land Care Budget is page
fe756b7016e6baa7351e and Parcel Area Distribution is page 4a5502453e9080b7a655.
Page 8c93bab49c96aa8e3bd2 is Maintenance Check Requests and must never be
embedded; it is a different scope and would publish the wrong number.

Keep the embed authenticated. Do not convert it to Publish to web and do not add
a token or an embed secret to anything under docs/, which is served publicly.
Run tests/kpi-powerbi-embed.test.mjs.
```

## Reconcile a finance figure against NetSuite

```text
Task: a Power BI finance figure looks wrong; reconcile it against NetSuite.

Read docs/netsuite-landcare-finance-source.md. The CSV export from saved search
1618 is a manual step I do; you start from the exported file.

Run scripts/ingest_landcare_netsuite_checks.py --source [path], then report the
source record count, source total, current-cycle total, contractor total,
other-program total, and latest transaction date so I can compare them with the
Power BI report.

This is reconciliation, not a production feed. Do not describe the native KPI
finance cards as Power BI-backed unless finance_summary.json contains
semantic_summary and actual_invoice_source.source_system reads
"Power BI semantic model". Do not add a vendor alias. Do not put document
numbers, memos, or transaction-level records into finance_summary.json.
```

## Add a NetSuite vendor alias

Only after Finance or the LandCare program owner confirms the relationship in writing.

```text
Task: map the NetSuite vendor "[exact NetSuite name]" to contractor
"[contractor name as it appears in the assignment layer]".

[Name] confirmed this relationship on [date].

Add it to VENDOR_ALIASES in scripts/ingest_landcare_netsuite_checks.py, add a
case to tests/test_ingest_landcare_netsuite_checks.py, and re-run the import.
Show me the before and after for both the contractor total and the
other-program total, since money is moving between those two buckets.
```

## Retire the deprecated 7:00 AM task

```text
Task: help me archive and disable the deprecated 7:00 AM dashboard refresh.

Read handover/04-readiness-checklist.md and docs/task-scheduler-vm-operations.md
first. The task is deprecated, not broken: nothing on the live pages depends on
it, because the browser queries ArcGIS at page load.

Work through the checklist in order and stop after disabling. Export the task
definition, keep the last status JSON and transcript logs, record its last run,
result code, principal, trigger, and command. Do not delete it on the first day.

Do not reactivate it or hand-edit anything under docs/landcare/data/. If you
believe a consumer still depends on it, stop and tell me which one.
```

## Update a handover document

```text
Task: update handover/01-owner-guide.md with [change].

Edit the Markdown only; it is the single source of truth. Rebuild the PDF with
python handover/build/build_report.py and confirm the page count, the TikZ
diagram, and that no table overflows the margin. The build reports overfull box
warnings; keep them near zero.
```

---

# Six failure modes specific to this repository

An agent will get these wrong unless the prompt says otherwise.

1. **Denominator drift.** It will switch the completion numerator to unique parcels because
   that looks more correct. It is not the agreed metric and it changes every published
   number. Map Monitor and the KPI dashboard must always use the same numerator.
2. **Stale cache-busting.** Modules import each other with `?v=` strings, for example
   `survey-layer.js?v=20260803-raw-completion-v2`. Change a shared adapter and every
   importer's version must move together, or browsers serve a mixed old and new bundle.
3. **Hardcoded endpoints.** ArcGIS URLs belong in `survey-layer.js`, `assignment-layer.js`,
   and `survey-submission-config.js`. Anywhere else is a defect.
4. **Hand-editing generated data.** Files under `docs/landcare/data/` come from the VM
   refresh. Hand edits are silently reverted by the next run.
5. **Guessing a NetSuite vendor alias.** An unmatched vendor is supposed to sit in
   `other_program_actuals`. Mapping it on a name that merely looks similar moves money onto
   the wrong contractor's variance line. Only Finance can confirm the relationship.
6. **Calling the native finance cards Power BI-backed.** The embedded tabs are governed and
   live; the native cards still read a dated NetSuite snapshot. The claim only becomes true
   when `finance_summary.json` contains `semantic_summary` and
   `actual_invoice_source.source_system` reads `Power BI semantic model`.

# What never goes in a prompt or a commit

No passwords, API keys, tokens, portal credentials, connection strings, or browser sessions.
This repository is public and GitHub Pages serves `docs/` to anyone. Environment variable
**names** are documented in the owner guide; values live on the VM and in GitHub Actions
secrets.

# Verification

```bash
python -m unittest discover -s tests
node --test tests/survey-layer.test.mjs
node --test tests/kpi-finance.test.mjs
node --test tests/kpi-powerbi-embed.test.mjs
```

`tests/test_handover_contract.py` guards the handover file set, asserts the current handover
declares the deprecated 7 AM job and the live ArcGIS sources, and checks the portability of
the design system CSS. `.github/workflows/pages.yml` runs the harder check on merge to `master`:
all routes exist, the summary JSON, GeoJSON, and refresh manifest agree on counts, and
ownership values stay within URA and Pittsburgh Land Bank. A red Pages workflow is a data
contract failure, not a deployment failure.

After deployment, open `/monitoring/`, `/kpi/`, and `/contractor/` and confirm counts,
comments, photos, field notes, filters, and the selected reporting period.

# Reviewing what an agent produced

Ask six questions before merging. They catch most of what goes wrong.

1. Which source does this read, and is it the authoritative one?
2. Did any published number change, and was the metrics doc updated with it?
3. Are all ArcGIS URLs still inside the two adapter files?
4. If a shared module changed, did every importer's `?v=` version move?
5. If `finance_summary.json` changed, does it still contain only aggregates?
6. What is the rollback, and has it been stated in the pull request?
