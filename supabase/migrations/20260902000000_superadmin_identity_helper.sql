-- The tenant-entitlement migration sorts before the historical
-- 20260902_superadmin_control_plane migration, but its policies already call
-- is_current_user_superadmin(). Install the prerequisite helper first; the
-- historical control-plane migration replaces it with the same reviewed body.

begin;

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

commit;
