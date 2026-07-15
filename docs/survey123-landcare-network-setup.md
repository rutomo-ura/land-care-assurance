# LandCare Network Survey123 setup

The existing **LandCare Network** survey is a Regrid survey. Its current contractor, service, comment, and required-photo questions are the source template for a new Survey123 contractor intake; do not alter the live Regrid survey or its production responses.

## Public form fields

Mirror the existing Regrid questions: contractor, date of services, first visit, litter/dumping, pruning/clipping/grass cutting, vehicles, comments, and required photo. Add or verify these fields in the new Survey123 feature layer:

| Field | Public behavior | Purpose |
| --- | --- | --- |
| `parcel_number` | Required | Match the LandCare parcel identifier. |
| `address` | Required | Human-readable location check. |
| `organization` | Required, prefilled from the monthly assignment bundle | Contractor selected on the LandCare submission page. |
| `assignment_period` | Read-only, prefilled | Current monthly assignment period used for the lookup. |
| `service_date` | Required date question | Service date; replace free text where practical. |
| `review_status` | Hidden, default `pending` | Workflow gate; never editable on the public view. |
| `reviewed_by`, `reviewed_at`, `review_reason` | Hidden on public view | URA-only approval audit. |

Photos must be required and stored as Survey123 attachments. Retain the service point/geometry when possible.

## Monthly assignment prefill

The branded Survey Submission page queries the public, query-only current assignment layer:

`https://services1.arcgis.com/0DMNBNaacQNEfN4H/arcgis/rest/services/gisdb_gis_regrid_bundle_assignments_current_period/FeatureServer/0`

It filters `is_current_period = 1` by `maintained_by`, presents only active parcels, and carries the selected contractor, parcel number, address, and period into Survey123 using URL parameters. Use these exact Survey123 question names so the prefill works: `organization`, `parcel_number`, `address`, and `assignment_period`.

The monthly Regrid bundle refreshes that layer, so no manual list maintenance is required in the public intake page. The Survey123 form remains the system of record for the submitted response; the reference layer only verifies the parcel is in the current assignment.

## Views and review

Create two hosted feature layer views over the survey source:

1. **LandCare Network – public submit view**: public add-only access; hide review fields; no update/delete permission.
2. **LandCare Network – URA review view**: shared only with the URA reviewer group; permits updates to review fields and is used by the Survey123 Inbox.

In the Inbox, URA reviewers set `review_status` to `approved` or `rejected`, provide reviewer name/date/reason, and do not alter contractor evidence fields. Only `approved` data is synced into PostgreSQL or displayed on the public Monitor.

## Webhook and VM configuration

Create a Survey123 webhook for both new records and edits, pointing to:

`https://<approved-URA-host>/webhook/survey123`

Send the `X-LandCare-Webhook-Token` header. Configure these VM-only environment variables:

```text
LANDCARE_PG_DSN=postgresql://<service-user>:<password>@<host>:5432/gisdb
LANDCARE_SURVEY_WEBHOOK_TOKEN=<long-random-secret>
SURVEY123_FEATURE_LAYER_URL=https://services.../FeatureServer/0
SURVEY123_ARCGIS_TOKEN=<service-token-if-the-layer-is-private>
SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL=https://services.../FeatureServer/0
```

Apply [`sql/20260715_landcare_survey_submission_internal.sql`](../sql/20260715_landcare_survey_submission_internal.sql), then run the receiver behind the URA HTTPS reverse proxy:

```powershell
python -m uvicorn scripts.landcare_survey_webhook:app --host 127.0.0.1 --port 8091
```

`SURVEY123_PUBLIC_ATTACHMENT_LAYER_URL` must be a read-only public view if the
approved photos are intentionally shown in the public Map Monitor. It must not
contain a token.

After the receiver is behind HTTPS, set `APPROVED_EVIDENCE_GEOJSON_URL` in
`docs/landcare/survey-submission-config.js` to its `/public/approved-evidence`
endpoint. That endpoint exposes only approved records with valid public photos.

Update [`docs/landcare/survey-submission-config.js`](landcare/survey-submission-config.js) with the Survey123 public share URL. This repository intentionally contains no Survey123 IDs, PostgreSQL passwords, tokens, or webhook secrets.
