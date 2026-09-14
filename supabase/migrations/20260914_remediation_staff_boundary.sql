-- Remediation P3.1/P3.2: remove direct tenant writes to public.users and route
-- staff changes through an owner-only, clinic-scoped RPC.

begin;

do $$
begin
  if to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.current_staff_role()') is null then
    raise exception 'TENANT_IDENTITY_HELPERS_REQUIRED';
  end if;
end
$$;

revoke all privileges on public.users from authenticated;
revoke all privileges (id, name, username, role, avatar_color, active, is_deleted,
  created_at, updated_at, auth_user_id, clinic_id, is_superadmin, panel_permissions)
  on public.users from authenticated;
grant select (id, name, username, role, avatar_color, active, is_deleted,
  created_at, updated_at, auth_user_id, clinic_id, is_superadmin, panel_permissions)
  on public.users to authenticated;

create or replace function public.manage_staff_user(
  p_user_id uuid,
  p_name text,
  p_username text,
  p_role text,
  p_avatar_color text,
  p_active boolean,
  p_is_deleted boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_existing public.users;
begin
  if auth.uid() is null or public.current_staff_role() <> 'owner' then
    raise exception 'OWNER_REQUIRED';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;
  if p_user_id is null or nullif(trim(p_name), '') is null or nullif(trim(p_username), '') is null then
    raise exception 'INVALID_STAFF_PAYLOAD';
  end if;
  if p_role not in ('cashier', 'veterinarian', 'manager', 'groomer') then
    raise exception 'ROLE_NOT_ALLOWED';
  end if;

  select * into v_existing
  from public.users
  where id = p_user_id
  for update;

  if found then
    if v_existing.clinic_id is distinct from v_clinic_id
       or coalesce(v_existing.is_superadmin, false)
       or v_existing.role in ('owner', 'admin', 'provider') then
      raise exception 'STAFF_TARGET_PROTECTED';
    end if;
    if v_existing.auth_user_id = auth.uid() then
      raise exception 'SELF_TARGET_FORBIDDEN';
    end if;

    update public.users
    set name = trim(p_name),
        username = trim(p_username),
        role = p_role,
        avatar_color = p_avatar_color,
        active = case when coalesce(p_is_deleted, false) then false else coalesce(p_active, true) end,
        is_deleted = coalesce(p_is_deleted, false),
        updated_at = now()
    where id = p_user_id
      and clinic_id = v_clinic_id;
  else
    if coalesce(p_is_deleted, false) then
      raise exception 'STAFF_TARGET_NOT_FOUND';
    end if;

    insert into public.users (
      id, name, username, role, avatar_color, active, is_deleted, clinic_id
    ) values (
      p_user_id, trim(p_name), trim(p_username), p_role, p_avatar_color,
      coalesce(p_active, true), false, v_clinic_id
    );
  end if;
end;
$$;

create or replace function public.delete_staff_user(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_target public.users;
begin
  if auth.uid() is null or public.current_staff_role() <> 'owner' then
    raise exception 'OWNER_REQUIRED';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  select * into v_target
  from public.users
  where id = p_user_id
    and clinic_id = v_clinic_id
  for update;
  if not found or coalesce(v_target.is_superadmin, false)
     or v_target.role in ('owner', 'admin', 'provider')
     or v_target.auth_user_id = auth.uid() then
    raise exception 'STAFF_TARGET_PROTECTED';
  end if;

  update public.users
  set active = false,
      is_deleted = true,
      updated_at = now()
  where id = p_user_id
    and clinic_id = v_clinic_id;
end;
$$;

revoke all on function public.manage_staff_user(uuid, text, text, text, text, boolean, boolean) from public, anon;
revoke all on function public.delete_staff_user(uuid) from public, anon;
grant execute on function public.manage_staff_user(uuid, text, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.delete_staff_user(uuid) to authenticated;

commit;
