-- Step 34 — tenant isolation and owner-permission boundary tests.
--
-- Run this in a staging database or a disposable production transaction as the
-- postgres role. The runtime probe creates two synthetic clinics and users,
-- then rolls everything back before returning.

begin;

do $$
declare
  v_marker text := 'KPAH_TENANT_SCOPE_' || replace(gen_random_uuid()::text, '-', '');
  v_clinic_a uuid;
  v_clinic_b uuid;
  v_visible integer;
begin
  if exists (
    select 1
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename not in ('system_config', 'users', 'clinics', 'clinic_settings')
      and exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = p.tablename
          and c.column_name = 'clinic_id'
      )
      and not (
        coalesce(p.qual, '') ilike '%clinic_id%'
        or coalesce(p.with_check, '') ilike '%clinic_id%'
      )
  ) then
    raise exception 'FAIL: a clinic-owned policy is missing a clinic_id predicate';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename not in ('system_config', 'users', 'clinics', 'clinic_settings')
      and policyname = 'clinic_isolation'
  ) then
    raise exception 'FAIL: broad clinic_isolation policy still bypasses role-scoped writes';
  end if;

  if to_regprocedure('public.set_staff_panel_permissions(uuid,jsonb)') is null then
    raise exception 'FAIL: owner panel permission RPC is missing';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'panel_permissions', 'UPDATE') then
    raise exception 'FAIL: panel_permissions is directly writable by authenticated clients';
  end if;
  if not has_function_privilege('authenticated', 'public.set_staff_panel_permissions(uuid,jsonb)', 'EXECUTE') then
    raise exception 'FAIL: authenticated role cannot call owner panel permission RPC';
  end if;

  begin
    insert into public.clinics (name) values (v_marker || '_A') returning id into v_clinic_a;
    insert into public.clinics (name) values (v_marker || '_B') returning id into v_clinic_b;
    insert into public.users (name, username, role, active, is_deleted, auth_user_id, clinic_id)
    values (v_marker || ' user A', v_marker || '_A', 'owner', true, false,
            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', v_clinic_a);
    insert into public.users (name, username, role, active, is_deleted, auth_user_id, clinic_id)
    values (v_marker || ' user B', v_marker || '_B', 'owner', true, false,
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', v_clinic_b);

    set local role authenticated;
    perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
    select count(*) into v_visible from public.users where username like v_marker || '%';
    if v_visible <> 1 then
      raise exception 'FAIL: tenant A sees % synthetic users instead of 1', v_visible;
    end if;

    perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
    select count(*) into v_visible from public.users where username like v_marker || '%';
    if v_visible <> 1 then
      raise exception 'FAIL: tenant B sees % synthetic users instead of 1', v_visible;
    end if;
    reset role;
  exception when others then
    reset role;
    raise;
  end;

  raise notice 'STEP34 TENANT ISOLATION: ALL PASS';
end
$$;

rollback;
