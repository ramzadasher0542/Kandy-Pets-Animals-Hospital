-- Provider-only recovery boundary.
-- This is authorization DDL plus function replacement only; it does not mutate
-- application rows when the migration is applied.

begin;

create or replace function public.purge_application_data_auth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  table_list text;
  cleared_count integer := 0;
  preserved_users integer;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.users
    where auth_user_id = auth.uid()
      and active = true
      and coalesce(is_deleted, false) = false
      and role = 'provider'
  ) then
    raise exception 'Only the active provider can reset application data';
  end if;

  select string_agg(format('public.%I', tablename), ', ' order by tablename)
    into table_list
  from pg_tables
  where schemaname = 'public'
    and tablename <> 'users';

  if table_list is not null then
    execute format('truncate table %s restart identity', table_list);
    select count(*)::integer into cleared_count
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'users';
  end if;

  select count(*)::integer into preserved_users from public.users;

  return jsonb_build_object(
    'tables_cleared', cleared_count,
    'users_preserved', preserved_users
  );
end;
$$;

revoke all on function public.purge_application_data_auth() from public, anon;
grant execute on function public.purge_application_data_auth() to authenticated;

commit;
