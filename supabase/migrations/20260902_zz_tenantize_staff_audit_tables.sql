-- Tenantize the six tables introduced by 20260812_cloud_staff_audit_tables.
-- This migration must sort before 20260903_tenant_permissions_and_rls because
-- that migration intentionally builds tenant policies on clinic_id.

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'staff_profiles', 'time_entries', 'schedule_entries', 'payslips',
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
