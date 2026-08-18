-- Reset the clinic workspace without deleting login accounts or passwords.
-- public.users contains the app roles and Auth identity links. Supabase Auth
-- passwords live in auth.users and are never touched by this function.

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
      and role in ('admin', 'provider')
  ) then
    raise exception 'Only an active administrator or provider can reset application data';
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
