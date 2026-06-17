# LandCare Assurance Two-Month Scope Proposal

Prepared for a two-month delivery window. This proposal is written as a strategic scope, not a final technical specification. It assumes the team wants a practical path that improves LandCare success rate, contractor compliance visibility, and trust in the survey metrics without making a risky full-platform migration the first move.

## Narrative Focus

LandCare's low survey return rate is not a single dashboard problem. It is an operating-system problem: the assignment universe may include parcels that should not be surveyed, the headline completion metric can hide the difference between expected and request-only work, contractor performance is hard to compare fairly, and the survey workflow still depends on fragile handoffs around Regrid.

The project should therefore be framed around assurance:

1. Make the monthly assignment universe trustworthy.
2. Make the completion and compliance metrics reproducible.
3. Make contractor workload and geography visible on a map.
4. Use history and spatial optimization to assign feasible bundles.
5. Modernize the survey intake path through ArcGIS or an open-source web app, with Regrid treated as an adapter that can be reduced or replaced.

The first win is not a new model. The first win is a system where staff can answer: which parcels were assigned, which were expected to be surveyed, which contractor was responsible, which were returned, which were invalid because of ownership or data issues, and what changed since last month.

## Core Outcomes

- Improve LandCare survey success rate by separating valid assignment, feasible workload, and contractor compliance.
- Increase contractor compliance visibility through a map-first performance view by month, contractor, geography, and status.
- Correct the metrics so Active, Request Only, assigned, returned, excluded, stale, and overdue parcels are not blended.
- Reduce wasted survey effort by flagging sold, transferred, duplicate, stale, or non-URA/PLB parcels before monthly assignment.
- Prepare a decision-ready path for either ArcGIS Experience Builder or an open-source web app, while keeping a common data contract underneath both.
- Create a practical survey form workflow for land care provider surveyors in ArcGIS Field Maps/Survey123 or an equivalent web form.

## Scope Summary

## Confirmed Monthly Workflow Boundary

The repo documentation and meeting notes confirm that the current monthly LandCare workflow is partly automated and partly manual. This matters because the project should harden the existing monthly cycle before redesigning the whole platform.

Automated on the VM through Windows Task Scheduler:

- 15th, 3:00am: `bundle_assignment_creation.py` creates the period assignment CSV from `gis.epp_snapshot`.
- 15th, 3:15am: `BundlesDriveToSQL.py` upserts assignment records into PostgreSQL.
- 15th, 3:30am: `regrid_survey_download.py` downloads Regrid survey responses.
- 18th, 3:45am: `SurveysDriveToSQL.py` upserts survey responses after the correction window.

Manual or not fully automated:

- `ContractsDriveToSQL.py` budget and contracts upsert from Excel.
- NetSuite saved-report setup.
- Per-period Regrid export URL update.
- Regrid download dependency on a personal/shared login that should be moved to managed credentials.

Confirmed workflow implication:

- `bundle_assignment_creation.py` is assignment export, not optimization. It filters `gis.epp_snapshot` by LandCare tags, formats parcel numbers for Regrid, and writes one row per parcel. It does not currently balance bundles, check ownership, exclude sold parcels, or optimize surveyor workload.
- The two-month scope should therefore add assurance gates around this monthly cycle: pre-15th universe QA and exclusions, post-18th return monitoring, and a future-ready survey intake contract.

### Phase 1: Monitoring, Map View, And Data Integrity

Goal: establish the trusted baseline and operational control view.

Deliverables:

- Monthly assignment universe reconciliation from source SQL to dashboard count.
- Metric definitions for assigned, returned, expected, Active, Request Only, excluded, stale, valid-owned, open, overdue, and contractor completion.
- Ownership and eligibility checks using available county, URA, PLB, and city property references.
- Map view showing assigned vs returned parcels by month, contractor, ownership status, and completion status.
- Data freshness indicators for assignment, survey return, ownership, and dashboard refresh.
- Exception log for parcels excluded or flagged before assignment.
- Dashboard-ready data contract that can serve Power BI, ArcGIS Online, or the open-source prototype.

Success criteria:

- Staff can reproduce the denominator for each monthly metric.
- Active completion is visible separately from Request Only.
- Invalid or questionable parcels are flagged before they inflate contractor assignments.
- A map makes contractor territory, open assignments, and data integrity issues visible.

### Phase 2: Correct Metrics, Visual Product, And Assignment Optimization

Goal: move from reporting what happened to improving what gets assigned.

Deliverables:

- Metric layer for LandCare success rate, contractor compliance, return timeliness, open assignments, expected-vs-returned, and valid-assignment rate.
- Contractor scorecard with fair comparisons by month, workload, geography, assigned area, returned parcels, and exceptions.
- Workload optimizer prototype that bundles parcels by area, geography, contractor capacity, and historical completion likelihood.
- Past-succession or historical-completion model that learns which parcel and bundle patterns are likely to be completed.
- Scenario comparison: current assignment vs optimized assignment by contractor, total parcel count, total acreage, distance/geographic compactness, and expected completion.
- Visual presentation in the open-source web app and/or ArcGIS Experience Builder.

