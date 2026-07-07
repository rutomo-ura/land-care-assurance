# Icon Pending — LandCare Dashboard

Generated icons should replace the circular placeholder slots in the KPI dashboard. Drop finished assets in `docs/landcare/assets/icons/` and wire them in `app.css` via `.card-icon-slot[data-icon="…"]`.

## Style Guide

- **Format:** SVG preferred (PNG @2x fallback OK)
- **Size:** 22×22 px artwork inside a 40×40 px circular slot
- **Style:** Minimal line icons, 2 px stroke, rounded caps/joins
- **Palette:** `#006c9f` (URA blue-dark) on light slots; `#ffffff` on featured blue cards
- **Tone:** Clean civic/professional — not playful, not Material Design heavy

## Icons Needed

### KPI insight cards (landing page)

| ID | Filename | Description | Used on |
|----|----------|-------------|---------|
| `completion` | `icon-completion.svg` | Circular progress or checklist with checkmark — survey completion | Featured completion card (white icon variant needed) |
| `open-active` | `icon-open-active.svg` | Clipboard or inbox with alert dot — parcels awaiting survey | Open Active card (orange-tinted slot) |
| `budget` | `icon-budget.svg` | Dollar sign or invoice document — annual run rate | Budget Run Rate card |

### Optional — snapshot strip & tabs

| ID | Filename | Description | Used on |
|----|----------|-------------|---------|
| `inventory` | `icon-inventory.svg` | Grid/map pin — total parcel inventory | Snapshot · Inventory card |
| `active` | `icon-active.svg` | Leaf or maintenance badge — active maintenance parcels | Snapshot · Active card |
| `returned` | `icon-returned.svg` | Inbound arrow or survey form — returned surveys | Snapshot · Returned card |
| `trend` | `icon-trend.svg` | Line chart sparkline | Completion Trend panel header |
| `contractor` | `icon-contractor.svg` | Hard hat or team — contractor queue panel | Contractor Queue panel header |

### Map monitor sidebar (optional, same style)

| ID | Filename | Description |
|----|----------|-------------|
| `assigned` | `icon-assigned.svg` | Outbound assignment |
| `map-pin` | `icon-map-pin.svg` | Parcel location |

## Wiring (after generation)

Example CSS once icons exist:

```css
.card-icon-slot[data-icon="completion"] {
  background-image: url("./assets/icons/icon-completion.svg");
}
.card-icon-slot[data-icon="completion"].on-featured {
  background-image: url("./assets/icons/icon-completion-white.svg");
}
```

Add class `has-icon` to the slot element (or set via JS) to hide the text fallback (`%`, `!`, `$`).

## Current placeholders

Until icons ship, slots show a single character via `data-icon-label` in `docs/kpi/index.html`.
