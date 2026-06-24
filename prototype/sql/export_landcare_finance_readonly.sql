-- LandCare finance export
-- Read-only. Run against URA GISDB with psql or pgAdmin after ContractsDriveToSQL.py has loaded
-- gis.land_care_budgeting_contracts.
--
-- Output:
--   docs/landcare/data/finance_contracts.json
--
-- psql example:
--   psql "host=10.0.101.57 port=5432 dbname=gisdb user=rutomo" \
--     --tuples-only --no-align \
--     --output docs/landcare/data/finance_contracts.json \
--     --file prototype/sql/export_landcare_finance_readonly.sql
--
-- Notes:
--   - This exports the contract/budget table created by ContractsDriveToSQL.py.
--   - It does not modify source tables.

begin read only;

with contract_rows as (
    select
        organization,
        start_date::date as start_date,
        end_date::date as end_date,
        invoice_amount::numeric as invoice_amount,
        twelve_month_contract_amount::numeric as twelve_month_contract_amount
    from gis.land_care_budgeting_contracts
    where organization is not null
),
latest_cycle as (
    select max(start_date) as latest_start_date
    from contract_rows
),
current_rows as (
    select c.*
    from contract_rows c
    join latest_cycle l
      on c.start_date = l.latest_start_date
),
summary as (
    select
        count(*) as organization_count,
        min(start_date) as cycle_start_date,
        max(end_date) as cycle_end_date,
        sum(invoice_amount) as monthly_invoice_total,
        sum(invoice_amount) * 12 as annual_invoice_run_rate,
        sum(twelve_month_contract_amount) as twelve_month_contract_total
    from current_rows
)
select jsonb_build_object(
    'metadata', jsonb_build_object(
        'generated_on', current_date,
        'source_kind', 'postgres_readonly_export',
        'source_tables', jsonb_build_array('gis.land_care_budgeting_contracts'),
        'loader_script', 'URA-Data-Repository/ContractsDriveToSQL.py'
    ),
    'summary', (
        select to_jsonb(summary)
        from summary
    ),
    'current_contracts', (
        select coalesce(jsonb_agg(to_jsonb(current_rows) order by organization), '[]'::jsonb)
        from current_rows
    ),
    'all_contracts', (
        select coalesce(jsonb_agg(to_jsonb(contract_rows) order by start_date, organization), '[]'::jsonb)
        from contract_rows
    )
)::text;

rollback;
