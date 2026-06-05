# Modular Work Plan

Grounded in the inspected pipeline. Concrete script, table, and dashboard-page names are used so each module is actionable. Tags: **[CONFIRMED]** (seen in an artifact), **[ASSUMPTION]** (validate first), **[NEXT]** (action).

## Reference: Confirmed Pipeline

- **Repo** `URA-GIS-User/URA-Data-Repository` (private). Relevant scripts:
  - `bundle_assignment_creation.py` — SQL→CSV export of LandCare assignments from `gis.epp_snapshot`.
  - `BundlesDriveToSQL.py` — upserts assignment CSVs back to the DB; creates assignment tables.
  - `SurveysDriveToSQL.py` — loads Regrid survey CSVs into `gis.regrid_survey_submissions`.
  - `ContractsDriveToSQL.py` — loads budget/contracts Excel (manual).
  - `countyownership_vm.py` — loads county assessment/ownership into `analysis.assessment_snapshot`.
  - `city_epp_properties_etl.py` → `analysis.city_epp_properties`; plus `city_parcels_etl.py`, `city_delinquent_etl.py`, `condemnation_etl.py`.
- **DB**: PostgreSQL, schemas `gis` and `analysis`, on the VM. Secrets in `C:\srv\secrets\.env`.
- **Dashboard pages (live, 7)**: Landing Page, Land Care Budget, Check Request History, Survey Submission Rate, Parcel Area Distribution, Parcel Details, Maintenance Expenses.

## Module 1: Assignment Universe QA

Goal: Confirm what is actually being assigned and reconcile it to the dashboard.

Inputs:
- `gis.epp_snapshot` (the export's source).
- `bundle_assignment_creation.py` query: `tags LIKE 'LandCare - Active'` OR `'LandCare - Request Only'`.
- Landing Page "Distinct Parcels Assigned" (currently 1,214).

Work to do:
- **[NEXT]** Run the export's SELECT against `gis.epp_snapshot` and count rows by maintenance level (Active vs Request Only).
- **[NEXT]** Reconcile that count to the dashboard's 1,214 and to 1,120 URA + 28 PLB owned (explain the 66 gap).
- **[CONFIRMED]** Note that the only current filter is the 16-digit parcel-number check; document parcels dropped there.
- **[ASSUMPTION]** Confirm where the `LandCare - *` tags are set (not in this repo).

Deliverables: assignment-universe definition; reconciliation note; count of dropped/invalid parcels.

## Module 2: Sold / Non-URA Parcel Exclusion

Goal: Stop surveying parcels the URA no longer owns.

Inputs:
- `gis.epp_snapshot` (assignment candidates).
- `analysis.assessment_snapshot` (county ownership; municodes 101–132 + 877) and `analysis.city_epp_properties`.

Work to do:
- **[CONFIRMED feasible]** Prototype a join from assignment candidates to `analysis.assessment_snapshot` on parcel number to flag parcels whose current owner is not URA/PLB.
- **[NEXT]** Quantify how many of the ~1,214 would be flagged.
- **[NEXT]** Propose an exclusion step (in a copy of the export logic) that drops/holds flagged parcels and logs a reason — do not edit the repo until approved.
- **[ASSUMPTION]** Validate parcel-number key alignment between `epp_snapshot` (16-digit) and `assessment_snapshot`.

Deliverables: ownership-join query; flagged-parcel count and examples; an exclusion-step proposal with logged reasons.

## Module 3: Completion Metric Validation

Goal: Confirm whether ~11.7% is right and make it honest.

Inputs:
- `gis.regrid_survey_submissions` (period, parcelnumb, status, maintenance level).
- The assignment universe from Module 1.
- "Survey Submission Rate" page (Active vs Request, Expected vs Returned).

Work to do:
- **[CONFIRMED]** Reproduce 142 returned / 1,214 assigned from SQL.
- **[NEXT]** Compute completion **Active-only** vs **Request-Only** separately (the brief's central metric flaw — Request-Only parcels are only visited on request, so they shouldn't sit in a blended denominator).
- **[NEXT]** Break completion down by organization and period; compare to the dashboard.
- **[NEXT]** Separate "no valid assignment" from "valid assignment, not completed."

Deliverables: explicit numerator/denominator definitions; reproduced Active-only rate; per-org/per-period table; list of metric gaps.

## Module 4: Dashboard Improvements

Goal: Make the real story visible on the existing 7-page report.

Inputs: the live Power BI model; validated definitions from Module 3.

Work to do:
- **[NEXT]** Add an **Active-only completion** measure alongside the blended rate on the Survey Submission Rate / Landing pages.
- **[NEXT]** Add exclusion-count and assigned-vs-owned reconciliation visuals (from Modules 1–2).
- **[NEXT]** Add data-freshness ("Data updated …" is shown; expose per-source last-load).
- **[NEXT]** Label numerator/denominator and filters on each completion visual.
- **[CONFIRMED]** Align the doc with reality: dashboard has 7 pages (doc says 6) and 9 orgs (doc says 8); the doc's dashboard section is unfinished.

Deliverables: dashboard backlog; validated Active-only tiles; reconciliation visuals.

## Module 5: Feasibility Scoring (later phase)

Goal: Help build monthly bundles field workers actually complete.

Inputs: history in `gis.regrid_survey_submissions`; parcel attributes from `epp_snapshot` / `city_parcels`; org/geography context.

Work to do:
- **[NEXT]** Define the target: completed vs not within a useful window.
- **[NEXT]** Build a transparent baseline score before any complex model.
- **[NEXT]** Backtest scored bundles against historical completion; keep it interpretable.
- **[CONFIRMED context]** This is new capability — the current export does zero bundling — so it follows Modules 1–4.

Deliverables: baseline scoring method; feature list; backtest summary; pilot recommendation.

## Module 6: Operating Rhythm & Pipeline Hardening

Goal: Make it repeatable and reduce known fragility.

Work to do:
- **[NEXT]** Run Universe QA + ownership exclusion before the 15th (the bundle-creation date).
- **[NEXT]** Review completion after the 18th (after the survey upsert).
- **[CONFIRMED risks to track/escalate]** The Regrid export URL is changed manually each period; the Regrid download uses a shared personal login; `ContractsDriveToSQL.py` and NetSuite reports are manual. Log these as operational risks (login/secret handling is an escalation, not a GIS code change).

Deliverables: monthly QA checklist; monthly review template; risk/decision log.

## Recommended First Sprint

1. Reproduce the assignment universe from `gis.epp_snapshot` and reconcile to 1,214 (Module 1).
2. Reproduce 142/1,214 and split Active-only vs Request-Only completion (Module 3).
3. Prototype the ownership join to flag sold/non-URA parcels and count them (Module 2).
4. Draft the dashboard backlog: Active-only completion + exclusion visibility (Module 4).
5. Document metric definitions and the manual handoff points (Module 6).
