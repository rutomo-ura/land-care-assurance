# Concept — Completion-Propensity Prioritization

> Rizaldy's ground-up idea, polished. A simple, interpretable addition that prioritizes which parcels to assign for survey based on parcels that were recently surveyed successfully — and recommends what to assign next. Decision support, human-approved; not an automated exclusion rule.

## The idea in one line
Score each candidate parcel by how likely it is to actually get surveyed if assigned this period, learned from recently completed surveys, then rank and suggest the next assignment batch.

## Why it makes sense
- Attacks the real problem (low completion) with the lever GIS controls: *which* parcels get assigned, in *what order*.
- Uses data that already exists — `gis.regrid_survey_submissions` (outcomes) and `gis.epp_snapshot` (parcel attributes) — no new collection.
- Interpretable and small enough to ship a baseline as an intern, then grow.

## Define the label first
A parcel-period is **"successfully surveyed"** = a survey was returned (ideally photo-verified) within the expected window for that period. Train on the most recent N periods so the signal reflects current contractors and routes.

## Features (start interpretable)
- **Recency** — periods since this parcel's last successful survey.
- **Spatial proximity** — distance to / density of parcels completed recently (completed parcels cluster along routes; this is the geospatial core).
- **Contractor reliability** — the assigned org's recent completion rate.
- **Maintenance level** — Active vs Request Only.
- **Parcel attributes** — square footage, inventory type, property class.
- **Seasonality** — month/quarter effects.

## Model path (earn the complexity)
1. **Transparent weighted score** (recency + proximity-to-completed + contractor reliability) — ship this first.
2. **Logistic regression** — first real model; coefficients are explainable to non-technical stakeholders.
3. Only escalate to trees/boosting if backtests prove it earns its opacity.

## The guardrail (do not skip)
Propensity must **reorder and flag**, never silently exclude. Active parcels are obligations. Output two things together:
- *High propensity* → assign now (quick wins, efficient routes).
- *Low propensity but mandatory* → escalate the reason (access blocked? too far from any route? contractor over capacity?) for a human decision.

Without this, the model creates a feedback loop where easy parcels keep getting done and neglected parcels disappear from the data. The flagged low-propensity tail is itself a valuable finding for Oscar's "user journey vs. compliance" question.

## "Suggest what's next"
Rank unsurveyed/overdue candidates by `propensity × obligation` and emit a recommended next-assignment list per contractor. A human approves before it feeds `bundle_assignment_creation.py`. This is the natural extension of the existing Parcel Details page (which already shows each parcel's survey timeline).

## How to prove it works
Backtest on held-out recent periods: does prioritizing high-propensity parcels raise *realized* completion vs. the current undifferentiated assignment? Report **lift**, and explicitly track the **neglected tail** — are mandatory low-propensity parcels still being served? A model that improves the headline while abandoning hard parcels has failed.

## Where it sits
This is Module 5 of the work plan and Bet 2 of the north-star vision, scaled down to a shippable baseline. It comes *after* the assignment universe is validated and the Active-only completion metric is trusted — otherwise the model learns from a dirty label.
