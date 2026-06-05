# Meeting Notes: Land Care Assurance

Date: June 5, 2026
Source: `20260605-oscar-brief.md` (rough note), reconciled against the live artifacts.

This version separates four kinds of statement:

- **[CONFIRMED]** — verified by directly inspecting the SharePoint doc, the GitHub repo, or the Power BI report.
- **[ROUGH NOTE]** — asserted in Oscar's rough brief, not independently confirmed here.
- **[ASSUMPTION]** — still needs validation before we rely on it.
- **[NEXT]** — recommended next action.

## Artifacts Inspected

- SharePoint: "Land Care Dashboard Documentation" (11 pages; its dashboard section is explicitly marked "THIS SECTION IS UNFINISHED").
- GitHub: `URA-GIS-User/URA-Data-Repository` (private; description: "Shared data repository for Urban Redevelopment Authority of Pittsburgh"). README is a generic Git how-to, not project docs. Real content is the Python scripts.
- Power BI: "LandCare 2026 Power BI File" (data updated 6/5/26).

## What the System Actually Is (Confirmed)

- **[CONFIRMED]** The pipeline is: Regrid + NetSuite + county/city data → CSVs on the G drive (`\\ura-fs\share\Public\LandCare\...`) → PostgreSQL (`gis` and `analysis` schemas on a VM) → Power BI semantic model refreshed daily.
- **[CONFIRMED]** Monthly cadence is driven by the VM's Windows Task Scheduler:
  - 15th, 3:00am — `bundle_assignment_creation.py` (creates the period's assignment CSV).
  - 15th, 3:15am — `BundlesDriveToSQL.py` (upserts assignments to DB).
  - 15th, 3:30am — `regrid_survey_download.py` (downloads Regrid survey responses).
  - 18th, 3:45am — `SurveysDriveToSQL.py` (upserts survey responses, after a 3-day correction window).
- **[CONFIRMED]** Manual / not automated: `ContractsDriveToSQL.py` (budget & contracts from an Excel file), NetSuite saved-report setup, and — critically — the Regrid export URL, which changes every period and must be edited by hand. The Regrid download also runs under Oscar Medina's personal Regrid login (flagged in the doc to be moved to a `.env`).

This reconciles the rough note's "steps 1–14 automated, 15 forward not": there is no literal 14-step list in the doc. The real boundary is that the **core data movement (bundle create/upsert, survey download/upsert) is automated**, while **budget/contracts, NetSuite, and the per-period Regrid URL change are manual**.

## "Bundle Assignment Creation" Is Not Bundling (Confirmed)

- **[CONFIRMED]** `bundle_assignment_creation.py` is a tag-filtered SQL → CSV export. It selects from `gis.epp_snapshot` where `tags` contains `LandCare - Active` or `LandCare - Request Only`, formats the parcel number into Regrid format, and writes one row per parcel. "Assigned to" is just the existing `property_maint_mgr_name` already on the record. There is **no algorithmic batching, balancing, or surveyor optimization** of any kind.
- **[CONFIRMED]** The only row it drops is a parcel whose number is not 16 digits. There is **no sold-parcel or ownership check** in the export.
- **[ASSUMPTION]** The script that builds `gis.epp_snapshot` and assigns the `LandCare - Active/Request Only` tags is **not in this repo**, so where the tags and the maintenance-manager come from is still unconfirmed (likely the EPP property system / NetSuite side).

## The ~10% Number (Confirmed, With a Caveat)

- **[CONFIRMED]** Power BI Landing Page (current quarter): **1,214 distinct parcels assigned, 142 surveys returned ≈ 11.7%.** This substantiates the rough note's "about 10%."
- **[CONFIRMED]** It varies by organization. The landing-page bar chart shows returns as a small fraction of assignments for all nine land care organizations (KRJ Enterprises, Hilltop Rising, Chatman Properties, Ervin Home Beautification, Amani Christian CDC, FHCV Contracting, Center That CARES, Operation Better Block, One Call Handles It All), with the gap differing per org.
- **[CONFIRMED]** The metric already distinguishes **Active** (visited every period) from **Request Only** (visited only if the owner asks) parcels, and the "Survey Submission Rate" page already splits returns into True (Active) / True (Request) / False and plots Expected vs Returned over time.
- **[ASSUMPTION → key]** Because **Request Only** parcels are not expected to be surveyed every period, including them in a single blended denominator structurally **understates** completion. The headline 11.7% likely mixes the two. The Active-only rate is the number that actually measures field compliance.

## Ownership / Sold-Parcel Risk (Confirmed Data Exists)

- **[CONFIRMED]** County ownership/assessment data is loaded by `countyownership_vm.py` into `analysis.assessment_snapshot` (Pittsburgh municodes 101–132 plus 877). City-owned property data is loaded by `city_epp_properties_etl.py` into `analysis.city_epp_properties`. So the reference data needed to flag a parcel that is no longer URA/PLB-owned **exists in the database today** — it is simply not joined into the assignment export.
- **[ASSUMPTION]** On the Landing Page, 1,120 URA-owned + 28 PLB-owned = 1,148 vs 1,214 assigned — a 66-parcel gap. This may just be different visual filters, but it is consistent with assigned parcels whose ownership is blank or no longer URA/PLB. Worth checking directly.

## Problem Framing (From the Brief)

- **[ROUGH NOTE]** Oscar's core question: why is the Regrid survey completion rate low — user-journey friction, field-worker non-compliance, or assignment quality? It costs money. He also asked whether there is an alternative to Regrid.
- **[CONFIRMED]** The Regrid dependency is deep and fragile (manual per-period export URL, a shared personal login, browser-emulated download). A replacement is a large lift and is mostly outside GIS/analyst control.

## Direction From Rizaldy

Focus on what GIS and analyst work can actually control:

1. **[CONFIRMED feasible]** Add a sold/transferred-parcel exclusion to assignment creation by joining `gis.epp_snapshot` against `analysis.assessment_snapshot` before the CSV is written.
2. **[CONFIRMED feasible]** Fix the completion metric: report Active-only completion separately from Request-Only, validate the assignment universe (`tags LIKE LandCare%`), and surface both clearly on the dashboard.
3. **[ROUGH NOTE / later phase]** Build a monthly model that scores/assigns bundles by how survey-completable they are, learned from previously completed parcels. This is genuinely new capability (the current export does no bundling), so it belongs after the metric and data-integrity work.

## Doc vs. Reality Discrepancies (Confirmed)

- The SharePoint doc describes **6** dashboard pages; the live report has **7** (extra: "Maintenance Expenses"). The doc's dashboard section is marked unfinished.
- The doc says **8** land care companies; the report shows **9** organizations.
- The doc's $750,000 budget limit reflects 2025; the 2026 report shows a $775,000 projected yearly limit.

## Clean Summary

The project is scopeable into a practical assurance effort with the data that already exists: (1) validate the assignment universe and exclude sold/non-URA parcels, (2) correct and expose the completion metric by separating Active from Request-Only, then (3) pilot model-assisted bundling. Contractor behavior and Regrid platform limits should be measured and escalated, not treated as the first thing GIS tries to fix.
