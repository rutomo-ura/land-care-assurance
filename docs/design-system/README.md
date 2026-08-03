# Executive BI Dashboard Design System

This kit captures the reusable visual language used by the LandCare KPI dashboard. It is intentionally framework-free: copy the CSS into any web project, wrap the dashboard in `.bi-dashboard`, and use the documented component patterns.

## Files

- `executive-bi.css` — portable tokens and component styles, scoped to `.bi-dashboard`.
- `example.html` — a standalone reference page showing the core composition.
- `agent-brief.md` — component inventory, build prompt, semantic color rules, and acceptance checklist.

## Design principles

1. **Decision first.** Lead with the operating question, then show metrics, analysis, and detail.
2. **One dominant signal.** In each KPI band, use one featured metric; keep supporting metrics visually quieter.
3. **Editorial hierarchy.** Every section starts with a short domain kicker, a decision-oriented title, and one sentence of context.
4. **Dense but calm.** Prefer borders, alignment, and whitespace over isolated floating cards and decorative icons.
5. **Explain the number.** Every KPI includes a short qualifier such as period, denominator, or operational meaning.
6. **Tables are ledgers.** Use sticky headers, restrained zebra rows, and hover feedback for scanning.
7. **Color has meaning.** Blue indicates primary analysis, deep navy indicates authoritative detail, orange indicates action or risk, and green indicates target or stable performance.

## Page anatomy

```html
<main class="bi-dashboard">
  <header class="bi-masthead">...</header>
  <nav class="bi-tabs">...</nav>
  <section class="bi-context">...</section>
  <header class="bi-section-intro">...</header>
  <section class="bi-metric-band">...</section>
  <article class="bi-workspace">...</article>
  <article class="bi-ledger">...</article>
</main>
```

Recommended information order:

1. Product or portfolio masthead
2. Primary report navigation
3. Period, filters, freshness, and data status
4. Section-level business question
5. Three to five decision metrics
6. One primary analytical visual
7. Detailed table or source note

## Reuse in another project

1. Copy `executive-bi.css` to the target project.
2. Add the `bi-dashboard` class to the dashboard root so styles remain isolated.
3. Copy the relevant markup from `example.html`.
4. Override the brand tokens at the top of the CSS rather than editing individual components.
5. Replace example values and labels with source-backed metrics.

The core stylesheet has no required font import. Consumers may load Manrope (as
the example page does) or use the built-in system-font fallback by setting
`--bi-font-sans`.

```css
.bi-dashboard {
  --bi-primary: #006c9f;
  --bi-deep: #00334f;
  --bi-accent: #0098d3;
  --bi-risk: #c2410c;
  --bi-success: #2e7d32;
}
```

## Content rules

- Kicker: 1–3 words describing the business domain.
- Heading: state the decision area, not the chart type.
- Context sentence: under 18 words when possible.
- KPI label: noun phrase; avoid unexplained acronyms.
- KPI qualifier: define timeframe, scope, or calculation basis.
- Chart title: describe the comparison; subtitle explains population or ranking.

## Accessibility and responsiveness

- Maintain at least 4.5:1 contrast for normal text.
- Use real buttons for tabs and preserve `aria-selected`.
- Do not rely on color alone for status; pair it with a label.
- Tables should retain semantic `table`, `th`, and `td` elements.
- At 760px and below, stack the editorial intro and KPI band vertically.
