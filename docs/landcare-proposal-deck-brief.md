# LandCare Assurance Proposal Deck Brief

Use this as source material for a PowerPoint-building agent. The intended deck is 13 slides, executive-readable, and map-first. Keep the design operational and decision-oriented, not decorative.

## Deck Strategy

Audience:

- URA Asset Management, GIS/data staff, and operational leadership.

Core message:

- LandCare's low survey completion is a controllable assurance problem. In two months, URA can make the assignment universe trustworthy, make contractor compliance visible, and pilot better assignment and survey workflows.

Tone:

- Practical, confident, specific.
- Avoid presenting a model as magic.
- Show that the first month earns trust and the second month improves operations.

Visual language:

- Use map views, contractor scorecards, funnel metrics, exception logs, and phase roadmap graphics.
- Avoid generic technology imagery.
- Use the interactive proposal page at `docs/proposal/index.html` as the primary visual reference. It is designed to publish at `/land-care-assurance/proposal/` through GitHub Pages.
- Use current prototype screenshots or simple mockups from the LandCare map dashboard where useful, but lead with the ArcGIS-style Pittsburgh map demo.
- Match the URA blue web theme used in the vacant-land triage map: primary blue `#0098d3`, dark blue `#006c9f`, deep navy `#00334f`, soft blue `#dff4fb`, muted blue-gray lines `#d8e4ea`, gold `#f0c24b` for open/warning states, and orange `#c2410c` for risk/exception states.
- Use square-edged panels, tables, buttons, and callouts rather than rounded cards. The deck should feel like an operational civic dashboard: white panels, light blue-gray page bands, blue section headers, and map-first layouts.
- Prefer Arial or Helvetica Neue, tight dashboard-scale headings, no negative letter spacing, and no decorative gradients.

## Slide Outline

### Slide 1: Title

Title:

- LandCare Assurance: Two-Month Scope To Improve Survey Success And Contractor Compliance

Subtitle:

- Monitoring, map view, data integrity, assignment optimization, and survey workflow modernization.

Visual:

- Full-width map screenshot or map-style parcel view.

Speaker note:

- This proposal is not only about a dashboard. It is about creating a trusted operating layer for monthly LandCare assignments and survey returns.

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
- Action: compare contractors fairly and optimize monthly bundles.
- Workflow: pilot a better survey intake path through ArcGIS or the web app.

Visual:

- Flow from assignment universe to valid assignments to survey returns to compliance action.

Speaker note:

- The path is deliberate: stabilize the data first, then optimize and modernize.

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

### Slide 6: Phase 2 Scope

Headline:

- Phase 2: Correct metrics and optimize monthly assignments.

Key points:

- Create contractor scorecards with valid denominators.
- Compare assigned parcels and assigned acreage by contractor per month.
- Model historical completion patterns.
- Bundle parcels by geography, acreage, capacity, and expected completion.
- Compare current assignment vs optimized assignment scenarios.

Visual:

- Side-by-side "current assignment" and "optimized assignment" map/table using the real latest-month assignment layer and bundle scenario controls from `/proposal/`.

Speaker note:

- Optimization helps separate poor compliance from poorly designed workload.

### Slide 7: Phase 3 Scope

Headline:

- Phase 3: Survey form workflow and Regrid reduction path.

Key points:

- Design a land care provider survey form.
- Use ArcGIS Survey123/Field Maps, Experience Builder, or a lightweight web form.
- Standardize parcel, period, contractor, status, photo, geolocation, timestamp, and issue reason fields.
- Keep Regrid temporarily only if it conforms to the shared ingestion contract.
- Pilot before deciding full replacement.

Visual:

- Form-to-data-contract-to-dashboard diagram.

Speaker note:

- The goal is not a risky platform swap. The goal is to control the intake contract so platforms become replaceable.

### Slide 8: Two-Month Roadmap

Headline:

- A realistic two-month path from trusted baseline to pilot.

Timeline:

- Weeks 1-2: baseline, reconciliation, data integrity checks.
- Weeks 3-4: monitoring product and contractor scorecards.
- Weeks 5-6: optimization prototype and scenario comparison.
- Weeks 7-8: survey form pilot and Regrid transition recommendation.

Visual:

- Four-lane roadmap with deliverables.

Speaker note:

- The sequencing protects the project from jumping into optimization before the denominator is trusted.

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

- Open-source web app for fast analytics, map demos, optimization scenarios, and proposal iteration.
- ArcGIS Online/Experience Builder for hosted operational layers and field workflow adoption.
- Shared PostgreSQL/export data contract underneath both.

Visual:

- Architecture diagram: source data to data contract to Power BI, web app, ArcGIS, survey form.

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
- Choose first survey form pilot surface.
- Confirm who approves Regrid reduction or replacement.

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
- Optimization prototype.
- Survey form pilot path.
- Recommendation on Regrid: keep, wrap, reduce, or replace.

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
- Keep every slide anchored to a business action: trust the data, adjust assignments, hold contractors accountable, or improve survey intake.
- Do not over-index on model terminology. Use "optimization prototype" and "historical completion scoring" unless a specific model has been validated.
- Use the two-month roadmap as the spine of the deck.
- Style the deck in the same URA-blue system as the interactive web version and vacant-land triage web theme: blue header/accent bars, square white content panels, blue table headers, gold/orange only for status meaning, and minimal ornament.
