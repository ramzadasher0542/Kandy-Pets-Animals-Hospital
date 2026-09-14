-- Remediation P2.1 metadata and tenant-boundary checks.
-- Run in a disposable or staging database after the remediation migration.

do $$
begin
  if to_regclass('public.checkout_effects') is null then
    raise exception 'FAIL: checkout_effects is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkout_effects'
      and column_name = 'clinic_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'FAIL: checkout_effects.clinic_id is not non-null';
  end if;
  if to_regprocedure('public.process_checkout_effects_auth(uuid)') is null
     or to_regprocedure('public.process_pending_checkout_effects_auth()') is null then
    raise exception 'FAIL: checkout effect RPCs are missing';
  end if;
  if not has_function_privilege('authenticated', 'public.process_checkout_effects_auth(uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.process_pending_checkout_effects_auth()', 'EXECUTE') then
    raise exception 'FAIL: authenticated effect RPC grants are missing';
  end if;
  if to_regprocedure('public.update_invoice_customer_auth(uuid,text,text)') is null
     or not has_function_privilege('authenticated', 'public.update_invoice_customer_auth(uuid,text,text)', 'EXECUTE') then
    raise exception 'FAIL: narrow invoice customer update RPC is missing';
  end if;
  if has_table_privilege('authenticated', 'public.invoices', 'INSERT')
     or has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     or has_table_privilege('authenticated', 'public.invoices', 'DELETE') then
    raise exception 'FAIL: authenticated can directly mutate invoices';
  end if;
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'uniq_shifts_single_open'
      and indexdef not ilike '%(clinic_id)%'
  ) then
    raise exception 'FAIL: open-shift index remains global';
  end if;
  raise notice 'REMEDIATION CHECKOUT EFFECTS METADATA: PASS';
end
$$;
