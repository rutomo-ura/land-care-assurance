# Outputs

Generated inspection files live here while analysis is in progress.

## Commit Policy

Commit:

- `README.md` files that explain the output set.
- `.gitkeep` files used to keep expected folders visible.
- Aggregated summaries only when they contain no parcel-level or sensitive data.

Do not commit:

- Parcel-level CSV exports.
- Raw database extracts.
- Excel workbooks from the G drive or Power BI.
- Any file containing owner names, parcel-level notes, credentials, or internal paths beyond documented source locations.

## Day 1 Layout

Use this folder pattern for the baseline QA work:

```text
outputs/
  week-1-day-1/
    README.md
    assignment_universe_counts.csv
    parcel_number_validity.csv
    assignment_by_organization.csv
    survey_periods.csv
    completion_by_level.csv
    completion_by_organization.csv
```

The CSV files are ignored by Git. Summarize final counts in `docs/day-1-findings-template.md` or a dated findings note.
