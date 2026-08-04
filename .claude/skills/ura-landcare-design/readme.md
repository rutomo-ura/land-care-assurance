# URA LandCare Design System

Design system for the **Urban Redevelopment Authority of Pittsburgh (URA)**, extracted from the **LandCare Assurance** operations product — a map-first application where contractors submit field evidence for vacant-parcel maintenance, URA staff review it, and supervisors monitor completion, budget, and contractor exposure across the portfolio.

## Sources

Built from the public repo **[ura-gis/land-care-assurance](https://github.com/ura-gis/land-care-assurance)** (branch `master`), specifically:
- `docs/landcare/app.css` — the live application's full token set and component CSS (Map Monitor, KPI Dashboard, Contractor Portal)
- `docs/design-system/` — a documented, portable "Executive BI" dashboard kit (`executive-bi.css`, `example.html`, `agent-brief.md`) with its own scoped `--bi-*` tokens (same palette, different naming) for use in decision-first BI surfaces outside LandCare itself
- `docs/monitoring/index.html`, `docs/kpi/index.html`, `docs/contractor/index.html` — the three product screens recreated as templates here
- `docs/landcare/assets/` — the URA logo and custom icon set

Explore the source repo directly for deeper detail (live JS behavior, ArcGIS map integration, Survey123 form wiring) — this design system captures visual language and static structure, not the underlying map/data logic.

## Index

- `styles.css` — root stylesheet, imports everything below
- `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/base.css` — design tokens
- `assets/logo.png`, `assets/icons/*.svg` — brand mark and icon set
- `guidelines/` — 10 foundation specimen cards (Colors, Type, Spacing, Brand) shown in the Design System tab
- `components/` — reusable primitives, grouped by concern:
  - `buttons/Button` — solid, pill, segmented, text variants
  - `navigation/Tabs` — pill report tabs, underline workspace tabs
  - `navigation/Legend` — map-key swatch list
  - `cards/MetricCard` — featured + toned KPI cards
  - `feedback/StatusPill` — status labels
  - `data/DataTable` — sticky-header ledger table
  - `forms/FieldSelect` — labeled pill select and search input
- `templates/` — full-screen recreations: `map-monitor`, `kpi-dashboard`, `contractor-portal`

## Content fundamentals

- **Voice:** operational and procedural, never marketing-toned. Copy states facts and next actions plainly: "Choose your organization to begin," "Select your assignment month and organization once."
- **Address:** second person for instructions to the user ("Select your assignment month..."), third person/passive for system state ("Completion evidence is displayed at the assignment polygon").
- **Precision over vibe:** every number is qualified with its scope, period, or calculation basis — "Selected quarter," "NetSuite feed required," "Cumulative completed survey records divided by active assignments." Never a bare number without a denominator or timeframe nearby.
- **Casing:** sentence case throughout (titles, buttons, labels) — no title case, no ALL CAPS body copy. Kickers and eyebrows ARE uppercase but tiny (10–11px) and always paired with a normal-case heading beneath.
- **No emoji, no exclamation points, no filler adjectives.** "Track progress and submit completed service," not "Easily track your progress!"
- **Explicit about gaps:** unavailable data says so directly — "Actuals remain explicitly unavailable until NetSuite is connected" — rather than a vague empty state.
- **Acronyms spelled out on first use** in body copy (URA, PLB, PIN) but used freely in labels once established.

## Visual foundations

- **Color:** one brand blue family (`--ura-blue` #0098d3 bright, `--ura-blue-dark` #006c9f mid, `--ura-deep` #00334f near-navy) carries almost everything — headers, active states, links, featured KPI gradients. Orange (`--orange` #c2410c) means risk/action-needed exclusively. Green (`--green` #2e7d32) means success/target/complete exclusively. Gold (`--gold` #f0c24b) is a rare tertiary accent. Never more than these four hues plus ink/muted/line neutrals on a page.
- **Type:** Manrope only, weights 400–800, no serif or mono anywhere in the UI. Headings are heavy (780–800) with tight negative letter-spacing (−0.025em to −0.04em); body copy is 550–650 weight, never bold body text. Small uppercase "kicker" labels (10–11px, 800–850 weight, 0.05–0.12em tracking) precede every heading.
- **Spacing:** 4px base unit; card interiors sit at 16–24px padding; section gaps run 14–18px. Generous whitespace inside cards, tight gaps between cards in a band.
- **Backgrounds:** flat color only — no photography, no illustration, no texture/grain, no gradients except the one deliberate "featured metric" gradient (`--ura-deep` → `--ura-blue`, 135deg) used sparingly for exactly one dominant card per band and for the contractor-portal hero banner. No full-bleed imagery anywhere.
- **Animation:** minimal. Only short (.15s ease) color/background transitions on hover — no bounce, no fade-in, no motion on load. This is a dense operational dashboard, not a marketing site.
- **Hover states:** buttons and pills invert to filled (background becomes the brand color, text goes white) or the row background lightens to a pale blue tint (#eef8fb / #f2f9fc). Table rows highlight on hover the same way.
- **Press/active states:** selected pill/segmented buttons stay permanently filled (not just on `:active`) — active state is persistent selection, not momentary press feedback.
- **Borders:** hairline 1px `--line` (#e2eaef) borders define almost every card and table; no double borders, no colored borders except semantic top-accent (4px orange/blue/green on KPI cards) and the 2px brand-blue borders on segmented/pill buttons.
- **Shadows:** two shadow tokens only — an almost-invisible resting shadow (`--shadow`, 1px blur) and a slightly deeper hover/panel shadow (`--shadow-hover`/`--shadow-panel`, ~8-24px blur, always the same navy-tinted rgba(0,47,76,…)). No colored shadows, no hard drop shadows.
- **Transparency/blur:** used sparingly and only functionally — semi-transparent white map overlays (rgba(255,255,255,.94–.97)) for legends/badges floating over the map, never for decorative glassmorphism.
- **Corner radii:** 12px (small controls), 18px (cards), 22px (large panels/heroes), and full pill (999px) for nav tabs, filter toggles, and form inputs. No sharp 0px corners on interactive surfaces.
- **Cards:** white paper on a light gray-blue canvas (#f0f4f7), 1px hairline border, 18–22px radius, resting shadow only (no border-left accent stripe except the "workspace"/"ledger" panels which use a 4px flat-color left rule, and KPI insight cards which use a 3–4px flat-color *top* rule instead — never both).
- **Imagery:** none in the UI itself — this is a data-operations product, not a content site. If photography appears (field evidence photos), it's real user-submitted 4:3 photos, object-fit: cover, 8px radius — never brand-styled.
- **Layout:** fixed 68px header, ArcGIS-map-centric three-column layout on Map Monitor (sidebar / map / detail panel), tab-based single-column on KPI Dashboard. Sidebars and panels scroll independently; header and masthead stay fixed.

## Iconography

- **No icon font, no third-party icon library.** LandCare uses a small custom set of hand-built line SVGs (`assets/icons/`): completion, active, open-active, returned, contractor, budget, inventory, trend — each a single-color line glyph matching the brand blue/ink palette, sized ~20–28px.
- Icons are used sparingly as small inline glyphs next to KPI labels, never as decorative page filler.
- Colored dot/swatch "icons" (plain CSS circles or rounded squares) are the far more common iconographic device — used constantly in legends, status summaries, and map keys to encode categorical color, always paired with a text label per the accessibility rule (never color alone).
- No emoji, no unicode symbol icons anywhere in the product.

## Logo

`assets/logo.png` is the real URA mark, copied from the source repo (`docs/landcare/assets/ura-logo.png`). It always sits on a white 50×50px rounded lockup square, even on the blue header bar.

## Fonts

Manrope is loaded via Google Fonts (`@import` in `tokens/typography.css`), exactly as the source app does. No local font files were needed — Manrope is already on Google Fonts and matches the source repo's own font choice exactly (no substitution).

## Intentional additions

- `FieldSelect`/`FieldInput` — the source repo styles selects/inputs inline per-page rather than as a named component; extracted here as one reusable pair since the pattern (uppercase label + pill control) repeats identically across Map Monitor, KPI Dashboard, and Contractor Portal.
- `Legend` — likewise generalized from `.legend-list`/`.status-summary-list`/`.contractor-map-key`, which are near-identical swatch-list patterns repeated three times in the source CSS.
