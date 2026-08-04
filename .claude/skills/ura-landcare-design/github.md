repo: ura-gis/land-care-assurance
branch: master
path: docs/

## Last sync
date: 2026-08-04T14:50:47Z

### Updated in this project
- Imported URA brand mark, LandCare icon set, and Executive BI/app.css tokens (colors, radii, shadows, Manrope type)
- Built Button, Tabs, MetricCard, StatusPill, DataTable, FieldSelect/FieldInput, Legend components matching docs/landcare/app.css exactly
- Built Map Monitor, KPI Dashboard, and Contractor Portal screen templates from docs/monitoring, docs/kpi, docs/contractor

## Screen map
| Design system artifact | Repo source |
|---|---|
| tokens/colors.css, tokens/spacing.css | docs/landcare/app.css `:root` |
| tokens/typography.css | docs/landcare/app.css (Manrope import + type scale) |
| assets/logo.png, assets/icons/* | docs/landcare/assets/ |
| components/buttons/Button | .page-tabs, .export-button, .clear-all-filters, .segmented, .text-button (app.css) |
| components/navigation/Tabs | .report-tabs, .page-tabs (contractor), .bi-tabs |
| components/cards/MetricCard | .insight-card, .reference-card, .bi-metric (app.css + executive-bi.css) |
| components/feedback/StatusPill | .contractor-status-pill, .metric-status-chip |
| components/data/DataTable | .data-table, .bi-table |
| components/forms/FieldSelect | .field-label select/input |
| components/navigation/Legend | .legend-list, .legend-item, .status-summary-list |
| templates/map-monitor | docs/monitoring/index.html |
| templates/kpi-dashboard | docs/kpi/index.html |
| templates/contractor-portal | docs/contractor/index.html |
