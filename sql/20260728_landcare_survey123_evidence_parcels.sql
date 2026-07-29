-- Canonical Survey123 evidence pipeline for LandCare.
-- Raw Survey123 points remain evidence storage. This schema only publishes
-- assignment-derived parcel polygons after all validation checks pass.

BEGIN;

CREATE TABLE IF NOT EXISTS gis.landcare_survey123_evidence_raw (
  source_global_id text PRIMARY KEY,
  source_object_id bigint,
  assignment_object_id bigint,
  parcel_number text,
  organization text,
  assignment_period text,
  service_date date,
  submitted_at timestamptz,
  image_attachment_url text,
  image_attachment_name text,
  source_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_updated_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS landcare_survey123_raw_assignment_idx
  ON gis.landcare_survey123_evidence_raw (assignment_object_id, assignment_period);
CREATE INDEX IF NOT EXISTS landcare_survey123_raw_updated_idx
  ON gis.landcare_survey123_evidence_raw (source_updated_at DESC);

CREATE TABLE IF NOT EXISTS gis.landcare_survey_evidence_parcels (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_global_id text NOT NULL UNIQUE,
  assignment_id integer NOT NULL,
  parcel_key text NOT NULL,
  parcel_number text NOT NULL,
  organization text NOT NULL,
  service_period text NOT NULL,
  submitted_at timestamptz,
  evidence_source text NOT NULL DEFAULT 'survey123',
  -- A submitted service can be valid without a photo. Keep optional
  -- attachment metadata when it exists so the dashboard can show it.
  image_attachment_url text,
  image_attachment_name text,
  validated_at timestamptz NOT NULL DEFAULT now(),
  geometry geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS landcare_survey_evidence_assignment_idx
  ON gis.landcare_survey_evidence_parcels (assignment_id, service_period);
CREATE INDEX IF NOT EXISTS landcare_survey_evidence_geometry_idx
  ON gis.landcare_survey_evidence_parcels USING gist (geometry);

-- Existing VM databases may have been bootstrapped when the field was
-- required. Make the migration idempotently relax that original constraint.
ALTER TABLE gis.landcare_survey_evidence_parcels
  ALTER COLUMN image_attachment_url DROP NOT NULL;

-- Restricted operational view: invalid submissions are intentionally never
-- included in the public hosted polygon layer.
CREATE OR REPLACE VIEW gis.landcare_survey123_evidence_qa AS
WITH assignments AS (
  SELECT id, period, parcelnumb, assigned_to
  FROM gis.regrid_bundle_assignments
)
SELECT
  r.source_global_id,
  r.source_object_id,
  r.assignment_object_id,
  r.parcel_number,
  r.organization,
  r.assignment_period,
  r.submitted_at,
  r.image_attachment_url,
  CASE
    WHEN r.processing_error IS NOT NULL THEN 'processing_error'
    WHEN r.assignment_object_id IS NULL THEN 'missing_assignment_id'
    WHEN a.id IS NULL THEN 'unmatched_assignment'
    WHEN regexp_replace(coalesce(r.parcel_number, ''), '[^0-9]', '', 'g')
       <> regexp_replace(coalesce(a.parcelnumb, ''), '[^0-9]', '', 'g') THEN 'parcel_mismatch'
    WHEN coalesce(r.assignment_period, '') <> to_char(a.period, 'YYYY-MM') THEN 'period_mismatch'
    WHEN regexp_replace(lower(coalesce(r.organization, '')), '[^a-z0-9]+', '', 'g')
       <> regexp_replace(lower(coalesce(a.assigned_to, '')), '[^a-z0-9]+', '', 'g') THEN 'organization_mismatch'
    WHEN NOT EXISTS (
      SELECT 1 FROM gis.pgh_parcels p
      WHERE regexp_replace(p.pin::text, '[^0-9]', '', 'g') = regexp_replace(a.parcelnumb::text, '[^0-9]', '', 'g')
        AND p.geometry IS NOT NULL
      UNION ALL
      SELECT 1 FROM gis.epp_parcels_full e
      WHERE regexp_replace(e.parcel_number::text, '[^0-9]', '', 'g') = regexp_replace(a.parcelnumb::text, '[^0-9]', '', 'g')
        AND e.shape IS NOT NULL
    ) THEN 'missing_authoritative_geometry'
    ELSE 'valid'
  END AS validation_status,
  r.processing_error,
  r.updated_at
FROM gis.landcare_survey123_evidence_raw r
LEFT JOIN assignments a ON a.id = r.assignment_object_id;

CREATE OR REPLACE FUNCTION gis.refresh_landcare_survey_evidence_parcels()
RETURNS TABLE(valid_count integer, invalid_count integer)
LANGUAGE plpgsql AS $$
BEGIN
  TRUNCATE gis.landcare_survey_evidence_parcels RESTART IDENTITY;

  WITH valid_raw AS (
    SELECT r.*, a.id AS assignment_id, a.period, a.parcelnumb, a.assigned_to
    FROM gis.landcare_survey123_evidence_raw r
    JOIN gis.regrid_bundle_assignments a ON a.id = r.assignment_object_id
    WHERE regexp_replace(coalesce(r.parcel_number, ''), '[^0-9]', '', 'g')
          = regexp_replace(coalesce(a.parcelnumb, ''), '[^0-9]', '', 'g')
      AND coalesce(r.assignment_period, '') = to_char(a.period, 'YYYY-MM')
      AND regexp_replace(lower(coalesce(r.organization, '')), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(coalesce(a.assigned_to, '')), '[^a-z0-9]+', '', 'g')
  ), parcel_geometries AS (
    SELECT DISTINCT ON (parcel_key) parcel_key, geometry AS geom
    FROM (
      SELECT regexp_replace(pin::text, '[^0-9]', '', 'g') AS parcel_key, geometry
      FROM gis.pgh_parcels WHERE geometry IS NOT NULL
      UNION ALL
      SELECT regexp_replace(parcel_number::text, '[^0-9]', '', 'g') AS parcel_key, shape
      FROM gis.epp_parcels_full WHERE shape IS NOT NULL
    ) all_geometry
    WHERE parcel_key <> ''
    ORDER BY parcel_key, ST_Area(geometry) DESC NULLS LAST
  ), inserted AS (
    INSERT INTO gis.landcare_survey_evidence_parcels (
      source_global_id, assignment_id, parcel_key, parcel_number, organization,
      service_period, submitted_at, image_attachment_url, image_attachment_name, geometry
    )
    SELECT v.source_global_id, v.assignment_id,
      regexp_replace(v.parcelnumb::text, '[^0-9]', '', 'g'), v.parcelnumb,
      v.assigned_to, to_char(v.period, 'YYYY-MM'), v.submitted_at,
      v.image_attachment_url, v.image_attachment_name,
      ST_Multi(ST_CollectionExtract(ST_Force2D(g.geom), 3))::geometry(MultiPolygon, 4326)
    FROM valid_raw v
    JOIN parcel_geometries g ON g.parcel_key = regexp_replace(v.parcelnumb::text, '[^0-9]', '', 'g')
    RETURNING 1
  )
  SELECT count(*)::integer INTO valid_count FROM inserted;

  SELECT count(*)::integer INTO invalid_count
  FROM gis.landcare_survey123_evidence_qa
  WHERE validation_status <> 'valid';

  UPDATE gis.landcare_survey123_evidence_raw
  SET processed_at = now(), processing_error = NULL, updated_at = now()
  WHERE source_global_id IN (SELECT source_global_id FROM gis.landcare_survey_evidence_parcels);

  RETURN NEXT;
END;
$$;

COMMIT;