Success criteria:

- The team can distinguish contractor non-compliance from impossible or inefficient bundles.
- Monthly bundles can be generated or reviewed using explicit optimization rules.
- Leadership can see expected improvement, not just retrospective completion.
- The dashboard tells a monthly operating story: assigned, feasible, completed, overdue, exception, next action.

### Phase 3: Survey Form Workflow And Regrid Reduction

Goal: reduce dependency risk and improve the field workflow.

Deliverables:

- Land care provider/surveyor form design for ArcGIS Field Maps, Survey123, Experience Builder, or a lightweight open-source form.
- Required form fields and validation rules: parcel ID, period, contractor, visit status, completion status, photo evidence, notes, geolocation, timestamp, and issue reason.
- Survey ingestion contract so Regrid, ArcGIS, or a custom web form can all feed the same downstream table.
- Regrid dependency assessment: keep, wrap, partially replace, or eliminate.
- Pilot workflow for one contractor or one monthly assignment cycle.

Success criteria:

- Surveyors can submit parcel-level results with less manual export friction.
- The same metrics work regardless of whether returns come from Regrid or ArcGIS.
- Regrid becomes replaceable because the project controls the intake contract.
- The team can decide whether to eliminate legacy Regrid based on pilot evidence.

## Two-Month Delivery Plan

### Weeks 1-2: Baseline And Data Integrity

Focus:

- Confirm current assignment tables, survey tables, parcel keys, period logic, and dashboard counts.
- Reconcile current reported metrics to source data.
- Document the automated vs manual monthly steps and add them to the risk/decision log.
- Define valid assignment rules and exclusion reasons.
- Create a simple exception table or export.
- Update the prototype/map data contract to carry the fields needed for monitoring.

Outputs:

- Metric definition document.
- Data-quality checklist.
- Valid-assignment and exclusion query draft.
- First map view of assigned, returned, open, and flagged parcels.

### Weeks 3-4: Monitoring Product

Focus:

- Build the first operational dashboard view.
- Add contractor and month filters.
- Add map coloring by completion status, contractor, ownership status, and exception reason.
- Add data freshness and dashboard refresh labels.
- Add Active vs Request Only completion logic.

Outputs:

- Monitoring-ready web app or ArcGIS layer.
- Contractor scorecard draft.
- Leadership-ready metric summary.
- Decision note on Power BI vs ArcGIS Experience Builder vs open-source web app for the next phase.

### Weeks 5-6: Optimization Prototype

Focus:

- Define bundle constraints: contractor capacity, parcel count, acreage, geography, prior completion, maintenance level, and assignment month.
- Build a transparent scoring model before moving to a more complex model.
- Compare historical completion by contractor, geography, and bundle type.
- Prototype optimized monthly bundles and compare them to current assignments.

Outputs:

- Optimization scoring method.
- Scenario comparison table.
- Map view showing current vs proposed bundles.
- Recommendation for pilot assignment logic.

### Weeks 7-8: Survey Form Pilot And Transition Plan

Focus:

- Design the field survey form and submission workflow.
- Create the shared survey ingestion contract.
- Test ArcGIS-based and open-source form options against required fields.
- Identify which legacy Regrid steps can be removed, wrapped, automated, or left in place.
- Package the implementation roadmap and executive proposal.

Outputs:

- Survey form specification.
- ArcGIS or open-source form pilot path.
- Regrid transition recommendation.
- Final two-month proposal package and next-phase backlog.

## Metric Framework

### North Star Metrics

- LandCare success rate: valid returned surveys divided by valid expected assignments.
- Contractor compliance rate: valid returned surveys divided by valid assignments expected from that contractor for the period.
- Valid-assignment rate: valid assignments divided by all assignment candidates before exclusions.
- On-time return rate: returned surveys submitted inside the expected window divided by valid expected assignments.
- Open assignment count: valid expected assignments without a returned survey.
- Exception rate: assignments excluded or flagged due to ownership, parcel key, stale tag, duplicate, or eligibility issue.

### Diagnostic Metrics

- Active completion rate and Request Only return rate, reported separately.
- Completion by contractor, month, neighborhood/territory, maintenance level, acreage band, and bundle size.
- Assigned acreage by contractor per month.
- Returned acreage by contractor per month.
- Open assignments by age.
- Parcels assigned but likely no longer URA/PLB owned.
- Parcels with repeated non-return across periods.
- Parcels returned without a matching valid assignment.

### Optimization Metrics

- Expected completion probability by parcel or bundle.
- Geographic compactness score.
- Contractor monthly capacity utilization.
- Assignment balance by parcel count and acreage.
- Historical completion similarity score.
- Route or territory burden proxy.
- Compliance-adjusted expected return.

