-- Read-only release manifest test. This is safe to run in the SQL Editor after
-- the remediation migrations and must fail before the target is release-ready.

do $$
begin
  if to_regclass('public.checkout_effects') is null
     or to_regprocedure('public.process_checkout_effects_auth(uuid)') is null
     or to_regprocedure('public.update_invoice_customer_auth(uuid,text,text)') is null
     or to_regprocedure('public.set_staff_panel_permissions(uuid,jsonb)') is null
     or to_regprocedure('public.manage_staff_user(uuid,text,text,text,text,boolean,boolean)') is null
     or to_regclass('public.boarding_pricing_profiles') is null
     or to_regprocedure('public.settle_boarding_account_auth(uuid,uuid)') is null then
    raise exception 'FAIL: remediation release objects are incomplete';
  end if;
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'uniq_shifts_single_open'
      and indexdef not ilike '%(clinic_id)%'
  ) then
    raise exception 'FAIL: open-shift index is global';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'current_clinic_id'
      and p.prosecdef
      and p.provolatile = 's'
      and p.proconfig @> array['search_path=public']::text[]
  ) then
    raise exception 'FAIL: current_clinic_id security attributes are incorrect';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'auth_user_id', 'UPDATE')
      or has_table_privilege('authenticated', 'public.auth_audit', 'INSERT')
      or has_table_privilege('authenticated', 'public.invoices', 'INSERT')
      or has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
      or has_table_privilege('authenticated', 'public.invoices', 'DELETE')
      or has_table_privilege('authenticated', 'public.boarding_records', 'UPDATE')
     or has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'FAIL: sensitive direct privilege remains';
  end if;
  if not has_function_privilege('authenticated', 'public.set_staff_panel_permissions(uuid,jsonb)', 'EXECUTE') then
    raise exception 'FAIL: owner panel permission RPC is not executable by authenticated staff';
  end if;
  if not has_function_privilege('authenticated', 'public.update_invoice_customer_auth(uuid,text,text)', 'EXECUTE') then
    raise exception 'FAIL: invoice customer update RPC is not executable by authenticated staff';
  end if;
  raise notice 'VHMS RELEASE MANIFEST TEST: PASS';
end
$$;
