-- Superadmin control-plane boundary.
--
-- Tenant staff may read the global runtime configuration required to boot the
-- application, but only a linked users.is_superadmin identity may change:
--   * system_config (global application/infrastructure configuration)
--   * clinics (tenant registry)
--   * users (staff identity, role, clinic, and Auth link metadata)
--
-- The browser gate is only UX. These policies are the security boundary.

begin;

alter table public.users
  add column if not exists is_superadmin boolean not null default false;

create or replace function public.is_current_user_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_user_id = auth.uid()
      and u.active = true
      and coalesce(u.is_deleted, false) = false
      and u.is_superadmin = true
  );
$$;

revoke all on function public.is_current_user_superadmin() from public, anon;
grant execute on function public.is_current_user_superadmin() to authenticated;

alter table public.system_config enable row level security;
alter table public.clinics enable row level security;
alter table public.users enable row level security;

-- Remove every existing policy on these control-plane tables. Leaving an old
-- FOR ALL or manager-write policy in place would make the new boundary additive
-- instead of restrictive.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('system_config', 'clinics', 'users')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

-- Runtime configuration is readable by active staff so every tenant can boot,
-- but mutation is reserved for the clinic-less control-plane identity.
create policy system_config_staff_read
  on public.system_config
  for select
  to authenticated
  using (public.is_staff());

create policy system_config_superadmin_insert
  on public.system_config
  for insert
  to authenticated
  with check (public.is_current_user_superadmin());

create policy system_config_superadmin_update
  on public.system_config
  for update
  to authenticated
  using (public.is_current_user_superadmin())
  with check (public.is_current_user_superadmin());

revoke delete, truncate on public.system_config from anon, authenticated;
grant select, insert, update on public.system_config to authenticated;

-- Staff metadata is tenant-readable, but role, clinic assignment, Auth links,
-- and the superadmin bit are never writable by a tenant role.
create policy users_staff_read
  on public.users
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    or public.is_current_user_superadmin()
  );

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

revoke delete, truncate on public.users from anon, authenticated;
grant select (id, name, username, role, avatar_color, active, is_deleted, created_at, updated_at, auth_user_id, clinic_id, is_superadmin)
  on public.users to authenticated;
grant insert, update on public.users to authenticated;

-- The tenant registry is not a tenant-owned table. Tenants may see their own
-- registry row; only the control plane may create or edit clinics.
create policy clinics_staff_read
  on public.clinics
  for select
  to authenticated
  using (
    id = public.current_clinic_id()
    or public.is_current_user_superadmin()
  );

create policy clinics_superadmin_insert
  on public.clinics
  for insert
  to authenticated
  with check (public.is_current_user_superadmin());

create policy clinics_superadmin_update
  on public.clinics
  for update
  to authenticated
  using (public.is_current_user_superadmin())
  with check (public.is_current_user_superadmin());

revoke delete, truncate on public.clinics from anon, authenticated;
grant select, insert, update on public.clinics to authenticated;

-- Re-assert the existing per-clinic feature-flag boundary in case an earlier
-- policy was edited manually in the dashboard.
alter table public.clinic_settings enable row level security;
drop policy if exists clinic_settings_read on public.clinic_settings;
drop policy if exists clinic_settings_superadmin_write on public.clinic_settings;

create policy clinic_settings_read
  on public.clinic_settings
  for select
  to authenticated
  using (
    clinic_id = public.current_clinic_id()
    or public.is_current_user_superadmin()
  );

create policy clinic_settings_superadmin_write
  on public.clinic_settings
  for all
  to authenticated
  using (public.is_current_user_superadmin())
  with check (public.is_current_user_superadmin());

revoke delete on public.clinic_settings from anon, authenticated;
grant select, insert, update on public.clinic_settings to authenticated;

commit;
