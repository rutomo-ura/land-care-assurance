-- LandCare map prototype export
-- Read-only. Run against URA GISDB with psql or pgAdmin.
--
-- Output:
--   prototype/source/app_ready_parcels_monthly.geojson
--
-- psql example:
--   psql "host=10.0.101.57 port=5432 dbname=gisdb user=rutomo" \
--     --tuples-only --no-align \
--     --output prototype/source/app_ready_parcels_monthly.geojson \
--     --file prototype/sql/export_prototype_data_readonly.sql
--
-- Notes:
--   - Uses bundle assignments as the monthly denominator.
--   - Uses survey submissions as completed/returned evidence.
--   - Uses the latest comparable month where survey submissions exist.
--   - Fills blank historical maintain_level values from current EPP tags.
--   - Classifies ownership with normalized wildcard-style matching.
--   - Does not modify source tables.

begin read only;

with latest_dates as (
    select
        max(a.period)::date as latest_assignment_period,
        max(s.period)::date as latest_survey_period,
        date_trunc('month', max(s.period))::date as latest_comparable_month
    from gis.regrid_bundle_assignments a
    cross join gis.regrid_survey_submissions s
),
current_epp as (
    select distinct on (parcel_key)
        parcel_key,
        parcel_number,
        property_maint_mgr_name,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Unknown'
        end as current_maintenance_level
    from (
        select
            regexp_replace(parcel_number::text, '[^0-9]', '', 'g') as parcel_key,
            parcel_number,
            property_maint_mgr_name,
            tags,
            mod_dt
        from gis.epp_snapshot
        where parcel_number is not null
    ) e
    where parcel_key <> ''
    order by parcel_key, mod_dt desc nulls last
),
assignments as (
    select distinct on (period_month, parcel_key)
        period_month,
        parcel_key,
        parcel_number,
        organization,
        maintenance_level
    from (
        select
            date_trunc('month', a.period)::date as period_month,
            regexp_replace(a.parcelnumb::text, '[^0-9]', '', 'g') as parcel_key,
            coalesce(nullif(a.parcelnumb::text, ''), e.parcel_number) as parcel_number,
            coalesce(nullif(a.assigned_to, ''), e.property_maint_mgr_name, 'Unassigned') as organization,
            case
                when a.maintain_level ilike '%Active%' then 'Active'
                when a.maintain_level ilike '%Request%' then 'Request Only'
                when e.current_maintenance_level in ('Active', 'Request Only') then e.current_maintenance_level
                else 'Unknown'
            end as maintenance_level
        from gis.regrid_bundle_assignments a
        left join current_epp e
            on e.parcel_key = regexp_replace(a.parcelnumb::text, '[^0-9]', '', 'g')
        cross join latest_dates d
        where a.period >= date '2025-05-01'
          and date_trunc('month', a.period)::date <= d.latest_comparable_month
    ) base
    where parcel_key <> ''
    order by period_month, parcel_key, organization
),
returned as (
    select distinct
        date_trunc('month', period)::date as period_month,
        regexp_replace(parcelnumb::text, '[^0-9]', '', 'g') as parcel_key
    from gis.regrid_survey_submissions
    where period >= date '2025-05-01'
      and parcelnumb is not null
),
pgh_geometry as (
    select distinct on (parcel_key)
        parcel_key,
        geometry as geom
    from (
        select
            regexp_replace(pin::text, '[^0-9]', '', 'g') as parcel_key,
            geometry
        from gis.pgh_parcels
        where geometry is not null
    ) g
    where parcel_key <> ''
    order by parcel_key, st_area(geometry) desc nulls last
),
epp_geometry as (
    select distinct on (parcel_key)
        parcel_key,
        shape as geom
    from (
        select
            regexp_replace(parcel_number::text, '[^0-9]', '', 'g') as parcel_key,
            shape
        from gis.epp_parcels_full
        where shape is not null
    ) g
    where parcel_key <> ''
    order by parcel_key, st_area(shape) desc nulls last
),
parcel_geometry as (
    select
        coalesce(p.parcel_key, e.parcel_key) as parcel_key,
        coalesce(p.geom, e.geom) as geom
    from pgh_geometry p
    full outer join epp_geometry e
        on e.parcel_key = p.parcel_key
),
city_owner as (
    select distinct on (parcel_key)
        parcel_key,
        owner as owner_name
    from (
        select
            regexp_replace(pin::text, '[^0-9]', '', 'g') as parcel_key,
            owner,
            last_updated
        from analysis.city_epp_properties
        where pin is not null
    ) o
    where parcel_key <> ''
    order by parcel_key, last_updated desc nulls last
),
assessment_owner as (
    select distinct on (parcel_key)
        parcel_key,
        propertyowner as owner_name
    from (
        select
            regexp_replace(parid::text, '[^0-9]', '', 'g') as parcel_key,
            propertyowner,
            asofdate
        from analysis.assessment_snapshot
        where parid is not null
    ) o
    where parcel_key <> ''
    order by parcel_key, asofdate desc nulls last
),
owner_lookup as (
    select
        a.parcel_key,
        coalesce(c.owner_name, ass.owner_name, '') as owner_name,
        regexp_replace(lower(coalesce(c.owner_name, ass.owner_name, '')), '[^a-z0-9]+', '', 'g') as owner_norm
    from (select distinct parcel_key from assignments) a
    left join city_owner c
        on c.parcel_key = a.parcel_key
    left join assessment_owner ass
        on ass.parcel_key = a.parcel_key
),
parcel_month as (
    select
        a.period_month,
        a.parcel_key,
        a.parcel_number,
        a.organization,
        a.maintenance_level,
        coalesce(nullif(o.owner_name, ''), 'Unknown') as owner_name,
        case
            when o.owner_norm ~ '(pittsburghlandbank|^plb|landbank)' then 'Pittsburgh Land Bank'
            when o.owner_norm ~ '(urbanredevelopmentauthority|redevelopmentauthorityofpittsburgh|pittsburghurbanredevelopmentauthority|^ura)' then 'URA'
            when o.owner_norm ~ '(cityofpittsburgh)' then 'City of Pittsburgh'
            else 'Other or unknown'
        end as ownership_type,
        true as assigned_flag,
        (r.parcel_key is not null and a.maintenance_level = 'Active') as returned_flag,
        case
            when a.maintenance_level = 'Request Only' then 'request_only'
            when r.parcel_key is not null and a.maintenance_level = 'Active' then 'returned'
            else 'missing'
        end as completion_status,
        g.geom
    from assignments a
    left join returned r
        on r.period_month = a.period_month
       and r.parcel_key = a.parcel_key
    left join parcel_geometry g
        on g.parcel_key = a.parcel_key
    left join owner_lookup o
        on o.parcel_key = a.parcel_key
),
feature_rows as (
    select
        jsonb_build_object(
            'type', 'Feature',
            'properties', jsonb_build_object(
                'parcel_key', parcel_key,
                'period_month', to_char(period_month, 'YYYY-MM'),
                'organization', organization,
                'maintenance_level', maintenance_level,
                'ownership_type', ownership_type,
                'owner_name', owner_name,
                'assigned_flag', assigned_flag,
                'returned_flag', returned_flag,
                'completion_status', completion_status,
                'masked_geometry', false
            ),
            'geometry', st_asgeojson(st_simplifypreservetopology(geom, 0.000003), 6)::jsonb
        ) as feature
    from parcel_month
    where geom is not null
)
select jsonb_build_object(
    'type', 'FeatureCollection',
    'metadata', jsonb_build_object(
        'geometry_mode', 'postgres_readonly_export',
        'generated_on', current_date,
        'source_note', 'PostgreSQL export. Assignments updated through May 15, 2026; survey completion shown through Apr 15, 2026.',
        'source_tables', jsonb_build_array(
            'gis.regrid_bundle_assignments',
            'gis.regrid_survey_submissions',
            'gis.pgh_parcels',
            'gis.epp_parcels_full',
            'gis.epp_snapshot',
            'analysis.city_epp_properties',
            'analysis.assessment_snapshot'
        ),
        'owner_match_note', 'Owner names are normalized before matching URA and Pittsburgh Land Bank variants.',
        'latest_assignment_period', (select latest_assignment_period from latest_dates),
        'latest_survey_period', (select latest_survey_period from latest_dates),
        'latest_comparable_month', (select latest_comparable_month from latest_dates),
        'missing_geometry_rows', (select count(*) from parcel_month where geom is null)
    ),
    'features', coalesce(jsonb_agg(feature order by feature->'properties'->>'period_month', feature->'properties'->>'organization', feature->'properties'->>'parcel_key'), '[]'::jsonb)
)::text
from feature_rows;

rollback;
