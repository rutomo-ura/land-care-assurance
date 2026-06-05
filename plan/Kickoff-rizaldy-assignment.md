# LandCare Assurance — 2-Week Kickoff Plan

**Owner:** Rizaldy (GIS/Analyst intern) · **Scope:** GIS/analyst-controllable work only · Repo is inspection-only until changes are approved.

## Vision (one paragraph)
This is bigger than a completion percentage. The end state is a **parcel-state assurance system**: one trustworthy record per parcel (owned → assigned → surveyed → verified), reconciled continuously against county ownership, feeding feasibility-aware route bundling and an end-to-end funnel the dashboard can show as a map — with a dollar tied to each recommendation against the ~$775k/yr budget. The two weeks below earn trust on the baseline; every win ladders up to that north star. (Full write-up: `docs/north-star-vision.md`; the prioritization concept: `docs/concept-prioritization-model.md`.)

## Goal
Prove the *real* survey-completion number and show how much of the assignment universe is invalid — before any dashboard or model work. The current "~10%" is real (1,214 assigned / 142 returned this quarter) but blends Active parcels (visited every period) with Request-Only parcels (visited only on request), which understates true completion.

## Week 1 — Baseline truth
- Reproduce the assignment universe from `gis.epp_snapshot` (the `bundle_assignment_creation.py` query: `tags LIKE 'LandCare - Active' / 'Request Only'`); reconcile to the dashboard's 1,214.
- Reproduce 142 / 1,214 from `gis.regrid_survey_submissions`, then **split completion into Active-only vs Request-Only** and by organization.
- Document metric definitions (numerator, denominator, Active/Request, "returned"). → 1-page note.

## Week 2 — Data integrity + visibility
- Prototype an ownership join (`gis.epp_snapshot` × `analysis.assessment_snapshot` / `city_epp_properties`) to flag parcels no longer URA/PLB-owned; count how many of the 1,214 are at risk (explains the 1,214-vs-1,148 gap). Validate parcel-key alignment first.
- Deliver: (1) short findings memo — blended vs Active-only completion + N possibly-sold parcels; (2) Power BI backlog — Active-only measure, exclusion count, assigned-vs-owned reconciliation, data freshness.

## Out of scope (measure/escalate, don't build first)
Editing the repo, the Regrid export-URL / shared-login issue, Regrid replacement, and the bundle-scoring model (new capability — sequence it after the metric and integrity work).

## Gating dependency
Need read access to the Postgres VM (`gis` / `analysis` schemas). Without it, Week 1 runs off the G-drive CSVs and the dashboard instead of SQL.
