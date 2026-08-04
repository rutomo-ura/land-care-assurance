# Sync notes

Everything else in this folder is a vendored export from the Claude design tool. Do not
hand-edit those files: a re-export will overwrite them, and the tokens are meant to stay a
faithful copy of `docs/landcare/app.css`. This file is the exception, maintained here to
record what has drifted since the export.

## Export

Taken 4 August 2026 from `ura-gis/land-care-assurance`, branch `master`, path `docs/`.
See `github.md` for the screen map from each artifact back to its repo source.

## Known drift

| Area | Status |
|---|---|
| Tokens, spacing, radii, shadows, type scale | Current. `tokens/colors.css` matches `app.css` `:root` exactly |
| Components, guidelines, icons, brand mark | Current |
| KPI dashboard template and finance copy examples | **Stale.** Predates the NetSuite deployment |

NetSuite check-request actuals shipped on 4 August 2026, shortly after this export. The KPI
finance surface changed with it:

- The Invoices tab is now labelled Check Requests.
- `Actual to date` / `NetSuite feed required` is now
  `Check requests to date` / `NetSuite contractor actuals`.
- `Actuals remain explicitly unavailable until NetSuite is connected` is no longer true.

So `templates/kpi-dashboard/KpiDashboard.dc.html` and two copy examples in `readme.md` show
wording the product no longer uses. The visual language they demonstrate is unaffected: use
them for layout, tokens, and component structure, and take finance wording from the live
`docs/kpi/index.html` instead.

## Re-exporting

Re-export from the design tool rather than patching by hand, then update this file. Check
`tokens/colors.css` still matches `app.css` `:root`; if it does not, the product changed and
the design system needs to follow.
