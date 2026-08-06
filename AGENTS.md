# Agent instructions for LandCare Assurance

Read [`handover/04-readiness-checklist.md`](handover/04-readiness-checklist.md)
first for current status, then
[`handover/01-owner-guide.md`](handover/01-owner-guide.md) for the architecture,
the metric rules, daily operations, finance, and the Regrid replacement. Then read
[`handover/02-agent-playbook.md`](handover/02-agent-playbook.md), which carries
the prompt structure and a recipe for most tasks you will be asked to do.

[`HANDOVER.md`](HANDOVER.md) is the repository and Pages administration guide.

## Design system

The URA design system is installed as a skill at
`.claude/skills/ura-landcare-design/`. Use it for any new or restyled surface.
Its tokens are extracted directly from `docs/landcare/app.css`, so the product
and the design system cannot drift apart.

Three style sources exist and they are not interchangeable. `docs/landcare/app.css`
is the live product. The skill is the formalised system for new work.
`docs/design-system/executive-bi.css` is a portable kit for BI surfaces outside
LandCare; do not import it into a product page.

## Source of truth

- Live ArcGIS layers provide current assignments, survey evidence, comments,
  field notes, and freshness metadata at page load.
- `docs/landcare/data/` is a checked-in compatibility fallback, last generated
  29 July 2026. It is not the current data source and not a freshness signal.
- The shared survey adapter is `docs/landcare/survey-layer.js`; keep its
  canonical `additional_notes` normalization and cache-busting imports intact.
- All ArcGIS endpoints live in `survey-layer.js`, `assignment-layer.js`, and
  `survey-submission-config.js`. An endpoint anywhere else is a defect.
- Land Care Budget and Parcel Area are secure Power BI embeds and are the
  authoritative finance reporting surface. NetSuite is the upstream accounting
  system; `scripts/ingest_landcare_netsuite_checks.py` is supervised
  reconciliation, not a production feed. Do not describe the native KPI finance
  cards as Power BI-backed until `finance_summary.json` contains
  `semantic_summary` and `actual_invoice_source.source_system` reads
  `Power BI semantic model`. Actuals are check requests, not cleared payments.
  `finance_summary.json` carries aggregates only; document numbers, memos, and
  transaction-level vendor records must never be published.
- The 7:00 AM `refresh_landcare_dashboard.ps1` job is deprecated. Live pages read
  ArcGIS at page load. Do not reintroduce a dependency on it.
- Completion currently uses raw survey records matched to assignment parcels,
  like the Map Monitor. It is intentionally not a unique-parcel count.

## Change rules

- Do not commit passwords, API keys, tokens, private keys, or browser sessions.
- Do not change an ArcGIS endpoint, metric denominator, or field mapping without
  updating the architecture/metrics documentation and focused tests.
- Preserve `master` and the live ArcGIS-first fallback behavior.
- Keep user-visible text source-aware and escape HTML-like data from ArcGIS.
- Keep module cache-busting versions aligned whenever shared adapters change.

## Verification before push

Run the Python tests, `node --test tests/survey-layer.test.mjs`, the Pages
validation checks, and a read-only ArcGIS smoke test for metadata, period
statistics, parcel lookup, comments, and completion counts. Open Map Monitor,
KPI, contractor, and survey-submission routes after deployment. For scheduled
refresh changes, validate the VM status JSON and perform one checked run.

## Agent handoff standard

Explain the source, denominator, affected page, test command, and rollback path
in every PR. Prefer a small branch and a focused pull request over editing
generated data by hand.
