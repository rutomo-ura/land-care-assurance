# Executive BI Design System Agent Brief

Use this brief when building a new webapp that should look and behave like the
LandCare KPI surface.

## Start here

1. Copy `executive-bi.css` and `example.html` into the new app.
2. Wrap the page in `<main class="bi-dashboard">`.
3. Keep the documented page order: masthead, tabs, context/filter row, section
   intro, metric band, primary workspace, and operational ledger.
4. Override the `--bi-*` tokens at the `.bi-dashboard` level; do not edit each
   component to change branding.
5. Replace example values with source-backed metrics and show the timeframe,
   denominator, and data freshness beside every important number.

## Component inventory

- `.bi-masthead`: product title, kicker, and context sentence
- `.bi-tabs`: real accessible tab buttons with `aria-selected`
- `.bi-context`: period, filters, freshness, and source status
- `.bi-section-intro`: decision question and short explanation
- `.bi-metric-band` / `.bi-metric`: featured and supporting KPIs
- `.bi-workspace`: one dominant chart/map/table analysis area
- `.bi-ledger`: detailed operational rows with semantic table markup

## Semantic visual rules

- Blue: primary analysis and active controls.
- Deep navy: authoritative detail and headings.
- Orange: action, risk, or follow-up.
- Green: target, complete, or stable performance.
- Never use color alone; pair status color with text.
- Prefer borders, alignment, and whitespace over decorative icon cards or
  gradients.

## Copy-paste build prompt

> Build this page with the LandCare Executive BI design system. Start with the
> manager's decision, then use the required anatomy: masthead, context/filter
> row, section intro, metric band, one primary analysis workspace, and an
> operational ledger. Use the scoped tokens and classes from
> `executive-bi.css`. Keep source, timeframe, denominator, and freshness
> visible. Preserve semantic status labels, keyboard access, contrast, mobile
> stacking, and explicit loading/empty/error states. Avoid generic equal-weight
> card grids and decorative graphics.

## Acceptance checklist

- Normal text contrast is at least 4.5:1.
- Tabs and actions are keyboard reachable and use real buttons/links.
- Tables retain `table`, `th`, and `td` semantics.
- Status remains understandable without color vision.
- Layout stacks cleanly at 760px and below.
- Loading, empty, error, and stale-data states are explicit.
- The example page works without a framework or build step.
