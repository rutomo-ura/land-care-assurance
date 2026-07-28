-- LandCare Survey123 approved-evidence store.
-- Apply on the URA PostgreSQL database as a role permitted to create objects in gis.

BEGIN;

CREATE TABLE IF NOT EXISTS gis.ura_landcare_survey_submissions_internal (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_global_id uuid NOT NULL UNIQUE,
  source_object_id bigint,
  source_survey_id text NOT NULL,
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  parcel_number text NOT NULL,
  address text,
  maintained_by text NOT NULL,
  assignment_period text,
  assignment_object_id bigint,
  assignment_geometry jsonb,
  service_date date,
  submitted_at timestamptz,
  first_visit boolean,
  litter_dumping boolean,
  grass_cutting boolean,
  pruning_clipping boolean,
  vehicles_lot boolean,
  additional_comments text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  image_attachment_url text,
  image_attachment_name text,
  reviewed_by text,
  reviewed_at timestamptz,
  review_reason text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Existing VM deployments created this table before polygon evidence was
-- introduced, so make the migration additive and safe to re-run.
ALTER TABLE gis.ura_landcare_survey_submissions_internal
  ADD COLUMN IF NOT EXISTS assignment_period text,
  ADD COLUMN IF NOT EXISTS assignment_object_id bigint,
  ADD COLUMN IF NOT EXISTS assignment_geometry jsonb;

CREATE INDEX IF NOT EXISTS ura_landcare_survey_submissions_internal_parcel_idx
  ON gis.ura_landcare_survey_submissions_internal (parcel_number);
CREATE INDEX IF NOT EXISTS ura_landcare_survey_submissions_internal_approved_idx
  ON gis.ura_landcare_survey_submissions_internal (approval_status, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS ura_landcare_survey_submissions_internal_assignment_idx
  ON gis.ura_landcare_survey_submissions_internal (assignment_object_id, assignment_period);

CREATE TABLE IF NOT EXISTS gis.ura_landcare_survey_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE OR REPLACE FUNCTION gis.set_ura_landcare_survey_submission_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ura_landcare_survey_submissions_internal_updated_at
  ON gis.ura_landcare_survey_submissions_internal;
CREATE TRIGGER ura_landcare_survey_submissions_internal_updated_at
  BEFORE UPDATE ON gis.ura_landcare_survey_submissions_internal
  FOR EACH ROW EXECUTE FUNCTION gis.set_ura_landcare_survey_submission_updated_at();

CREATE OR REPLACE VIEW gis.landcare_approved_survey_evidence AS
SELECT
  source_global_id,
  parcel_number AS parcelnumb,
  address,
  maintained_by,
  service_date,
  submitted_at,
  first_visit,
  litter_dumping,
  grass_cutting,
  pruning_clipping,
  vehicles_lot,
  additional_comments,
  latitude AS lat,
  longitude AS lon,
  image_attachment_url AS image_url,
  image_attachment_name,
  reviewed_by,
  reviewed_at,
  'approved_internal_survey123'::text AS evidence_source
FROM gis.ura_landcare_survey_submissions_internal
WHERE approval_status = 'approved';

CREATE OR REPLACE VIEW gis.landcare_survey_evidence_parcels AS
SELECT
  source_global_id,
  parcel_number,
  address,
  maintained_by,
  assignment_period,
  assignment_object_id,
  submitted_at,
  image_attachment_url,
  assignment_geometry
FROM gis.ura_landcare_survey_submissions_internal
WHERE approval_status = 'approved'
  AND image_attachment_url IS NOT NULL
  AND assignment_geometry IS NOT NULL;

COMMIT;
