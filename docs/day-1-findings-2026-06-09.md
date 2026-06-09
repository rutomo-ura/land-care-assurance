# Day 1 Findings: Baseline QA

Date: 2026-06-09  
Database: `gisdb`  
Connection: pgAdmin `URA GISDB`, user `rutomo`  
SQL mode: read-only query work. No table writes.

## Checklist Status

- [x] Connected to PostgreSQL `gisdb`.
- [x] Confirmed `gis` and `analysis` source columns.
- [x] Exported local CSV outputs to `outputs/week-1-day-1/`.
- [x] Reproduced the LandCare assignment universe from `gis.epp_snapshot`.
- [x] Split assignment counts into Active and Request Only.
- [x] Checked parcel key length and validity.
- [x] Reproduced current-quarter returned surveys from `gis.regrid_survey_submissions`.
- [x] Split completion into Active and Request Only.
- [x] Broke completion out by organization.
- [x] Created a reconciliation summary.

## Baseline Counts

| Metric | Value |
| --- | ---: |
| Assignment rows from `gis.epp_snapshot` | 1,221 |
| Distinct `parcel_number` values | 1,220 |
| Distinct normalized assignment keys | 1,095 |
| Current-quarter survey rows | 149 |
| Distinct current-quarter survey keys | 144 |
| Returned survey keys matched to assignment keys | 142 |
| Unmatched returned survey keys | 2 |

## Assignment Universe

| Maintenance level | Rows | Distinct parcel numbers |
| --- | ---: | ---: |
| Active | 1,127 | 1,127 |
| Request Only | 94 | 93 |

The current `gis.epp_snapshot` count is higher than the dashboard reference of 1,214 assigned parcels. Normalized parcel keys are lower than display parcel numbers because multiple records share the same numeric parcel key.

## Completion Split

| Maintenance level | Assigned parcel keys | Returned assigned parcel keys | Completion rate |
| --- | ---: | ---: | ---: |
| Active | 1,011 | 142 | 14.0% |
| Request Only | 90 | 0 | 0.0% |

The dashboard returned-survey reference of 142 reconciles when current-quarter survey keys are joined back to normalized Active assignment keys.

## Key Notes

- `gis.epp_snapshot` uses `parcel_number`, not `parcelnumb`.
- `gis.regrid_survey_submissions` uses `parcelnumb`.
- Parcel keys need normalization with `regexp_replace(..., '[^0-9]', '', 'g')` before joining.
- `parcel_number` is mostly 14 or 15 digits after normalization, so the prior 16-digit validity check does not match this table directly.
- Current-quarter SQL returned 149 survey rows, but only 142 matched assignment keys.

## CSV Outputs

- `source_columns.csv`
- `assignment_universe_counts.csv`
- `parcel_number_validity.csv`
- `parcel_digit_length_counts.csv`
- `assignment_by_organization.csv`
- `survey_periods.csv`
- `returned_surveys_by_status.csv`
- `survey_parcel_digit_length_counts.csv`
- `completion_by_level.csv`
- `completion_by_organization.csv`
- `reconciliation_summary.csv`

## Automation Candidates

- Convert the Day 1 SQL sequence into a read-only export script.
- Add a reusable parcel-key normalization CTE.
- Produce the reconciliation summary automatically after each monthly survey load.
- Add a check that flags assignment count drift against the Power BI denominator.
- Add a dashboard measure for Active-only completion using normalized parcel keys.
