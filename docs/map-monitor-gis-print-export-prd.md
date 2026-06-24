# Map Monitor GIS Print Export PRD

## Brief

Add an `Export PDF` button to the LandCare Map Monitor that generates a print-ready GIS map sheet for the selected survey view. The output should feel like a professional ArcGIS-style A3 landscape print: title, map, selected contractor context, auto-zoomed contractor area, summary stats, north arrow, scale, legend, and export metadata.

This feature is for leadership reviews, contractor follow-up, field planning, and meeting packets where a static map is easier to share than the interactive dashboard.

## User Story

As a URA LandCare program user, I want to select a contractor and export a clean GIS-style PDF map of their survey status so I can review the contractor's monthly work area, open parcels, returned surveys, and location pattern without manually screenshotting the web map.

## Scope

### In Scope

- Add an `Export PDF` control to the map monitor.
- Export the currently selected survey month.
- If a contractor is selected, automatically zoom the print map to the contractor's dominant work area.
- If no contractor is selected, export the full current filtered survey view.
- Produce an A3 landscape PDF layout.
- Include title, map, contractor/month context, status stats, legend, north arrow, scale bar, and generated date.
- Preserve the current map status colors:
  - Survey complete
  - Open active assignment
  - Request only
- Include council district boundaries as light contextual lines, not dominant borders.
- Export should work from the browser without requiring Codex.

### Out of Scope For V1

- Batch export for all contractors.
- Contractor-branded report covers.
- Editable PDF annotations.
- Printing directly through ArcGIS Online print services unless needed for reliability.
- Offline export without web access.
- Parcel-level tabular appendix.

## Primary Workflow

1. User opens `/monitoring/`.
2. User selects a survey month.
3. User optionally selects a contractor.
4. Map auto-zooms to the selected contractor's largest parcel cluster.
5. User clicks `Export PDF`.
6. App opens a print preview or directly downloads a PDF.
7. PDF includes map, legend, stats, and context for that contractor/month.

## Export Button Behavior

- Button label: `Export PDF`
- Recommended location: top of right action panel or top-right of map stage, visually separate from ArcGIS map controls.
- Disabled/loading state while map export is being generated.
- Loading label: `Preparing PDF...`
- Error state: `PDF export failed. Try again after the map finishes loading.`

## PDF Layout

Target page:

- Size: A3
- Orientation: Landscape
- Approx dimensions: `420mm x 297mm`
- Margin: 12-15mm
- Visual style: URA dashboard typography and colors, but organized like a GIS print sheet.

Suggested layout:

```text
+--------------------------------------------------------------+
| URA LandCare Survey Map                                      |
| Survey Month: 2026-05 | Contractor: Hilltop Rising           |
+---------------------------------------------+----------------+
|                                             | Summary Stats   |
|                                             | - Assigned      |
|                                             | - Complete      |
|                  MAP                        | - Open Active   |
|                                             | - Request Only  |
|                                             | - Completion %  |
|                                             +----------------+
|                                             | Legend          |
|                                             | North Arrow     |
|                                             | Scale Bar       |
+---------------------------------------------+----------------+
| Generated: date/time | Source: LandCare Assurance Dashboard  |
+--------------------------------------------------------------+
```

## Required PDF Content

### Header

- Title: `URA LandCare Survey Map`
- Subtitle:
  - `Survey Month: {selectedMonth}`
  - `Contractor: {selectedContractor or All Contractors}`
  - `Council District: {selectedDistrict or All Districts}`

### Map

- Center and zoom:
  - Contractor selected: zoom to selected contractor's parcel extent or dominant cluster.
  - District selected: zoom to selected district and contractor intersection.
  - No contractor selected: zoom to current month/district extent.
- Layers:
  - Basemap
  - URA-owned LandCare parcels
  - Light council district boundaries
  - Optional neighborhood context if it does not clutter the print
- Parcel coloring:
  - Survey complete
  - Open active assignment
  - Request only

### Stats Panel

Show current export filter stats:

- Assigned parcels
- Active assigned parcels
- Surveys returned
- Open active parcels
- Request-only parcels
- Completion rate
- Number of neighborhoods represented

For contractor-selected exports, add:

- Contractor name
- Contractor rank by open active parcels, if available
- Action sentence:
  - Example: `Review 90 open active parcels before monthly close.`

### Legend

- Survey complete
- Open active assignment
- Request only
- Council district boundary
- Selected contractor parcels, if visual highlight is added

### Map Furniture

- North arrow
- Scale bar
- Generated date/time
- URA logo
- Dashboard URL or short source label

## Technical Options

### Preferred V1 Approach

Use browser-side export:

- Render a dedicated hidden/print route or modal layout.
- Capture map canvas/image after ArcGIS view finishes drawing.
- Use a PDF generator such as `jsPDF` or browser print-to-PDF.
- Use CSS `@page` rules for A3 landscape if using print mode.

Potential libraries:

- `jsPDF` for direct PDF generation.
- `html2canvas` only if ArcGIS map capture works reliably with CORS.
- ArcGIS Maps SDK screenshot API, if available, for map image capture.

### Alternative Approach

Use ArcGIS print service:

- Build a WebMap JSON payload with current layers, renderer, extent, title, legend, and layout options.
- Send to ArcGIS print service.
- Download returned PDF.

This may produce stronger GIS-native output, but requires more configuration and service availability.

## Data Requirements

The export should reuse the same data already powering the map monitor:

- Latest/monthly survey GeoJSON: `docs/landcare/data/all_months.geojson`
- Latest summary: `docs/landcare/data/latest_month_summary.json`
- Current selected filters from `docs/landcare/monitoring.js`
- ArcGIS current parcel layer only if needed for current inventory view later

The PDF must use the visible filtered map state, not a separate stale snapshot.

## UX Requirements

- Export must not change the user's interactive map state permanently.
- If the export temporarily zooms or renders a print map, restore the prior interactive map after export.
- User should know which contractor/month the PDF represents.
- PDF should be readable when printed and when viewed on screen.
- Text must not overlap map, legend, stats, or footer.

## Acceptance Criteria

- `Export PDF` button appears in the map monitor.
- With no contractor selected, export generates an A3 landscape PDF for the selected survey month.
- With a contractor selected, export zooms to that contractor's relevant area and includes contractor name in the title/subtitle.
- PDF includes title, map, selected contractor/month, stats, north arrow, legend, scale, and generated date.
- PDF uses the same map status colors as the dashboard.
- Council district boundaries are present but visually light.
- Completion rate and open active count in PDF match the dashboard for the same filter.
- Export works on GitHub Pages without Codex.
- Export handles failure gracefully with a visible error message.

## Open Questions

- Should the PDF include parcel labels, or only colored parcel polygons?
- Should the export use A3 only, or allow Letter and A4 later?
- Should contractor exports include only the dominant cluster or all selected contractor parcels?
- Should URA require a formal map disclaimer/footer?
- Should the output filename use contractor/month, for example `landcare-survey-map-hilltop-rising-2026-05.pdf`?

## Future Enhancements

- Batch export one PDF per contractor.
- Add a parcel detail appendix.
- Add district-level map packet export.
- Add "share link to same filtered map" next to PDF export.
- Add print templates for leadership review, contractor review, and field survey planning.
