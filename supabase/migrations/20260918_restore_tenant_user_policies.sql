-- Restore tenant staff-management policies missing from staging.
-- Super Admin policies remain unchanged; tenant users cannot create or edit
-- super-admin identities and must stay inside their current clinic.

begin;

do $$
begin
  if to_regclass('public.users') is null
     or to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.current_staff_role()') is null then
    raise exception 'TENANT_USER_POLICY_PREREQUISITES_REQUIRED';
  end if;
end
$$;

drop policy if exists users_tenant_insert on public.users;
drop policy if exists users_tenant_update on public.users;

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
