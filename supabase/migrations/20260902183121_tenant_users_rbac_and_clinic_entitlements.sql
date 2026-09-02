-- Tenant staff-management boundary and per-clinic product entitlements.
--
-- Owners and managers may manage staff only inside their assigned clinic. The
-- is_superadmin flag remains immutable to tenant identities. Clinics and
-- clinic_settings remain Super Admin-only write surfaces.

begin;

-- Network-level entitlements are separate from tenant role permissions. An
-- empty array is intentional: it means the Super Admin disabled every panel.
alter table public.clinic_settings
  add column if not exists enabled_panels jsonb not null default
    '["dashboard","reports","pos","appointments","pets","customers","vaccinations","examinations","laboratory","boarding","grooming","inventory","suppliers","invoices","shift"]'::jsonb;

comment on column public.clinic_settings.enabled_panels is
  'Super Admin-controlled tenant product surface; an array of panel IDs.';

-- Replace the Phase 10 users write policies without changing the clinic or
-- clinic_settings control-plane policies.
drop policy if exists users_superadmin_insert on public.users;
drop policy if exists users_superadmin_update on public.users;
drop policy if exists users_tenant_insert on public.users;
drop policy if exists users_tenant_update on public.users;

create policy users_superadmin_insert
  on public.users
  for insert
  to authenticated
  with check (public.is_current_user_superadmin());

create policy users_superadmin_update
  on public.users
  for update
  to authenticated
  using (public.is_current_user_superadmin())
  with check (public.is_current_user_superadmin());

create policy users_tenant_insert
  on public.users
  for insert
  to authenticated
  with check (
    public.current_staff_role() in ('owner', 'manager')
    and clinic_id = public.current_clinic_id()
    and coalesce(is_superadmin, false) = false
  );

create policy users_tenant_update
  on public.users
  for update
  to authenticated
  using (
    public.current_staff_role() in ('owner', 'manager')
    and clinic_id = public.current_clinic_id()
    and coalesce(is_superadmin, false) = false
  )
  with check (
    public.current_staff_role() in ('owner', 'manager')
    and clinic_id = public.current_clinic_id()
    and coalesce(is_superadmin, false) = false
  );

commit;
