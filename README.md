# Land Care Assurance

Working notes and scoping for improving URA LandCare survey-assignment quality, completion metrics, and dashboard visibility. This version is grounded in direct inspection of the linked artifacts (June 5, 2026), not just the rough brief.

## Context (Confirmed)

The pipeline moves data from Regrid + NetSuite + county/city sources → CSVs on the G drive → PostgreSQL (`gis` and `analysis` schemas on a VM) → a Power BI semantic model refreshed daily. A VM Windows Task Scheduler runs the monthly jobs: bundle assignment creation (15th 3:00am), bundle upsert (15th 3:15am), Regrid survey download (15th 3:30am), and survey upsert (18th 3:45am). Budget/contracts upsert, NetSuite report setup, and the per-period Regrid export-URL change are manual.

Two findings reshape the project:

- "Bundle assignment creation" (`bundle_assignment_creation.py`) is a tag-filtered SQL→CSV export from `gis.epp_snapshot` — there is no batching, balancing, or ownership check, and no sold-parcel exclusion. Model-based bundling would be new capability, not a tweak.
- The ~10% figure is real: the Power BI Landing Page shows 1,214 parcels assigned vs 142 surveys returned (~11.7%) this quarter. But the metric blends "Active" parcels (visited every period) with "Request Only" parcels (visited only on request), which understates true completion. The dashboard already has the Active/Request split to build on.

The team should focus on what GIS/analyst work controls: validate the assignment universe, exclude sold/non-URA parcels (the county ownership data already exists in `analysis.assessment_snapshot`), correct and expose the completion metric, and only then pilot model-assisted bundling.

## Repository Structure

- `raw_notes/20260605-oscar-brief.md` — original rough brief (kept intact).
- `docs/meeting-notes/2026-06-05-land-care-assurance.md` — cleaned notes, separating confirmed / rough-note / assumption / next action.
- `docs/project-scope.md` — scope centered on confirmed-feasible GIS/analyst work.
- `docs/modular-work-plan.md` — modules referencing the actual scripts, tables, dashboard pages, and metrics.
- `docs/north-star-vision.md` — forward-looking vision: from "completion %" to a parcel-state assurance system.
- `docs/concept-prioritization-model.md` — completion-propensity prioritization concept (assign by likelihood-to-complete; suggest what's next).
- `plan/Kickoff-rizaldy-assignment.md` — 2-week intern kickoff plan.

## Source Links

- SharePoint documentation: https://ura2.sharepoint.com/:w:/s/AssetManagement/IQDAO9ROALeoTZmlS8Ww-J3hAalqn2rd_-tPHczfSouUTXU?e=Ui0E32
- Power BI dashboard: https://app.powerbi.com/links/2pxzsYoxHs?ctid=c77df146-c538-49e4-9577-c9ee1d243d16&pbi_source=linkShare
- Script repository (private): https://github.com/URA-GIS-User/URA-Data-Repository
- LandCare data on the G drive: `G:\Public\LandCare\Y10-11 2025-2027 wPLB` (UNC `\\ura-fs\share\Public\LandCare\...`)

## Key Artifacts Inspected

- **SharePoint** "Land Care Dashboard Documentation" (11 pages; dashboard section marked unfinished) — documents the pipeline, the Task Scheduler jobs, the manual steps, and the NetSuite/Regrid dependencies.
- **GitHub** `URA-Data-Repository` — Python ETL/export scripts (`bundle_assignment_creation.py`, `BundlesDriveToSQL.py`, `SurveysDriveToSQL.py`, `ContractsDriveToSQL.py`, `countyownership_vm.py`, `city_*_etl.py`). README is a generic Git how-to.
- **Power BI** "LandCare 2026 Power BI File" (data updated 6/5/26) — 7 pages; current-quarter numbers and per-org completion.

## Next Step

Reproduce the assignment universe from `gis.epp_snapshot`, reconcile it to the dashboard's 1,214, and split completion into Active-only vs Request-Only. That establishes a trustworthy baseline before any ownership-exclusion, dashboard, or model work. Repo changes are inspection-only until separately approved.
