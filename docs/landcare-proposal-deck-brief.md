# LandCare Assurance Proposal Deck Brief

Use this as source material for a PowerPoint-building agent. The intended deck is 13 slides, executive-readable, and map-first. Keep the design operational and decision-oriented, not decorative.

## Deck Strategy

Audience:

- URA Asset Management, GIS/data staff, and operational leadership.

Core message:

- LandCare's immediate need is a shared monitoring tool. In two months, URA can make completion status, contractor performance, timeline trends, and daily survey-completion refresh visible to URA staff and contractors. Optimization and a new survey interface should be treated as later backlog.

Tone:

- Practical, confident, specific.
- Avoid presenting a model as magic.
- Show that the first month earns trust and the second month improves operations.

Visual language:

- Use map views, contractor scorecards, funnel metrics, exception logs, and phase roadmap graphics.
- Avoid generic technology imagery.
- Use the interactive proposal page at `docs/proposal/index.html` as the primary visual reference. It is designed to publish at `/land-care-assurance/proposal/` through GitHub Pages.
- Use current prototype screenshots or simple mockups from the LandCare map dashboard where useful, but lead with the ArcGIS-style Pittsburgh map demo.
- Include one dashboard screenshot that shows the map legend toggled from survey status to contractor colors, and one mobile surveyor screenshot that shows parcel selection, `Take Survey`, form completion, and evidence attachment.
- Use the local evidence captures in `outputs/proposal-evidence/` for deck styling: `regrid-landcare-network-reference.png`, `ura-ownership-style-reference.png`, `landcare-dashboard-legend-toggle.png`, and `landcare-mobile-surveyor-flow.png`. Keep the Regrid screenshot out of public deliverables if it exposes account/session details.
- Match the URA blue web theme used in the vacant-land triage map: primary blue `#0098d3`, dark blue `#006c9f`, deep navy `#00334f`, soft blue `#dff4fb`, muted blue-gray lines `#d8e4ea`, gold `#f0c24b` for open/warning states, and orange `#c2410c` for risk/exception states.
- Use square-edged panels, tables, buttons, and callouts rather than rounded cards. The deck should feel like an operational civic dashboard: white panels, light blue-gray page bands, blue section headers, and map-first layouts.
- Prefer Arial or Helvetica Neue, tight dashboard-scale headings, no negative letter spacing, and no decorative gradients.

## Slide Outline

### Slide 1: Title

Title:

- LandCare Assurance: Two-Month Monitoring Tool Scope

Subtitle:

- Shared URA/contractor monitoring, map view, performance metrics, timeline, and daily survey-completion ingestion.

Visual:

- Full-width map screenshot or map-style parcel view.

Speaker note:

- This proposal is about creating the monitoring layer first: a shared dashboard and daily data pipeline that make LandCare status clear to URA and contractors.

### Slide 2: Current Workflow Reality

Headline:

- The core monthly data movement is scheduled, but important handoffs are still manual.

Key points:

- 15th, 3:00am: `bundle_assignment_creation.py` creates the assignment CSV.
- 15th, 3:15am: `BundlesDriveToSQL.py` upserts assignments.
- 15th, 3:30am: `regrid_survey_download.py` downloads Regrid responses.
- 18th, 3:45am: `SurveysDriveToSQL.py` upserts survey responses.
- Manual: contracts/budget upsert, NetSuite saved reports, and the per-period Regrid export URL.
- Current assignment creation is a tag-filtered export, not a balancing or optimization engine.

Visual:

- Monthly workflow timeline with automated and manual badges.

Speaker note:

- This is the reason the proposal starts with assurance gates around the current cycle before changing field tools.

### Slide 3: The Problem

Headline:

- The reported completion rate is a symptom, not the whole problem.

Key points:

- The monthly assignment universe may include invalid or stale parcels.
- Completion can blend Active and Request Only parcels.
- Contractor compliance is hard to judge without workload, geography, and valid-denominator context.
- Regrid adds workflow fragility and manual handoffs.

Visual:

- Four-part diagnostic graphic: data integrity, metric clarity, contractor compliance, survey workflow.

Speaker note:

- Before asking whether contractors are failing, the system needs to prove that the assignment denominator is valid and the work is feasible.

### Slide 4: Proposal Narrative

Headline:

- Build an assurance system before judging performance.

Key points:

- Truth: reconcile assignments, returns, ownership, and exclusions.
- Visibility: map assigned, returned, open, and flagged parcels.
- Action: compare contractors fairly and identify follow-up work.
- Pipeline: ingest survey completions daily and feed both the monitoring dashboard and Power BI.

Visual:

- Flow from assignment universe to valid assignments to survey returns to compliance action.

Speaker note:

- The path is deliberate: stabilize monitoring and daily ingestion before optimizing assignments or redesigning survey intake.

### Slide 5: Phase 1 Scope

Headline:

- Phase 1: Monitoring, map view, and data integrity.

Key points:

- Reproduce monthly assignment counts from source data.
- Define Active, Request Only, assigned, returned, valid, excluded, open, and overdue.
- Flag sold, transferred, duplicate, stale, or non-URA/PLB parcels.
- Build a map view by month, contractor, status, and ownership.
- Add data freshness indicators.

Visual:

- Screenshot or recreation of the `/proposal/` monitoring map: returned, open, and exception parcels over Pittsburgh neighborhoods.

Speaker note:

- This phase turns the dashboard from a static report into an operational control view.

### Slide 6: Page 2 Scope

Headline:

