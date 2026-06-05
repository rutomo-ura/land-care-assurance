# North Star — From "Survey Completion %" to a Parcel-State Assurance System

> Forward-looking vision, not committed scope. The 2-week plan and modular work plan stay the near-term contract; this is the trajectory they ladder up to. Written to be ambitious but buildable on the stack that already exists (PostgreSQL/PostGIS, pgRouting, ArcGIS Pro, Power BI).

## Reframe the problem
"Survey completion is ~11.7%" is a symptom, not the problem. The real asset the URA needs is a **trustworthy, spatially-aware record of every vacant parcel's lifecycle**: owned → in the maintenance universe → assigned → visited → surveyed → photo-verified. Today only the two ends of that chain are measured, the universe is a tag-filtered export with no ownership check, and "completion" blends parcels that were never expected to be visited. Fix the system of record and the metric fixes itself.

## The north star (one system)
A single, versioned **parcel golden record** that is continuously reconciled against authoritative county ownership, feeds a **feasibility-aware assignment engine**, and is observed end-to-end with data-quality SLAs. The dashboard stops being a report card and becomes the operational control tower for ~$775k/yr of land-care spend.

## Three bets

**1. Parcel golden record (truth before models).**
Join `gis.epp_snapshot` + `analysis.assessment_snapshot` + `city_epp_properties` + delinquent/condemnation into one record with a normalized parcel key (the 16-digit ↔ Regrid-format mismatch is the silent join-killer). Add data contracts and tests so a sold parcel **auto-exits** the universe and a stale tag can't quietly inflate the denominator. This alone retires the sold-parcel risk and the 1,214-vs-1,148 gap.

**2. Feasibility-aware bundling (the geospatial differentiator).**
Reframe Rizaldy's model idea spatially: cluster parcels into **geographically compact, drive-time-balanced routes** (pgRouting / OSRM on the road network), balanced to each contractor's capacity, and score each bundle's completion probability from history in `gis.regrid_survey_submissions`. This is also the cleanest way to answer Oscar's diagnostic question: if compact, low-burden routes still aren't completed, it's **compliance**; if completion tracks route burden, it's **feasibility**. Same model, decisive answer.

**3. Funnel instrumentation + observability.**
Measure leakage at every stage (assigned → visited → surveyed → photo-verified), not just "returned." Add freshness SLAs, row-count anomaly alerts, and ownership-drift alerts per source. You can't improve a funnel you can't see.

## The "wow" deliverable
Ship a **map**, not a number. A spatial view of assigned vs. completed parcels by contractor territory turns "11.7%" into a story leadership can see — clusters of neglect, overlapping territories, parcels surveyed that the URA no longer owns. One good ArcGIS/PostGIS map moves a room faster than a table.

## Tie everything to money
Every recommendation carries a dollar: don't pay to survey parcels you don't own (exclusion), don't pay for inefficient routes (bundling), don't over/under-pay against the per-company check-request limits already on the dashboard. Assurance framed as spend integrity, not analytics for its own sake.

## Optionality on Regrid
Don't migrate — **abstract**. Define a survey-ingestion contract (parcel, period, status, photo, geotag) so the fragile Regrid path (manual per-period URL, shared personal login) becomes one swappable adapter. That answers "is there an alternative to Regrid?" with leverage instead of a risky rip-and-replace.

## What makes this all-star
Deliver the boring, trustworthy baseline first (reproduce the universe, split Active-only completion, flag sold parcels) — then frame each small win against this north star so leadership sees the arc. Trust earned in week two; vision visible from day one.