## Product Architecture Options

### Option A: Open-Source Web App

Best when the priority is speed, flexibility, custom metric logic, and source-control visibility.

Recommended use:

- Continue the existing Leaflet prototype.
- Add dashboard filters, map layers, metric cards, contractor panels, and scenario comparison.
- Generate static data files from PostgreSQL for low-friction publishing.
- Later migrate to MapLibre/vector tiles or an API if scale requires it.

Tradeoffs:

- More custom ownership by the team.
- Requires a deployment path and maintenance owner.
- Easier to make exactly the operational product needed.

### Option B: ArcGIS Experience Builder

Best when the priority is ArcGIS Online integration, staff familiarity, hosted layers, and field app alignment.

Recommended use:

- Publish the assignment/survey layer to ArcGIS Online.
- Build Experience Builder pages for monitoring, contractor comparison, and parcel review.
- Connect to Survey123 or Field Maps for field submission.
- Use Arcade expressions and hosted feature layer views for operational filters.

Tradeoffs:

- Faster alignment with field survey workflows.
- More constrained for custom optimization comparisons.
- Needs governance around hosted layer refresh and permissions.

### Recommended Path

Use a shared data contract and build both paths deliberately:

- Open-source web app for fast analytics, optimization comparison, and proposal/demo quality.
- ArcGIS Online/Experience Builder for field operations, survey form pilot, and staff adoption.

The decision should not be "web app or ArcGIS." The decision should be: which surface owns each job, with the same source data underneath.

## Contractor Compliance Model

The proposal should avoid blaming contractors before the data can separate three causes:

1. Invalid work: parcels should not have been assigned.
2. Infeasible work: assignments are too dispersed, too large, or poorly balanced.
3. Non-compliant work: valid, feasible assignments were not returned.

Compliance reporting should therefore show:

- Valid assignments by contractor.
- Returned surveys by contractor.
- Open and overdue assignments by contractor.
- Exceptions removed from each contractor's denominator.
- Workload by parcel count and acreage.
- Geography/territory burden.
- Historical performance against similar bundles.

This gives leadership a fair basis for action: fix the data, adjust assignments, or address contractor performance.

## Survey Form Scope

Required fields:

- Period/month.
- Parcel identifier in the normalized project format and display format.
- Contractor/provider.
- Surveyor name or authenticated user.
- Assignment ID or bundle ID.
- Visit status.
- Maintenance condition.
- Completion status.
- Photo attachment.
- Geolocation.
- Timestamp.
- Issue reason.
- Notes.

Validation rules:

- Parcel ID must match an active valid assignment or be marked as an exception.
- Required photo when status is returned/completed.
- Required reason when unable to complete.
- Geolocation captured where possible.
- Duplicate submissions resolved by period, parcel, and contractor rule.

Integration:

- The form should write to a normalized survey submissions table or export that matches the current downstream metric model.
- Regrid submissions can continue temporarily if mapped into the same contract.
- ArcGIS Survey123 or Field Maps should be evaluated first because they align with hosted layers and surveyor workflows.
- The Regrid export URL step should be treated as a known operational risk until replaced by a managed integration or removed from the workflow.

## Risks And Mitigations

- Risk: ownership data is stale or inconsistent.
  Mitigation: label ownership checks as assurance flags, log exclusions, and confirm source-of-truth rules with Asset Management.

- Risk: completion rate improves on paper by excluding difficult parcels.
  Mitigation: report valid-assignment rate and exception rate alongside completion.

- Risk: optimization overfits historical contractor behavior.
  Mitigation: start with transparent scoring, compare scenarios, and pilot before automation.

- Risk: ArcGIS and open-source paths diverge.
  Mitigation: define one data contract and make both products consume it.

- Risk: Regrid replacement becomes too large for two months.
  Mitigation: design an intake contract and pilot one alternate form instead of forcing a full migration.

## Decisions Needed

- Which users need the first operating view: GIS/analyst staff, Asset Management leadership, contractors, or all three?
- Which source controls ownership when county, URA, PLB, and city references disagree?
- What is the expected return window after monthly assignment?
- Should Request Only parcels ever be included in contractor compliance denominators?
- Should the first field workflow pilot use ArcGIS Survey123, Field Maps, Experience Builder, or an open-source form?
- Who approves Regrid reduction or replacement?

## Final Two-Month Definition Of Done

The project is successful after two months if URA has:

- A trusted monthly assignment denominator with documented exclusions.
- Correct and visible metrics for LandCare success rate and contractor compliance.
- A map-first monitoring view for assignments, returns, open work, and exceptions.
- A prototype optimization method for assigning contractor bundles by geography, acreage, capacity, and historical completion.
- A survey form pilot specification or working pilot path in ArcGIS or the web app.
- A clear recommendation on whether to keep, wrap, reduce, or replace Regrid.
