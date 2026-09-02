-- Step 33 - Superadmin control-plane boundary test
--
-- Read-only metadata assertions for 20260902_superadmin_control_plane.sql.
-- Run this against a staging database or a production metadata replica with
-- the Supabase SQL editor. It does not create, update, or delete rows.

do $$
begin
  if to_regprocedure('public.is_current_user_superadmin()') is null then
    raise exception 'FAIL: superadmin identity helper is missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_config'
      and policyname = 'system_config_superadmin_update'
      and cmd = 'UPDATE'
      and coalesce(with_check, '') ilike '%is_current_user_superadmin%'
  ) then
    raise exception 'FAIL: system_config update is not superadmin-only';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_superadmin_update'
      and cmd = 'UPDATE'
      and coalesce(with_check, '') ilike '%is_current_user_superadmin%'
  ) then
    raise exception 'FAIL: users update is not superadmin-only';
  end if;

  if has_table_privilege('authenticated', 'public.system_config', 'DELETE')
     or has_table_privilege('authenticated', 'public.users', 'DELETE')
     or has_table_privilege('authenticated', 'public.clinics', 'DELETE') then
    raise exception 'FAIL: authenticated retains destructive control-plane grants';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('system_config', 'clinics', 'users')
      and policyname in (
        'manager_update_system_config',
        'manager_insert_system_config',
        'staff_insert_users',
        'staff_update_users'
      )
  ) then
    raise exception 'FAIL: a legacy tenant write policy remains on the control plane';
  end if;

  raise notice 'STEP33 SUPERADMIN CONTROL PLANE: ALL PASS';
end
$$;
