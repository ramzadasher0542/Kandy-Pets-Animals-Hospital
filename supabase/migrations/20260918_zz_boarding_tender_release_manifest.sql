-- Fail-closed release manifest for server-owned boarding tender and care events.
-- This migration is metadata-only: it refuses a target that is missing the
-- exact functions, grants, constraints, and security attributes required by
-- the application.

begin;

do $$
declare
  v_settle regprocedure := to_regprocedure('public.settle_boarding_account_auth(uuid,uuid,text)');
  v_charge regprocedure := to_regprocedure('public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)');
  v_start regprocedure := to_regprocedure('public.start_boarding_admission_auth(jsonb,uuid)');
  v_settle_config text[];
  v_settle_def text;
  v_event_constraint text;
begin
  if to_regclass('public.boarding_charge_events') is null
     or to_regclass('public.boarding_pricing_profiles') is null
     or v_settle is null
     or v_charge is null
     or v_start is null then
    raise exception 'RELEASE_SCHEMA_MISSING: boarding tender objects';
  end if;

  select proconfig, pg_get_functiondef(oid)
    into v_settle_config, v_settle_def
  from pg_proc
  where oid = v_settle;

  if not exists (
       select 1 from pg_proc
       where oid = v_settle and prosecdef
     )
     or not (coalesce(v_settle_config, '{}'::text[]) @> array['search_path=public']) then
    raise exception 'RELEASE_PRIVILEGE_INVALID: settlement security attributes';
  end if;

  if not has_function_privilege('authenticated', v_settle, 'EXECUTE')
     or has_function_privilege('anon', v_settle, 'EXECUTE')
     or not has_function_privilege('authenticated', v_charge, 'EXECUTE')
     or has_function_privilege('anon', v_charge, 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: boarding RPC grants';
  end if;

  if has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_unscoped(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: legacy boarding settlement remains browser-executable';
  end if;

  select pg_get_constraintdef(oid)
    into v_event_constraint
  from pg_constraint
  where conrelid = 'public.boarding_charge_events'::regclass
    and conname = 'boarding_charge_events_event_type_check';
  if coalesce(v_event_constraint, '') not like '%milk_cup%'
     or coalesce(v_settle_def, '') not like '%REFUND_TENDER_MUST_BE_CASH%' then
    raise exception 'RELEASE_SCHEMA_MISSING: tender/refund assertions';
  end if;

  if has_table_privilege('authenticated', 'public.boarding_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.boarding_records', 'UPDATE')
     or has_table_privilege('authenticated', 'public.boarding_records', 'DELETE')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'INSERT')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'UPDATE')
     or has_table_privilege('authenticated', 'public.boarding_charge_events', 'DELETE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: direct boarding financial writes';
  end if;

  if not exists (
       select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'uniq_active_boarding_cage_per_clinic'
     ) then
    raise exception 'RELEASE_INDEX_MISSING: active boarding cage scope';
  end if;
end
$$;

commit;
