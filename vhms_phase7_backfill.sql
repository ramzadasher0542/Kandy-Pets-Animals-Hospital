-- Phase 7 clinic backfill.
--
-- Run only through an administrative Supabase migration context, never from
-- the browser anon/authenticated client.
--
-- The VHMS state explicitly says that the active superadmin is intentionally
-- clinic-less. The users table therefore preserves superadmin rows with a
-- NULL clinic_id while assigning every other orphaned user row.

begin;

do $$
declare
  v_clinic_id uuid;
  v_clinic_count integer;
  v_table text;
  v_updated bigint;
  v_remaining bigint;
begin
  -- Refuse to guess if the clinic name is missing or duplicated.
  select count(*)::integer
    into v_clinic_count
  from public.clinics
  where name = 'Kandy Pets Animals Hospital';

  if v_clinic_count <> 1 then
    raise exception
      'Expected exactly one primary clinic named %; found %',
      'Kandy Pets Animals Hospital',
      v_clinic_count;
  end if;

  select id
    into v_clinic_id
  from public.clinics
  where name = 'Kandy Pets Animals Hospital';

  -- These are the 27 original application tables recorded in VHMS_STATE.md.
  -- clinics and clinic_settings are intentionally excluded because they are
  -- already tenant metadata, not legacy application rows.
  foreach v_table in array array[
    'appointments',
    'auth_audit',
    'boarding_records',
    'cash_adjustments',
    'clients',
    'clinic_queue',
    'deletion_audit',
    'grooming_logs',
    'inventory',
    'inventory_batches',
    'inventory_categories',
    'invoices',
    'lab_results',
    'medical_records',
    'notifications',
    'payslips',
    'pets',
    'schedule_entries',
    'shift_reconciliations',
    'shifts',
    'staff_profiles',
    'suppliers',
    'system_alerts',
    'system_config',
    'time_entries',
    'users',
    'vaccinations'
  ] loop
    if to_regclass(format('public.%I', v_table)) is null then
      raise exception 'Required table public.% is missing', v_table;
    end if;

    if v_table = 'users' then
      -- Preserve the clinic-less superadmin control-plane identity.
      execute format(
        'update public.%I
            set clinic_id = $1
          where clinic_id is null
            and coalesce(is_superadmin, false) = false',
        v_table
      ) using v_clinic_id;
    else
      execute format(
        'update public.%I
            set clinic_id = $1
          where clinic_id is null',
        v_table
      ) using v_clinic_id;
    end if;

    get diagnostics v_updated = row_count;
    raise notice 'public.%: assigned % row(s) to clinic %', v_table, v_updated, v_clinic_id;

    if v_table = 'users' then
      execute format(
        'select count(*) from public.%I
          where clinic_id is null
            and coalesce(is_superadmin, false) = false',
        v_table
      ) into v_remaining;
    else
      execute format(
        'select count(*) from public.%I where clinic_id is null',
        v_table
      ) into v_remaining;
    end if;

    if v_remaining <> 0 then
      raise exception 'Backfill left % orphaned row(s) in public.%', v_remaining, v_table;
    end if;
  end loop;

  raise notice 'Backfill target clinic: %', v_clinic_id;
  raise notice 'Clinic-less superadmin rows in public.users were preserved by design.';
end
$$;

commit;

