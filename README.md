# Land Care Assurance

Working notes and scoping for improving URA LandCare survey assignment quality, completion metrics, and dashboard visibility. Based on direct inspection of the SharePoint documentation, Power BI report, and related script repository as of June 5, 2026.

## Context

The current pipeline moves data from Regrid, NetSuite, county sources, and city sources into CSVs on the G drive, then into PostgreSQL schemas `gis` and `analysis`, then into a Power BI semantic model refreshed daily.

Monthly jobs run from Windows Task Scheduler on the VM:

- 15th, 3:00am: `bundle_assignment_creation.py`
- 15th, 3:15am: `BundlesDriveToSQL.py`
- 15th, 3:30am: `regrid_survey_download.py`
- 18th, 3:45am: `SurveysDriveToSQL.py`

Budget and contracts upsert, NetSuite report setup, and the per-period Regrid export URL update remain manual.

## Key Findings

- `bundle_assignment_creation.py` exports LandCare parcels from `gis.epp_snapshot` using tag filters only. No batching, balancing, ownership validation, or sold-parcel exclusion is applied.
- The Power BI Landing Page shows 1,214 assigned parcels and 142 returned surveys for the current quarter, about 11.7%.
- The headline completion rate blends Active parcels, which are expected every period, with Request Only parcels, which are expected only on request.
- County ownership data already exists in `analysis.assessment_snapshot`, which can support a sold or non-URA parcel check before assignment.

## Work Focus

The first phase focuses on work the GIS and analyst team controls:

- Validate the assignment universe.
- Reconcile SQL counts to the Power BI dashboard.
- Split completion into Active and Request Only.
- Identify parcels that may no longer be URA or PLB owned.
- Define dashboard improvements for metric clarity and data freshness.

## Repository Structure

- `raw_notes/20260605-oscar-brief.md`: original rough brief.
- `docs/meeting-notes/2026-06-05-land-care-assurance.md`: cleaned meeting notes with confirmed items, assumptions, and next actions.
- `docs/project-scope.md`: scoped project definition for GIS and analyst-controlled work.
- `docs/modular-work-plan.md`: module-level work plan tied to scripts, tables, dashboard pages, and metrics.
- `docs/north-star-vision.md`: longer-term vision for a parcel-state assurance system.
- `docs/concept-prioritization-model.md`: completion-propensity prioritization concept for a later phase.
- `plan/Kickoff-rizaldy-assignment.md`: 2-week kickoff plan.
- `plan/week-1-day-1-baseline-qa.md`: Day 1 checklist and manual SQL query sequence.

## Source Links

- SharePoint documentation: https://ura2.sharepoint.com/:w:/s/AssetManagement/IQDAO9ROALeoTZmlS8Ww-J3hAalqn2rd_-tPHczfSouUTXU?e=Ui0E32
- Power BI dashboard: https://app.powerbi.com/links/2pxzsYoxHs?ctid=c77df146-c538-49e4-9577-c9ee1d243d16&pbi_source=linkShare
- Script repository: https://github.com/URA-GIS-User/URA-Data-Repository
- LandCare data on the G drive: `G:\Public\LandCare\Y10-11 2025-2027 wPLB`
- LandCare data UNC path: `\\ura-fs\share\Public\LandCare\Y10-11 2025-2027 wPLB`

## Current Next Step

Run the Week 1 Day 1 baseline QA checklist in `plan/week-1-day-1-baseline-qa.md`. The immediate deliverable is a short findings note with assignment count, returned survey count, Active-only completion rate, Request Only returned count, dashboard filter settings, and any reconciliation gaps.
