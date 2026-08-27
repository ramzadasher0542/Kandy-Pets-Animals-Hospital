-- Tenant-scoped application reset.
-- The provider-only recovery boundary remains, but a reset can never affect
-- rows outside the signed-in provider's assigned clinic.

begin;

create or replace function public.purge_application_data_auth()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  table_name text;
  deleted_rows bigint;
  tables_cleared integer := 0;
  rows_cleared bigint := 0;
  preserved_users integer;
begin
  select u.clinic_id
    into v_clinic_id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.active = true
    and coalesce(u.is_deleted, false) = false
    and u.role = 'provider'
  limit 1;

  if v_clinic_id is null then
    raise exception 'The active account is not assigned to a clinic and cannot reset application data';
  end if;

  -- Delete child tables before their referenced parents. Every destructive
  -- statement includes the authenticated clinic scope explicitly.
  for table_name in
    with recursive scoped_tables as (
      select c.oid as table_oid, c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname not in ('users', 'clinics')
        and exists (
          select 1
          from pg_attribute a
          where a.attrelid = c.oid
            and a.attname = 'clinic_id'
            and a.attnum > 0
            and not a.attisdropped
        )
    ),
    fk_edges as (
      select conrelid as child_oid, confrelid as parent_oid
      from pg_constraint
      where contype = 'f'
    ),
    ancestors(start_oid, node_oid, depth) as (
      select table_oid, table_oid, 0
      from scoped_tables
      union all
      select ancestors.start_oid, fk_edges.parent_oid, ancestors.depth + 1
      from ancestors
      join fk_edges on fk_edges.child_oid = ancestors.node_oid
      where ancestors.depth < 100
    ),
    deletion_order as (
      select start_oid, max(depth) as depth
      from ancestors
      group by start_oid
    )
    select scoped_tables.relname
    from scoped_tables
    join deletion_order on deletion_order.start_oid = scoped_tables.table_oid
    order by deletion_order.depth desc, scoped_tables.relname
  loop
    execute format('delete from public.%I where clinic_id = $1', table_name)
      using v_clinic_id;
    get diagnostics deleted_rows = row_count;
    if deleted_rows > 0 then
      tables_cleared := tables_cleared + 1;
    end if;
    rows_cleared := rows_cleared + deleted_rows;
  end loop;

  select count(*)::integer
    into preserved_users
  from public.users;

  return jsonb_build_object(
    'clinic_id', v_clinic_id,
    'tables_cleared', tables_cleared,
    'rows_cleared', rows_cleared,
    'users_preserved', preserved_users
  );
end;
$$;

revoke all on function public.purge_application_data_auth() from public, anon;
grant execute on function public.purge_application_data_auth() to authenticated;

commit;
