-- Canonical tenant identity helper required by later RLS and RPC migrations.
-- The base schema must create public.users before this migration runs.

do $$
begin
  if to_regclass('public.users') is null then
    raise exception 'BASE_SCHEMA_REQUIRED: public.users is missing';
  end if;
end
$$;

create or replace function public.current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select clinic_id
  from public.users
  where auth_user_id = auth.uid()
    and active = true
    and coalesce(is_deleted, false) = false
  limit 1;
$$;

revoke all on function public.current_clinic_id() from public, anon;
grant execute on function public.current_clinic_id() to authenticated, service_role;
