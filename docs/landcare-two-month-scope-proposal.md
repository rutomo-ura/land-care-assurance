# LandCare Assurance Two-Month Scope Proposal

Prepared for a two-month delivery window. This proposal is written as a strategic scope, not a final technical specification. Based on meeting feedback, the first delivery focus is a monitoring tool and daily data pipeline that can be used by URA staff and contractors. Optimization and new survey interfaces should remain backlog/future-phase items until the monitoring foundation is trusted.

Interactive web demo: `docs/proposal/index.html`, publishable through GitHub Pages at `/land-care-assurance/proposal/` when the repo is served from the `docs` folder.

## Narrative Focus

LandCare's immediate need is a monitoring tool that makes survey completion, contractor performance, and data freshness visible to both URA and contractors. The project should begin by making the current workflow observable and reliable: daily survey-completion ingestion, a shared dashboard, and clear metrics that can also feed Power BI.

The project should therefore be framed around assurance:

1. Create a shared monitoring dashboard that URA and contractors can access.
2. Provide a map-based first page with key metrics, parcel status, contractor coloring, and current-month visibility.
3. Provide a second performance page with detailed contractor metrics, timeline trends, open/overdue work, and daily refresh status.
4. Automate daily survey-completion ingestion into a clean data contract that can also be consumed by Power BI.
5. Treat optimization and a new survey interface as future backlog after monitoring and data ingestion are stable.

The first win is not a new model or a new survey app. The first win is a system where URA and contractors can answer every day: which parcels were assigned, which have completed surveys, which remain open, which contractor is responsible, what changed since yesterday, and whether Power BI is reading the same trusted data.

## Core Outcomes

- Improve LandCare survey success rate by making completion, open work, and contractor follow-up visible every day.
- Increase contractor compliance visibility through a shared monitoring tool by month, contractor, geography, and status.
- Correct the metrics so Active, Request Only, assigned, returned, excluded, stale, and overdue parcels are not blended.
- Automate daily survey-completion ingestion so the monitoring tool and Power BI consume the same refreshed data.
- Create a dashboard structure with at least two pages: map/key metrics and performance/timeline.
- Prepare a decision-ready path for either ArcGIS Experience Builder, Power BI, or an open-source web app, while keeping a common data contract underneath all three.
- Keep optimization and survey-interface work out of the first delivery unless the monitoring/pipeline scope is complete.

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

### Phase 1: Shared Monitoring Tool, Map View, And Data Integrity

Goal: establish the trusted baseline and first shared operating view for URA and contractors.

Deliverables:

- Monthly assignment universe reconciliation from source SQL to dashboard count.
- Metric definitions for assigned, returned, expected, Active, Request Only, excluded, stale, valid-owned, open, overdue, and contractor completion.
- Ownership and eligibility checks using available county, URA, PLB, and city property references.
- Map view showing assigned vs returned parcels by month, contractor, ownership status, and completion status.
- First dashboard page: map-based view with key metrics, parcel coloring by survey status or contractor, contractor/month filters, and open-work callouts.
- Data freshness indicators for assignment, survey return, ownership, and dashboard refresh.
- Exception log for parcels excluded or flagged before assignment.
- Dashboard-ready data contract that can serve the web app, ArcGIS Online/Experience Builder, and Power BI.

Success criteria:

- Staff can reproduce the denominator for each monthly metric.
- Active completion is visible separately from Request Only.
- Invalid or questionable parcels are flagged before they inflate contractor assignments.
- A map makes contractor territory, open assignments, and data integrity issues visible to URA and contractors.

### Phase 2: Performance Metrics, Timeline, And Daily Ingestion Pipeline

Goal: make detailed performance, time trends, and daily refresh reliable enough for operations and Power BI.

Deliverables:

- Metric layer for LandCare success rate, contractor compliance, return timeliness, open assignments, expected-vs-returned, and valid-assignment rate.
- Contractor scorecard with fair comparisons by month, workload, geography, assigned area, returned parcels, and exceptions.
- Second dashboard page: performance/detail view with contractor drilldowns, timeline trends, open/overdue aging, and refresh status.
- Daily survey-completion ingestion job that normalizes the latest Regrid/survey output into the reporting table.
- Power BI-consumable dataset or view using the same metric definitions as the monitoring dashboard.
- Daily pipeline status indicators: last survey completion ingestion, row counts, failure alerts, and downstream Power BI refresh readiness.
- Visual presentation in the open-source web app, ArcGIS Experience Builder, and/or Power BI depending on audience.

Success criteria:

- The team can distinguish contractor non-compliance from impossible or inefficient bundles.
- URA and contractors can see map status, detailed performance, and trends without waiting for manual analysis.
- Survey completions refresh daily into the dashboard data contract and Power BI-ready layer.
- The dashboard tells a daily/monthly operating story: assigned, completed, overdue, exception, next action.

### Phase 3: Backlog: Optimization And Survey Interface

Goal: defer larger workflow changes until monitoring and ingestion are operating reliably.

Deliverables:

- Optimization backlog: assignment balance by contractor, parcel count, acreage, geography, and historical completion.
- Survey-interface backlog: ArcGIS Field Maps, Survey123, Experience Builder, or lightweight web form.
- Regrid dependency assessment after the daily ingestion path is stable.
- Pilot design only if Phase 1 and Phase 2 deliverables are complete.

Success criteria:

- Optimization is framed as a later operating improvement, not a prerequisite for monitoring.
- Survey-interface replacement is framed as a later workflow improvement, not the first delivery risk.
- Regrid becomes easier to replace later because daily ingestion and the reporting contract are already controlled.

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

### Weeks 3-4: Monitoring Product, Page 1

Focus:

