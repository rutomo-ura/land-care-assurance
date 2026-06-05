# Project Scope

Grounded against the inspected artifacts (SharePoint doc, `URA-GIS-User/URA-Data-Repository`, and the LandCare 2026 Power BI report). Tags used below: **[CONFIRMED]**, **[ROUGH NOTE]**, **[ASSUMPTION]**, **[NEXT]**.

## Purpose

Make LandCare survey assignments and completion reporting trustworthy, using work that the GIS/analyst team actually controls — the Python pipeline (`URA-Data-Repository`), the PostgreSQL `gis`/`analysis` schemas, and the Power BI semantic model — rather than contractor behavior or the Regrid platform.

## Primary Question

Why does the dashboard show ~11.7% survey return, and what can the GIS/analyst team change to make the assignment universe valid and the completion metric honest?

## What Is Already Confirmed (so we don't re-litigate it)

- **[CONFIRMED]** Assignment "creation" (`bundle_assignment_creation.py`) is a tag-filtered SQL→CSV export from `gis.epp_snapshot` (`tags LIKE 'LandCare - Active'` or `'LandCare - Request Only'`). No batching, balancing, or ownership check; only non-16-digit parcel numbers are dropped.
- **[CONFIRMED]** Survey responses load via `SurveysDriveToSQL.py` into `gis.regrid_survey_submissions`, keyed `(period, parcelnumb)`, period = the 15th of the month.
- **[CONFIRMED]** County ownership (`analysis.assessment_snapshot`) and city-owned property (`analysis.city_epp_properties`) data already exist in the DB.
- **[CONFIRMED]** Current-quarter numbers: 1,214 assigned / 142 returned. The dashboard already distinguishes Active vs Request Only and Expected vs Returned.

## In Scope (GIS/analyst-controllable, feasibility confirmed)

- **[CONFIRMED feasible]** Validate the assignment universe: confirm what `tags LIKE 'LandCare%'` actually returns and whether it matches the dashboard's 1,214.
- **[CONFIRMED feasible]** Sold/non-URA parcel exclusion: join `gis.epp_snapshot` to `analysis.assessment_snapshot` (and/or `city_epp_properties`) before the assignment CSV is written; log what gets excluded and why.
- **[CONFIRMED feasible]** Completion-metric correction: define numerator/denominator explicitly, report **Active-only** completion separately from Request-Only, and reproduce the rate from `gis.regrid_survey_submissions` vs the assignment universe.
- **[CONFIRMED feasible]** Dashboard visibility: surface Active-only completion, exclusion counts, the assigned-vs-owned reconciliation, and data-freshness/last-update.
- **[ROUGH NOTE / later]** Feasibility scoring of monthly bundles using historically completed parcels — new capability, sequenced after the above.
- Documentation of metric definitions, the assignment universe, and the manual handoff points (Regrid URL change, contracts upsert, NetSuite reports).

## Out Of Scope (measure and escalate, don't build first)

- **[CONFIRMED rationale]** Replacing or rebuilding Regrid. The dependency is deep (per-period manual export URL, browser-emulated download, shared personal login). Big lift, mostly outside GIS control.
- Directly enforcing contractor compliance, or changing field staffing, contract terms, or operations policy.
- Re-architecting the NetSuite/budget side of the pipeline (separate concern from survey completion).
- Modifying the GitHub repo. **[NEXT]** Treat repo changes as a later, separately-approved step — inspection only for now.

## Control Boundary

The first implementation surface is the parts of the pipeline GIS owns: the assignment-export query, the SQL schemas, reproducible metric queries, and the Power BI model. Contractor compliance, Regrid UX, and field capacity are diagnosed and reported from this layer, not solved inside it.

## Assumptions To Validate

- **[ASSUMPTION]** The blended ~11.7% mixes Active and Request-Only parcels; the Active-only rate is materially different. (Validate against the Survey Submission Rate page logic.)
- **[ASSUMPTION]** The 1,214 assigned vs 1,148 URA+PLB-owned gap (66 parcels) includes parcels with stale/blank ownership — a sold-parcel signal.
- **[ASSUMPTION]** `gis.epp_snapshot` tags are maintained outside this repo; sold parcels can remain tagged `LandCare - Active` until that upstream system is updated.
- **[ASSUMPTION]** Parcel-number formatting is consistent enough that the assignment export and `regrid_survey_submissions` join cleanly (the export reformats to Regrid style; surveys come back from Regrid).
- **[ASSUMPTION]** Some parcel/bundle features predict completion well enough to be worth a model.

## Phased Plan

### Phase 1 — Baseline and Definitions
- Reproduce the assignment universe from `gis.epp_snapshot` and reconcile to the dashboard's 1,214.
- Define assigned / returned / Active / Request Only / excluded explicitly.
- Reproduce the completion rate from SQL and split Active vs Request Only.

### Phase 2 — Data Integrity
- Join assignment candidates to `analysis.assessment_snapshot` to flag non-URA/PLB (sold/transferred) parcels.
- Add an exclusion step to (a copy of) the assignment logic with a logged reason per excluded parcel.
- Quantify how many of the 1,214 are at risk.

### Phase 3 — Metric and Dashboard
- Add an Active-only completion view by org, period, and (if available) geography/assignment age.
- Add exclusion-count and assigned-vs-owned reconciliation visuals; add data-freshness.
- Publish visible metric definitions so the dashboard's numbers are self-explaining.

### Phase 4 — Assignment Feasibility Model
- Define the target (completed vs not within a useful window) from `gis.regrid_survey_submissions`.
- Start with a transparent score; compare scored bundles to historical completion.
- Pilot as decision support, not an automated assignment rule.

## Success Criteria

- The team can state exactly what is in the assignment denominator and reproduce it from SQL.
- Active-only completion is reported separately and trusted.
- Sold/non-URA parcels are flagged (and optionally excluded) before assignment, with a logged reason.
- Dashboard users can see where completion breaks down and how fresh the data is.
- A feasible bundle-prioritization approach is ready for a small pilot.
