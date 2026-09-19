-- Tenantize every pre-existing clinic-scoped table before the 20260828
-- clinic-index migration and the 20260903 RLS boundary. The later migrations
-- add the remaining checkout, boarding-pricing, and clinic-settings tables.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'appointments', 'boarding_records', 'cash_adjustments', 'clients',
    'clinic_queue', 'grooming_logs', 'inventory', 'inventory_batches',
    'inventory_categories', 'invoices', 'lab_results', 'medical_records',
    'notifications', 'pets', 'shift_reconciliations', 'shifts',
    'staff_profiles', 'suppliers', 'system_alerts', 'system_config',
    'time_entries', 'users', 'vaccinations', 'schedule_entries', 'payslips',
    'deletion_audit', 'auth_audit'
  ] loop
    execute format(
      'alter table public.%I add column if not exists clinic_id uuid',
      table_name
    );

    execute format(
      'create index if not exists %I on public.%I (clinic_id)',
      'idx_' || table_name || '_clinic_id',
      table_name
    );

    if not exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = table_name
        and c.conname = table_name || '_clinic_id_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (clinic_id) references public.clinics(id)',
        table_name,
        table_name || '_clinic_id_fkey'
      );
    end if;
  end loop;
end
$$;

commit;