- Build the first operational dashboard view: map plus key metrics.
- Add contractor and month filters.
- Add map coloring by completion status, contractor, ownership status, and exception reason.
- Add data freshness and dashboard refresh labels.
- Add Active vs Request Only completion logic.

Outputs:

- Monitoring-ready web app or ArcGIS layer.
- Contractor scorecard draft.
- Leadership-ready metric summary.
- Decision note on contractor access model and whether the shared view is hosted in ArcGIS Experience Builder, Power BI, or the open-source web app.

### Weeks 5-6: Performance Page And Daily Ingestion

Focus:

- Build the second dashboard page: performance/detail metrics and timeline.
- Add contractor drilldowns, trend lines, open/overdue aging, and completion by period.
- Automate daily ingestion of survey-completion data into the reporting contract.
- Expose a Power BI-consumable table/view with the same metric definitions.
- Add pipeline health checks for last ingestion time, row counts, and refresh failures.

Outputs:

- Performance/timeline dashboard page.
- Daily survey-completion ingestion job or scheduled pipeline specification.
- Power BI-ready dataset/view.
- Pipeline freshness and QA checks.

### Weeks 7-8: Contractor Access, Hardening, And Backlog

Focus:

- Validate access for URA users and contractor users.
- Harden daily ingestion, dashboard filters, row-level/security assumptions, and Power BI refresh handoff.
- Package monitoring documentation, metric definitions, and operating procedures.
- Create backlog recommendation for optimization and survey-interface work.

Outputs:

- Shared monitoring tool ready for URA/contractor review.
- Power BI consumption notes and refresh dependency list.
- Monitoring runbook and metric dictionary.
- Next-phase backlog for optimization and survey interface.

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

### Backlog Optimization Metrics

These remain useful for a future phase after the monitoring tool and daily ingestion are stable:

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
- Add dashboard filters, map layers, metric cards, contractor panels, performance timelines, and daily-ingestion status.
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
- Use hosted layer refreshes or feature layer views to support contractor-facing monitoring.
- Use Arcade expressions and hosted feature layer views for operational filters.

Tradeoffs:

- Faster alignment with existing GIS/contractor-facing workflows.
- More constrained for custom optimization comparisons.
- Needs governance around hosted layer refresh and permissions.

### Recommended Path

Use a shared data contract and build both paths deliberately:

- Open-source web app for fast analytics, public proposal/demo quality, and custom monitoring logic.
- ArcGIS Online/Experience Builder for hosted operational layers, contractor-facing access, and staff adoption.
- Power BI for internal reporting using the same daily refreshed completion data.

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

This gives leadership a fair basis for action: fix the data, follow up with contractors, improve operating cadence, or later adjust assignments.

## Backlog Survey Interface Scope

The survey interface can wait. The first two-month scope should not depend on replacing Regrid, Survey123, Field Maps, or contractor field tools. These fields remain useful when the team later designs a survey interface:

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

Future integration:

- The form should write to a normalized survey submissions table or export that matches the current downstream metric model.
- Regrid submissions can continue temporarily if mapped into the same contract.
- ArcGIS Survey123 or Field Maps should be evaluated first because they align with hosted layers and surveyor workflows.
- The Regrid export URL step should be treated as a known operational risk until replaced by a managed integration or removed from the workflow.
- The proposal web demo includes a `Take Worker Survey` interaction as backlog evidence only; it is not the first implementation priority after meeting feedback.

## Regrid Context To Preserve

Read-only Chrome inspection of the URA Regrid profile showed the current `LandCare Network` project under Pittsburgh with attached datasets labeled `Survey 727` and `CSV 1,191`, last viewed on June 17, 2026. This supports the proposal's transition stance:

- Treat Regrid as the current operating reference, not as the first thing to rip out.
- Normalize Regrid survey and CSV outputs into one survey-submission contract.
- Use the daily ingestion layer to reduce manual risk before deciding whether to keep, wrap, reduce, or replace Regrid.
- Decide on survey-interface replacement after the monitoring dashboard and Power BI feed are stable.

## Risks And Mitigations

- Risk: ownership data is stale or inconsistent.
  Mitigation: label ownership checks as assurance flags, log exclusions, and confirm source-of-truth rules with Asset Management.

- Risk: completion rate improves on paper by excluding difficult parcels.
  Mitigation: report valid-assignment rate and exception rate alongside completion.

- Risk: optimization distracts from the monitoring tool.
  Mitigation: keep optimization in backlog until the dashboard, daily ingestion, and Power BI feed are stable.

- Risk: ArcGIS and open-source paths diverge.
  Mitigation: define one data contract and make both products consume it.

- Risk: survey interface replacement becomes too large for two months.
  Mitigation: keep the current survey source working, automate daily ingestion, and defer interface replacement.

## Decisions Needed

- Which users need the first operating view: GIS/analyst staff, Asset Management leadership, contractors, or all three?
- Which source controls ownership when county, URA, PLB, and city references disagree?
- What is the expected return window after monthly assignment?
- Should Request Only parcels ever be included in contractor compliance denominators?
- What contractor access model and permissions are acceptable for shared dashboard access?
- Who owns the daily ingestion job and Power BI refresh monitoring?

## Final Two-Month Definition Of Done

The project is successful after two months if URA has:

- A trusted monthly assignment denominator with documented exclusions.
- Correct and visible metrics for LandCare success rate and contractor compliance.
- A map-first monitoring view for assignments, returns, open work, and exceptions.
- A performance/detail page with contractor scorecards, timelines, and open/overdue aging.
- Daily survey-completion ingestion into the shared reporting contract.
- A Power BI-ready dataset or view using the same metric definitions.
- A contractor access and dashboard governance recommendation.
- A next-phase backlog for optimization and survey interface work.
