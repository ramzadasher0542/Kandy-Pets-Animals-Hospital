-- Enterprise tenant boundary and owner-managed employee panel access.
--
-- The historical Auth policies checked only `is_staff()`. Those policies were
-- additive with the clinic policies, so a linked employee could see rows from
-- every clinic. This migration replaces every non-control-plane policy with a
-- clinic-scoped policy and removes the broad ALL policy that bypassed role
-- checks on writes.

begin;

do $$
begin
  if to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.is_current_user_superadmin()') is null then
    raise exception 'Tenant identity helpers are required before the tenant RLS boundary';
  end if;
end
$$;

-- A NULL value means the employee follows the built-in role defaults. A JSON
-- array means the clinic owner has explicitly chosen that employee's panels.
alter table public.users
  add column if not exists panel_permissions jsonb;

comment on column public.users.panel_permissions is
  'Owner-managed employee panel IDs. NULL means use the built-in role defaults.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.users'::regclass
      and conname = 'users_panel_permissions_array_check'
  ) then
    alter table public.users
      add constraint users_panel_permissions_array_check
      check (panel_permissions is null or jsonb_typeof(panel_permissions) = 'array');
  end if;
end
$$;

-- Keep the sensitive panel-permission column writable only through the
-- owner-only RPC below. Staff metadata remains writable through the existing
-- tenant policy and only through the non-sensitive columns listed here.
revoke insert, update on public.users from authenticated;
grant insert (id, name, username, role, avatar_color, active, is_deleted, auth_user_id, clinic_id)
  on public.users to authenticated;
grant update (name, username, role, avatar_color, active, is_deleted, auth_user_id, clinic_id)
  on public.users to authenticated;
grant select (id, name, username, role, avatar_color, active, is_deleted, created_at, updated_at,
              auth_user_id, clinic_id, is_superadmin, panel_permissions)
  on public.users to authenticated;

