# Design QA - Map Monitor executive brief

## Scope

- Map Monitor visual alignment with the KPI dashboard.
- Executive PDF metric selection dialog and print layout.

## Evidence available

- Source UI: `docs/monitoring/index.html` and `docs/landcare/app.css`.
- Implementation: `docs/landcare/monitoring.js`.
- Static verification: JavaScript syntax check and `git diff --check` passed.
- Local endpoint: `http://127.0.0.1:4173/monitoring/` returned HTTP 200 and includes the new masthead and export dialog markup.

## Visual comparison

The Codex in-app browser surface was unavailable to automation in this session, so no same-viewport capture or live print-dialog screenshot could be produced. Manual visual verification is still required for the map view and browser print preview.

## Manual acceptance path

1. Open `/monitoring/` at desktop and mobile widths.
2. Verify the masthead, three-column map workspace, and responsive stacking.
3. Select map filters, choose **Export Brief**, change metric checkboxes, and choose **Prepare PDF**.
4. In the browser print preview, verify that only the selected metrics appear under **Executive metrics** and that map, legend, action focus, header, and footer fit one A3 landscape page.

## Final result

blocked - visual browser and print-preview comparison unavailable in this session.
