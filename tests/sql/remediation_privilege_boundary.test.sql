-- Read-only privilege boundary assertions for the enterprise release gate.

do $$
declare
  v_insecure integer;
begin
  select count(*)
    into v_insecure
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=public']);
  if v_insecure > 0 then
    raise exception 'PRIVILEGE_BOUNDARY_FAIL: security definer search_path';
  end if;

  if has_table_privilege('authenticated', 'public.invoices', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     or has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     or has_table_privilege('authenticated', 'public.shifts', 'INSERT')
     or has_table_privilege('authenticated', 'public.shifts', 'UPDATE')
     or has_table_privilege('authenticated', 'public.shifts', 'DELETE')
     or has_table_privilege('authenticated', 'public.users', 'INSERT')
     or has_table_privilege('authenticated', 'public.users', 'UPDATE')
     or has_table_privilege('authenticated', 'public.users', 'DELETE') then
    raise exception 'PRIVILEGE_BOUNDARY_FAIL: direct sensitive writes';
  end if;

  if has_column_privilege('authenticated', 'public.users', 'role', 'INSERT')
     or has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'clinic_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.users', 'clinic_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'auth_user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.users', 'auth_user_id', 'UPDATE') then
    raise exception 'PRIVILEGE_BOUNDARY_FAIL: sensitive user columns';
  end if;

  if has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_unscoped(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.settle_boarding_account_auth(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'PRIVILEGE_BOUNDARY_FAIL: legacy or anonymous privileged RPC';
  end if;

  raise notice 'PRIVILEGE_BOUNDARY_TEST: PASS';
end
$$;
