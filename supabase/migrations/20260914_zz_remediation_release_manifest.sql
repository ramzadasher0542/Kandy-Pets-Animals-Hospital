-- Remediation P1.2/P7: fail closed when the target database is not the
-- schema required by the checked-in VHMS release.

-- The shift accounting primitive is service-role-only. Revoke the implicit
-- PUBLIC execute grant explicitly because revoking only from anon/authenticated
-- does not close the anonymous execution path.
revoke execute on function public.apply_shift_revenue(uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_shift_revenue(uuid, integer, integer, integer)
  to service_role;

do $$
declare
  v_index_def text;
begin
  if to_regclass('public.users') is null
     or to_regclass('public.clinics') is null
     or to_regclass('public.checkout_effects') is null
     or to_regclass('public.boarding_pricing_profiles') is null
     or to_regclass('public.boarding_charge_events') is null then
    raise exception 'RELEASE_SCHEMA_MISSING: required tenant or checkout table is absent';
  end if;

  if to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.commit_checkout_invoice_and_stock(jsonb,jsonb)') is null
     or to_regprocedure('public.process_checkout_effects_auth(uuid)') is null
      or to_regprocedure('public.process_pending_checkout_effects_auth()') is null
      or to_regprocedure('public.update_invoice_customer_auth(uuid,text,text)') is null
      or to_regprocedure('public.set_staff_panel_permissions(uuid,jsonb)') is null
     or to_regprocedure('public.manage_staff_user(uuid,text,text,text,text,boolean,boolean)') is null
     or to_regprocedure('public.delete_staff_user(uuid)') is null
     or to_regprocedure('public.write_auth_audit(text,text,boolean,boolean,text)') is null
     or to_regprocedure('public.write_deletion_audit(text,text,text,boolean,text,boolean)') is null
     or to_regprocedure('public.save_boarding_pricing_profile_auth(jsonb)') is null
     or to_regprocedure('public.start_boarding_admission_auth(jsonb,uuid)') is null
      or to_regprocedure('public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)') is null
      or to_regprocedure('public.settle_boarding_account_auth(uuid,uuid)') is null
      or to_regprocedure('public.open_shift_auth(uuid,integer)') is null
      or to_regprocedure('public.restore_shift_auth(jsonb)') is null
      or to_regprocedure('public.add_cash_adjustment_auth(jsonb)') is null
      or to_regprocedure('public.void_invoice_and_reverse_revenue_auth(uuid)') is null
      or to_regprocedure('public.set_boarding_billed_auth(uuid,boolean)') is null
      or to_regprocedure('public.assert_boarding_cage_available()') is null
      or to_regprocedure('public.attach_boarding_invoice_source_ref()') is null
      or to_regprocedure('public.process_boarding_settlement_effect()') is null then
    raise exception 'RELEASE_SCHEMA_MISSING: required RPC signature is absent';
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
    raise exception 'RELEASE_SCHEMA_INVALID: current_clinic_id security attributes are incorrect';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid = to_regprocedure('public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)')
      and pg_get_functiondef(p.oid) like '%CATALOG_ITEM_NOT_FOUND%'
      and pg_get_functiondef(p.oid) like '%v_canonical_items%'
      and pg_get_functiondef(p.oid) like '%v_created_by%'
      and pg_get_functiondef(p.oid) like '%CLINIC_SCOPE_MISMATCH%'
  ) then
    raise exception 'RELEASE_SCHEMA_INVALID: checkout implementation is not server-authoritative';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'commit_checkout_invoice_and_stock',
        'process_checkout_effects_auth',
         'process_pending_checkout_effects_auth',
         'update_invoice_customer_auth',
         'set_staff_panel_permissions',
        'manage_staff_user',
        'delete_staff_user',
        'write_auth_audit',
        'write_deletion_audit',
        'save_boarding_pricing_profile_auth',
        'start_boarding_admission_auth',
         'record_boarding_charge_auth',
         'update_boarding_care_auth',
         'set_boarding_billed_auth',
         'settle_boarding_account_auth',
         'open_shift_auth',
         'restore_shift_auth',
         'add_cash_adjustment_auth',
         'void_invoice_and_reverse_revenue_auth'
      )
      and (not p.prosecdef or not (p.proconfig @> array['search_path=public']::text[]))
  ) then
    raise exception 'RELEASE_SCHEMA_INVALID: remediation RPC security attributes are incorrect';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'checkout_effects'
      and column_name = 'clinic_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'RELEASE_SCHEMA_INVALID: checkout_effects.clinic_id must be NOT NULL';
  end if;

   if not exists (
     select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'uniq_shifts_single_open'
       and indexdef ilike '%(clinic_id)%'
  ) then
     raise exception 'RELEASE_SCHEMA_INVALID: open-shift uniqueness is not clinic-scoped';
   end if;

   if not exists (
     select 1 from pg_indexes
     where schemaname = 'public'
       and indexname = 'uniq_active_boarding_cage_per_clinic'
       and indexdef ilike '%(clinic_id, "cageNumber")%'
       and indexdef ilike '%status = ''active''%'
   ) then
     raise exception 'RELEASE_SCHEMA_INVALID: active boarding cage uniqueness is absent';
   end if;

   if not exists (
     select 1
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'boarding_records'
       and t.tgname = 'assert_boarding_cage_available_before_write'
       and not t.tgisinternal
   ) or not exists (
     select 1
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'invoices'
       and t.tgname = 'attach_boarding_invoice_source_ref_before_insert'
       and not t.tgisinternal
   ) or not exists (
     select 1
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'invoices'
       and t.tgname = 'zz_process_boarding_settlement_effect_after_insert'
       and not t.tgisinternal
   ) then
     raise exception 'RELEASE_SCHEMA_INVALID: boarding integrity triggers are absent';
   end if;

  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'checkout_effects'
      and c.relrowsecurity
  ) then
    raise exception 'RELEASE_SCHEMA_INVALID: checkout_effects RLS is disabled';
  end if;

  if has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'active', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'is_deleted', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'auth_user_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.users', 'clinic_id', 'UPDATE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: authenticated can update sensitive users columns';
  end if;

  if has_table_privilege('authenticated', 'public.auth_audit', 'INSERT')
      or has_table_privilege('authenticated', 'public.deletion_audit', 'INSERT')
      or has_table_privilege('authenticated', 'public.invoices', 'INSERT')
      or has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
       or has_table_privilege('authenticated', 'public.invoices', 'DELETE')
       or has_table_privilege('authenticated', 'public.boarding_records', 'UPDATE')
       or has_table_privilege('authenticated', 'public.boarding_charge_events', 'INSERT')
       or has_table_privilege('authenticated', 'public.cash_adjustments', 'INSERT')
       or has_table_privilege('authenticated', 'public.cash_adjustments', 'UPDATE')
       or has_table_privilege('authenticated', 'public.cash_adjustments', 'DELETE')
       or has_table_privilege('authenticated', 'public.shift_reconciliations', 'INSERT')
       or has_table_privilege('authenticated', 'public.shift_reconciliations', 'UPDATE')
       or has_table_privilege('authenticated', 'public.shift_reconciliations', 'DELETE')
       or has_table_privilege('authenticated', 'public.shifts', 'INSERT')
      or has_table_privilege('authenticated', 'public.shifts', 'UPDATE')
      or has_table_privilege('authenticated', 'public.shifts', 'DELETE') then
     raise exception 'RELEASE_PRIVILEGE_INVALID: authenticated retains a direct privileged write';
  end if;

  if not has_function_privilege('authenticated', 'public.commit_checkout_invoice_and_stock(jsonb,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.process_checkout_effects_auth(uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.process_pending_checkout_effects_auth()', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.update_invoice_customer_auth(uuid,text,text)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.set_staff_panel_permissions(uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.manage_staff_user(uuid,text,text,text,text,boolean,boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.write_auth_audit(text,text,boolean,boolean,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.save_boarding_pricing_profile_auth(jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.start_boarding_admission_auth(jsonb,uuid)', 'EXECUTE')
      or not has_function_privilege('authenticated', 'public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.settle_boarding_account_auth(uuid,uuid)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.open_shift_auth(uuid,integer)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.restore_shift_auth(jsonb)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.add_cash_adjustment_auth(jsonb)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.set_boarding_billed_auth(uuid,boolean)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.void_invoice_and_reverse_revenue_auth(uuid)', 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: required authenticated RPC grant is absent';
  end if;

  if has_function_privilege('authenticated', 'public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: legacy client-authored boarding ledger remains executable';
  end if;

  if has_function_privilege('anon', 'public.apply_shift_revenue(uuid,integer,integer,integer)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.apply_shift_revenue(uuid,integer,integer,integer)', 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: shift accounting primitive remains browser-executable';
  end if;

  if has_function_privilege('anon', 'public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)', 'EXECUTE')
      or has_function_privilege('authenticated', 'public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)', 'EXECUTE') then
    raise exception 'RELEASE_PRIVILEGE_INVALID: checkout implementation remains browser-executable';
  end if;

  select indexdef into v_index_def
  from pg_indexes
  where schemaname = 'public'
    and indexname = 'idx_clinic_queue_clinic_status_service';
  if v_index_def is null then
    raise exception 'RELEASE_INDEX_MISSING: clinic queue operational index is absent';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_invoices_clinic_date_status')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_appointments_clinic_date_status')
     or not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_inventory_batches_clinic_item_expiry') then
    raise exception 'RELEASE_INDEX_MISSING: predicate-aware operational index is absent';
  end if;

  raise notice 'VHMS RELEASE MANIFEST: PASS';
end
$$;
