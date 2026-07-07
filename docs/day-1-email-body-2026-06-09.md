# Email Body

Subject: LandCare Day 1 baseline QA findings

Hi Oscar,

I completed the Day 1 baseline QA against `URA GISDB` in read-only mode.

Attached are:

- `day-1-insightful-findings-2026-06-09.docx`: short findings memo with the business meaning and recommended next steps.
- `day-1-csv-exports-2026-06-09.zip`: CSV outputs from the inspection queries.

Main takeaway: the dashboard returned-survey count of 142 is reproducible, but it only reconciles cleanly after normalizing parcel keys and matching surveys back to assignment keys. The cleaner operating metric is Active-only completion: 142 returned assignment keys out of 1,011 Active assignment keys, or 14.0%.

The memo also flags two business issues:

- The assignment denominator needs cleanup before dashboard or model changes.
- Contractor completion varies sharply, so follow-up should start with the outliers before broader platform changes.

Recommended next step: standardize parcel-key normalization, add Active-only completion to the dashboard, and run the ownership join to flag parcels that may no longer be URA or PLB owned.

Thanks,
Rizaldy