create or replace function public.set_staff_panel_permissions(
  p_user_id uuid,
  p_panel_permissions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_target_role text;
begin
  if auth.uid() is null or public.current_staff_role() <> 'owner' then
    raise exception 'OWNER_REQUIRED';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  if p_panel_permissions is not null
     and jsonb_typeof(p_panel_permissions) <> 'array' then
    raise exception 'INVALID_PANEL_PERMISSIONS';
  end if;

  if p_panel_permissions is not null and exists (
    select 1
    from jsonb_array_elements_text(p_panel_permissions) as panel(id)
    where panel.id not in (
      'dashboard', 'reports', 'pos', 'appointments', 'pets', 'customers',
      'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming',
      'inventory', 'suppliers', 'invoices', 'shift'
    )
  ) then
    raise exception 'INVALID_PANEL_PERMISSIONS';
  end if;

  select role
    into v_target_role
  from public.users
  where id = p_user_id
    and clinic_id = v_clinic_id
    and coalesce(is_deleted, false) = false;

  if not found or v_target_role = 'owner' then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;

  update public.users
  set panel_permissions = p_panel_permissions,
      updated_at = now()
  where id = p_user_id
    and clinic_id = v_clinic_id
    and coalesce(is_superadmin, false) = false
    and coalesce(is_deleted, false) = false;

  if not found then
    raise exception 'EMPLOYEE_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.set_staff_panel_permissions(uuid, jsonb) from public, anon;
grant execute on function public.set_staff_panel_permissions(uuid, jsonb) to authenticated;

-- Remove every additive policy from clinic-owned tables. The replacement set
-- below intentionally does not keep the old clinic_isolation FOR ALL policy:
-- that policy made role-specific INSERT/UPDATE policies ineffective because
-- PostgreSQL combines permissive policies with OR.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select p.tablename, p.policyname
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename not in ('system_config', 'users', 'clinics', 'clinic_settings')
      and exists (
        select 1
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name = p.tablename
          and c.column_name = 'clinic_id'
      )
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end
$$;

do $$
declare
  table_name text;
  v_all_staff text := 'ARRAY[''cashier'',''veterinarian'',''groomer'',''manager'',''owner'',''admin'',''provider'']';
  v_clinical_staff text := 'ARRAY[''veterinarian'',''manager'',''owner'',''admin'',''provider'']';
  v_manager_staff text := 'ARRAY[''owner'',''manager'',''admin'',''provider'']';
  v_cash_staff text := 'ARRAY[''cashier'',''owner'',''manager'',''admin'',''provider'']';
  v_scope text := '(public.is_current_user_superadmin() OR (public.is_staff() AND clinic_id = public.current_clinic_id()))';
begin
  -- Ordinary operational records: every active clinic staff member may read;
  -- the role ceiling still controls direct writes.
  foreach table_name in array array[
    'appointments', 'boarding_records', 'clients', 'clinic_queue',
    'grooming_logs', 'lab_results', 'notifications', 'pets', 'system_alerts',
    'vaccinations'
  ] loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('create policy tenant_staff_select on public.%I for select to authenticated using %s', table_name, v_scope);
    execute format('create policy tenant_role_insert on public.%I for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', table_name, v_all_staff);
    execute format('create policy tenant_role_update on public.%I for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', table_name, v_all_staff, v_all_staff);
  end loop;

  -- Inventory catalog and financial setup are manager-owned.
  foreach table_name in array array['inventory', 'inventory_batches', 'inventory_categories', 'suppliers'] loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('create policy tenant_staff_select on public.%I for select to authenticated using %s', table_name, v_scope);
    execute format('create policy tenant_manager_insert on public.%I for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', table_name, v_manager_staff);
    execute format('create policy tenant_manager_update on public.%I for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', table_name, v_manager_staff, v_manager_staff);
  end loop;

  if to_regclass('public.medical_records') is not null then
    execute format('create policy tenant_staff_select on public.medical_records for select to authenticated using %s', v_scope);
    execute format('create policy tenant_clinical_insert on public.medical_records for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_clinical_staff);
    execute format('create policy tenant_clinical_update on public.medical_records for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_clinical_staff, v_clinical_staff);
  end if;

  if to_regclass('public.invoices') is not null then
    execute format('create policy tenant_staff_select on public.invoices for select to authenticated using %s', v_scope);
    execute format('create policy tenant_finance_insert on public.invoices for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff);
    execute format('create policy tenant_finance_update on public.invoices for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff, v_manager_staff);
  end if;

  if to_regclass('public.shifts') is not null then
    execute format('create policy tenant_staff_select on public.shifts for select to authenticated using %s', v_scope);
    execute format('create policy tenant_shift_insert on public.shifts for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_cash_staff);
  end if;

  if to_regclass('public.shift_reconciliations') is not null then
    execute format('create policy tenant_staff_select on public.shift_reconciliations for select to authenticated using %s', v_scope);
    execute format('create policy tenant_shift_reconciliation_insert on public.shift_reconciliations for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_cash_staff);
    execute format('create policy tenant_shift_reconciliation_update on public.shift_reconciliations for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_cash_staff, v_cash_staff);
  end if;

  if to_regclass('public.cash_adjustments') is not null then
    execute format('create policy tenant_staff_select on public.cash_adjustments for select to authenticated using %s', v_scope);
    execute format('create policy tenant_cash_insert on public.cash_adjustments for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_cash_staff);
    execute format('create policy tenant_cash_update on public.cash_adjustments for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff, v_manager_staff);
  end if;

  -- Staff operations and audits retain their existing read/write ownership,
  -- but every predicate is now tenant-scoped.
  if to_regclass('public.staff_profiles') is not null then
    execute format('create policy tenant_staff_select on public.staff_profiles for select to authenticated using %s', v_scope);
    execute format('create policy tenant_manager_insert on public.staff_profiles for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff);
    execute format('create policy tenant_manager_update on public.staff_profiles for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff, v_manager_staff);
  end if;

  if to_regclass('public.time_entries') is not null then
    execute format('create policy tenant_staff_select on public.time_entries for select to authenticated using %s', v_scope);
    execute format('create policy tenant_staff_insert on public.time_entries for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.is_staff() and clinic_id = public.current_clinic_id()))');
    execute format('create policy tenant_staff_update on public.time_entries for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.is_staff() and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.is_staff() and clinic_id = public.current_clinic_id()))');
  end if;

  if to_regclass('public.schedule_entries') is not null then
    execute format('create policy tenant_staff_select on public.schedule_entries for select to authenticated using %s', v_scope);
    execute format('create policy tenant_manager_insert on public.schedule_entries for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff);
    execute format('create policy tenant_manager_update on public.schedule_entries for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff, v_manager_staff);
  end if;

  if to_regclass('public.payslips') is not null then
    execute format('create policy tenant_manager_select on public.payslips for select to authenticated using ((public.is_current_user_superadmin()) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff);
    execute format('create policy tenant_manager_insert on public.payslips for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff);
    execute format('create policy tenant_manager_update on public.payslips for update to authenticated using ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id())) with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', v_manager_staff, v_manager_staff);
  end if;

  foreach table_name in array array['deletion_audit', 'auth_audit'] loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    execute format('create policy tenant_manager_select on public.%I for select to authenticated using ((public.is_current_user_superadmin()) or (public.current_staff_role() = any (%s) and clinic_id = public.current_clinic_id()))', table_name, v_manager_staff);
    execute format('create policy tenant_staff_insert on public.%I for insert to authenticated with check ((public.is_current_user_superadmin() and clinic_id is not null) or (public.is_staff() and clinic_id = public.current_clinic_id()))', table_name);
  end loop;
end
$$;

commit;