- Page 2: Performance, detailed metrics, and timeline.

Key points:

- Create contractor scorecards with valid denominators.
- Compare assigned parcels and assigned acreage by contractor per month.
- Track completion by contractor, geography, maintenance level, and age.
- Add timeline trends for daily/weekly survey completion movement.
- Show open/overdue aging and contractor drilldowns.
- Show pipeline freshness, last daily ingestion, and Power BI refresh readiness.

Visual:

- Contractor performance table plus timeline trend and daily ingestion status.

Speaker note:

- This page turns the dashboard into an operating tool: who is behind, what changed, and whether the data refreshed.

### Slide 7: Daily Data Pipeline

Headline:

- Daily survey-completion ingestion feeds dashboard and Power BI.

Key points:

- Automate daily ingestion from the current survey-completion source.
- Normalize survey completions into a shared reporting table.
- Feed the web/ArcGIS monitoring dashboard and Power BI from the same data contract.
- Track pipeline health: last run, row counts, validation failures, and freshness.
- Keep survey-interface replacement and optimization as backlog until the monitoring pipeline is stable.

Visual:

- Pipeline diagram: survey completion source -> daily ingestion -> normalized reporting table -> monitoring dashboard and Power BI.

Speaker note:

- The goal is not a risky platform swap. The goal is to make completion data refresh daily and consistently everywhere it is consumed.

### Slide 8: Two-Month Roadmap

Headline:

- A realistic two-month path from trusted baseline to pilot.

Timeline:

- Weeks 1-2: baseline, reconciliation, data integrity checks.
- Weeks 3-4: monitoring product and contractor scorecards.
- Weeks 5-6: performance/timeline page and daily ingestion pipeline.
- Weeks 7-8: contractor access, Power BI handoff, hardening, and backlog.

Visual:

- Four-lane roadmap with deliverables.

Speaker note:

- The sequencing protects the project from jumping into optimization or survey-app redesign before monitoring and daily ingestion are trusted.

### Slide 9: Metric Framework

Headline:

- The metrics should explain where work fails.

North star metrics:

- LandCare success rate.
- Contractor compliance rate.
- Valid-assignment rate.
- On-time return rate.
- Open assignment count.
- Exception rate.

Diagnostic metrics:

- Active vs Request Only.
- Completion by contractor, month, geography, maintenance level, bundle size, and acreage.
- Repeated non-return.
- Returned without matching assignment.

Visual:

- Funnel: candidates, valid assignments, expected assignments, returned surveys, overdue/open, exceptions.

Speaker note:

- A single percentage is not enough. The operating view needs to show which part of the system is failing.

### Slide 10: Product Path

Headline:

- Use one data contract across web app and ArcGIS.

Recommended split:

- Open-source web app for fast analytics, shared dashboard pages, and proposal iteration.
- ArcGIS Online/Experience Builder for hosted operational layers and field workflow adoption.
- Shared PostgreSQL/export data contract underneath both.

Visual:

- Architecture diagram: survey completion source to daily ingestion to data contract to Power BI, web app, and ArcGIS.

Speaker note:

- The team does not need to choose one surface too early. The important decision is owning the data contract.

### Slide 11: Contractor Compliance

Headline:

- Fair compliance reporting separates invalid, infeasible, and non-compliant work.

Key points:

- Invalid: parcel should not have been assigned.
- Infeasible: workload is poorly balanced or geographically inefficient.
- Non-compliant: valid, feasible assignment was not returned.

Visual:

- Three-bucket performance diagnostic with example actions.

Speaker note:

- This framing lets leadership act without blaming the wrong cause.

### Slide 12: Decisions Needed

Headline:

- Decisions to unlock the two-month plan.

Decision list:

- Confirm the primary audience for the first operating view.
- Confirm ownership source-of-truth rules.
- Confirm expected return window.
- Confirm whether Request Only parcels belong in compliance denominators.
- Confirm contractor access and security model.
- Confirm Power BI refresh ownership and daily pipeline alert process.

Visual:

- Decision table with owner and target date columns.

Speaker note:

- These decisions are small enough to make early, but they prevent ambiguity later.

### Slide 13: Definition Of Done

Headline:

- At the end of two months, URA has an operating layer, not just a report.

Deliverables:

- Trusted monthly assignment denominator.
- Correct success and compliance metrics.
- Map-first monitoring view.
- Contractor scorecard.
- Performance/timeline page.
- Daily survey-completion ingestion.
- Power BI-ready reporting layer.
- Backlog for optimization and survey interface.

Visual:

- Before/after comparison: from "11.7% returned" to a full operating view.

Speaker note:

- The final output should let URA see what happened, why it happened, and what to change before the next assignment cycle.

## Suggested Appendix Slides

- Current data flow and manual handoffs.
- Draft data contract fields.
- Example contractor scorecard.
- Example exception log.
- ArcGIS Experience Builder vs open-source web app comparison.
- Risks and mitigations.

## Design Notes For The Deck Agent

- Build slides around evidence and decisions.
- Use maps and operational UI mockups as the main visuals.
- Keep every slide anchored to a business action: trust the data, see daily status, follow up with contractors, and keep Power BI aligned.
- Do not over-index on model terminology. Optimization and survey-interface concepts should be labeled as future backlog, not the first implementation scope.
- Use the two-month roadmap as the spine of the deck.
- Style the deck in the same URA-blue system as the interactive web version and vacant-land triage web theme: blue header/accent bars, square white content panels, blue table headers, gold/orange only for status meaning, and minimal ornament.
