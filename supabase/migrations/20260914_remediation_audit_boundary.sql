-- Remediation P5.1: derive audit actor, clinic, and timestamps in Postgres.

begin;

revoke insert, update, delete on public.auth_audit from authenticated;
revoke insert, update, delete on public.deletion_audit from authenticated;

create or replace function public.write_auth_audit(
  p_action text,
  p_action_description text,
  p_allowed boolean,
  p_is_override boolean,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users;
  v_clinic_id uuid;
begin
  if auth.uid() is null or nullif(trim(p_action), '') is null then
    raise exception 'AUDIT_ACTOR_REQUIRED';
  end if;

  select * into v_actor
  from public.users
  where auth_user_id = auth.uid()
    and active = true
    and coalesce(is_deleted, false) = false
  for update;
  if not found then
    raise exception 'AUDIT_ACTOR_NOT_FOUND';
  end if;
  v_clinic_id := v_actor.clinic_id;

  insert into public.auth_audit (
    id, action, action_description, attempted_by, attempted_by_name,
    attempted_by_role, allowed, is_override, approved_by, approved_by_name,
    approved_by_role, reason, timestamp, created_at, updated_at, clinic_id
  ) values (
    gen_random_uuid(), trim(p_action), coalesce(p_action_description, ''),
    v_actor.id, v_actor.name, v_actor.role, coalesce(p_allowed, false),
    false,
    case when coalesce(p_allowed, false) then v_actor.id else null end,
    case when coalesce(p_allowed, false) then v_actor.name else null end,
    case when coalesce(p_allowed, false) then v_actor.role else null end,
    p_reason, now(), now(), now(), v_clinic_id
  );
end;
$$;

create or replace function public.write_deletion_audit(
  p_entity_type text,
  p_entity_id text,
  p_entity_name text,
  p_had_history boolean,
  p_history_summary text,
  p_override_confirmed boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor public.users;
  v_clinic_id uuid;
begin
  if auth.uid() is null or p_entity_type not in ('client', 'pet') or nullif(trim(p_entity_id), '') is null then
    raise exception 'AUDIT_ENTITY_REQUIRED';
  end if;

  select * into v_actor
  from public.users
  where auth_user_id = auth.uid()
    and active = true
    and coalesce(is_deleted, false) = false
  for update;
  if not found then
    raise exception 'AUDIT_ACTOR_NOT_FOUND';
  end if;
  v_clinic_id := v_actor.clinic_id;

  if p_entity_type = 'client' and not exists (
    select 1 from public.clients where client_id = p_entity_id and clinic_id = v_clinic_id
  ) then
    raise exception 'AUDIT_ENTITY_NOT_FOUND';
  end if;
  if p_entity_type = 'pet' and not exists (
    select 1 from public.pets where id::text = p_entity_id and clinic_id = v_clinic_id
  ) then
    raise exception 'AUDIT_ENTITY_NOT_FOUND';
  end if;

  insert into public.deletion_audit (
    id, entity_type, entity_id, entity_name, deleted_by, deleted_at,
    had_history, history_summary, override_confirmed, created_at, updated_at,
    is_deleted, clinic_id
  ) values (
    gen_random_uuid(), p_entity_type, p_entity_id, p_entity_name, v_actor.name,
    now(), coalesce(p_had_history, false), p_history_summary,
    coalesce(p_override_confirmed, false), now(), now(), false, v_clinic_id
  );
end;
$$;

revoke all on function public.write_auth_audit(text, text, boolean, boolean, text) from public, anon;
revoke all on function public.write_deletion_audit(text, text, text, boolean, text, boolean) from public, anon;
grant execute on function public.write_auth_audit(text, text, boolean, boolean, text) to authenticated;
grant execute on function public.write_deletion_audit(text, text, text, boolean, text, boolean) to authenticated;

commit;
