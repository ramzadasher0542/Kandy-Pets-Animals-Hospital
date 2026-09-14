-- Read-only release test for clinic-specific boarding pricing.
-- Run after the authority migration on the disposable two-clinic target.

do $$
begin
  if to_regclass('public.boarding_pricing_profiles') is null
     or to_regclass('public.boarding_charge_events') is null
     or to_regprocedure('public.start_boarding_admission_auth(jsonb,uuid)') is null
     or to_regprocedure('public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)') is null
     or to_regprocedure('public.settle_boarding_account_auth(uuid,uuid)') is null then
    raise exception 'FAIL: boarding pricing authority objects are incomplete';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'boarding_records'
      and column_name = 'pricingSnapshot'
      and is_nullable = 'NO'
  ) then
    raise exception 'FAIL: active stays do not carry a pricing snapshot';
  end if;
  if has_table_privilege('authenticated', 'public.boarding_records', 'UPDATE')
     or has_table_privilege('authenticated', 'public.boarding_pricing_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.boarding_pricing_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.boarding_pricing_profiles', 'DELETE')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'DELETE') then
    raise exception 'FAIL: authenticated clients can directly mutate boarding financial state';
  end if;
  if has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'FAIL: legacy browser-authored boarding settlement remains executable';
  end if;
  raise notice 'BOARDING PRICING AUTHORITY TEST: PASS';
end
$$;
