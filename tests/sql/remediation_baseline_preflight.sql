-- Read-only preflight for the disposable/staging target.
-- This must pass before remediation migrations are applied. It deliberately
-- fails closed rather than allowing an incomplete schema to look validated.

do $$
declare
  missing_tables text;
begin
  select string_agg(required_table, ', ' order by required_table)
    into missing_tables
  from (values
    ('appointments'),
    ('auth_audit'),
    ('boarding_records'),
    ('cash_adjustments'),
    ('clients'),
    ('clinic_queue'),
    ('clinic_settings'),
    ('clinics'),
    ('deletion_audit'),
    ('grooming_logs'),
    ('inventory'),
    ('inventory_batches'),
    ('inventory_categories'),
    ('invoices'),
    ('lab_results'),
    ('medical_records'),
    ('notifications'),
    ('pets'),
    ('payslips'),
    ('schedule_entries'),
    ('shift_reconciliations'),
    ('shifts'),
    ('staff_profiles'),
    ('suppliers'),
    ('system_alerts'),
    ('system_config'),
    ('time_entries'),
    ('users'),
    ('vaccinations')
  ) as required(required_table)
  where to_regclass('public.' || required_table) is null;

  if missing_tables is not null then
    raise exception 'VHMS_BASELINE_REQUIRED: missing public tables: %', missing_tables;
  end if;

  raise notice 'VHMS BASELINE PREFLIGHT: PASS';
end
$$;
