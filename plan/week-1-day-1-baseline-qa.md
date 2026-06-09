# Week 1 Day 1: Baseline QA

Owner: GIS/Analyst  
Date: 2026-06-09  
Scope: Manual validation only. No production script changes.

## Objective

Establish a reproducible baseline for LandCare assignment and survey completion counts using PostgreSQL, then reconcile the results to the Power BI dashboard.

Day 1 should answer:

- How many parcels are in the LandCare assignment universe?
- How many are Active vs Request Only?
- Does the SQL count reconcile to the dashboard count of 1,214 assigned parcels?
- Can the returned survey count reconcile to 142 returned surveys?
- What is the Active-only completion rate?

## Checklist

- [ ] Confirm access to the PostgreSQL VM and the `gis` and `analysis` schemas.
- [ ] Confirm access to the Power BI report and current-quarter filters.
- [ ] Create local CSV exports in `outputs/week-1-day-1/`.
- [ ] Inspect the relevant table columns before running count queries.
- [ ] Reproduce the assignment universe from `gis.epp_snapshot`.
- [ ] Split assignment counts into Active and Request Only.
- [ ] Count invalid parcel numbers dropped by the current export logic.
- [ ] Reconcile SQL assignment counts to the dashboard count of 1,214.
- [ ] Reproduce returned surveys from `gis.regrid_survey_submissions`.
- [ ] Split completion into Active-only and Request-Only.
- [ ] Break completion out by maintenance organization.
- [ ] Record any count differences with the exact filter, date, and query used.
- [ ] Save the final counts in a short Day 1 findings note using `docs/day-1-findings-template.md`.

## Output Files

Save query exports to `outputs/week-1-day-1/` using these names:

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

CSV files are ignored by Git. Commit the findings note, not parcel-level extracts.

## Manual Query Sequence

Run these in order. Adjust column names only if the inspection query shows a different name in the database.

### 1. Inspect Source Columns

```sql
select
    table_schema,
    table_name,
    column_name,
    data_type
from information_schema.columns
where table_schema in ('gis', 'analysis')
  and table_name in (
      'epp_snapshot',
      'regrid_survey_submissions',
      'assessment_snapshot',
      'city_epp_properties'
  )
order by table_schema, table_name, ordinal_position;
```

### 2. Reproduce Assignment Universe

```sql
with assignment_universe as (
    select
        parcel_number,
        property_maint_mgr_name,
        tags,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Other'
        end as maintenance_level
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
)
select
    maintenance_level,
    count(*) as rows,
    count(distinct parcel_number) as distinct_parcels
from assignment_universe
group by maintenance_level
order by maintenance_level;
```

Expected check: total distinct parcels should reconcile to the Power BI assigned count, currently 1,214 for the current quarter.

### 3. Check Parcel Number Validity

```sql
with assignment_universe as (
    select
        parcel_number,
        tags
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
)
select
    case
        when length(regexp_replace(parcel_number::text, '[^0-9]', '', 'g')) = 16
            then 'valid_16_digit'
        else 'invalid_or_missing'
    end as parcel_number_status,
    count(*) as rows,
    count(distinct parcel_number) as distinct_parcels
from assignment_universe
group by parcel_number_status
order by parcel_number_status;
```

### 4. Assignment Count by Organization

```sql
with assignment_universe as (
    select
        parcel_number,
        property_maint_mgr_name,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Other'
        end as maintenance_level
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
)
select
    coalesce(property_maint_mgr_name, 'Unassigned') as organization,
    maintenance_level,
    count(distinct parcel_number) as assigned_parcels
from assignment_universe
group by organization, maintenance_level
order by organization, maintenance_level;
```

### 5. Inspect Survey Periods

```sql
select
    period,
    count(*) as survey_rows,
    count(distinct parcelnumb) as distinct_surveyed_parcels
from gis.regrid_survey_submissions
group by period
order by period desc;
```

Use this to confirm the current-quarter period values before filtering the completion queries.

### 6. Reproduce Returned Surveys

Replace the dates with the current-quarter period range confirmed in the dashboard.

```sql
select
    count(*) as returned_rows,
    count(distinct parcelnumb) as returned_parcels
from gis.regrid_survey_submissions
where period >= date '2026-04-01'
  and period < date '2026-07-01';
```

Expected check: the returned count should reconcile to the dashboard count of 142 for the current quarter.

### 7. Active vs Request-Only Completion

Replace the dates with the same current-quarter period range used above.

```sql
with assignment_universe as (
    select distinct
        parcel_number,
        regexp_replace(parcel_number::text, '[^0-9]', '', 'g') as assignment_digits,
        property_maint_mgr_name,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Other'
        end as maintenance_level
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
),
returned as (
    select distinct
        regexp_replace(parcelnumb::text, '[^0-9]', '', 'g') as survey_digits
    from gis.regrid_survey_submissions
    where period >= date '2026-04-01'
      and period < date '2026-07-01'
)
select
    a.maintenance_level,
    count(distinct a.assignment_digits) as assigned_parcel_keys,
    count(distinct r.survey_digits) as returned_assigned_parcel_keys,
    round(
        100.0 * count(distinct r.survey_digits)
        / nullif(count(distinct a.assignment_digits), 0),
        1
    ) as completion_rate_pct
from assignment_universe a
left join returned r
    on r.survey_digits = a.assignment_digits
group by a.maintenance_level
order by a.maintenance_level;
```

### 8. Completion by Organization

```sql
with assignment_universe as (
    select distinct
        parcel_number,
        regexp_replace(parcel_number::text, '[^0-9]', '', 'g') as assignment_digits,
        property_maint_mgr_name,
        case
            when tags ilike '%LandCare - Active%' then 'Active'
            when tags ilike '%LandCare - Request Only%' then 'Request Only'
            else 'Other'
        end as maintenance_level
    from gis.epp_snapshot
    where tags ilike '%LandCare - Active%'
       or tags ilike '%LandCare - Request Only%'
),
returned as (
    select distinct
        regexp_replace(parcelnumb::text, '[^0-9]', '', 'g') as survey_digits
    from gis.regrid_survey_submissions
    where period >= date '2026-04-01'
      and period < date '2026-07-01'
)
select
    coalesce(a.property_maint_mgr_name, 'Unassigned') as organization,
    a.maintenance_level,
    count(distinct a.assignment_digits) as assigned_parcel_keys,
    count(distinct r.survey_digits) as returned_assigned_parcel_keys,
    round(
        100.0 * count(distinct r.survey_digits)
        / nullif(count(distinct a.assignment_digits), 0),
        1
    ) as completion_rate_pct
from assignment_universe a
left join returned r
    on r.survey_digits = a.assignment_digits
group by organization, a.maintenance_level
order by organization, a.maintenance_level;
```

## Day 1 Output Format

Create a short note with:

- SQL assignment count and Power BI assignment count.
- SQL returned count and Power BI returned count.
- Active-only completion rate.
- Request-Only returned count.
- Any reconciliation gaps.
- Query dates and dashboard filter settings used.
- Open questions for Oscar or the data owner.

## GitHub Summary

Use this wording when committing or opening a pull request:

```text
Add Week 1 Day 1 baseline QA checklist

Adds a manual validation checklist and SQL query sequence for reproducing
LandCare assignment counts, returned survey counts, Active vs Request-Only
completion, and organization-level completion from PostgreSQL.
```
