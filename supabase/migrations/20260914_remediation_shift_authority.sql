-- Remediation P3.3: open shifts through a server-owned boundary.
-- The browser may request an opening float, but the database owns the actor,
-- clinic, timestamps, and open-shift state.

begin;

do $$
begin
  if to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.current_staff_role()') is null then
    raise exception 'TENANT_IDENTITY_HELPERS_REQUIRED';
  end if;
end
$$;

create or replace function public.open_shift_auth(
  p_shift_id uuid,
  p_opening_float_cents integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_opened_by text;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: open shift';
  end if;
  if p_shift_id is null or p_opening_float_cents is null or p_opening_float_cents < 0 then
    raise exception 'INVALID_SHIFT_PAYLOAD';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  select coalesce(nullif(trim(username), ''), nullif(trim(name), ''), 'Staff')
    into v_opened_by
  from public.users
  where auth_user_id = auth.uid()
    and clinic_id = v_clinic_id
    and coalesce(active, true)
    and not coalesce(is_deleted, false)
  limit 1;
  if v_opened_by is null then
    raise exception 'STAFF_IDENTITY_REQUIRED';
  end if;

  insert into public.shifts (
    id, "openedBy", "startTime", "openingFloatCents",
    "cashCollectedCents", "cardCollectedCents", "bankTransferCollectedCents",
    "expectedCashCents", "actualCashCents", "discrepancyCents", notes,
    "isOpen", opening_float, actual_cash, discrepancy_reason,
    created_at, updated_at, is_deleted, clinic_id
  ) values (
    p_shift_id, v_opened_by, now(), p_opening_float_cents,
    0, 0, 0,
    p_opening_float_cents, null, null, '',
    true, p_opening_float_cents / 100.0, null, '',
    now(), now(), false, v_clinic_id
  );

  return p_shift_id;
exception
  when unique_violation then
    raise exception 'OPEN_SHIFT_ALREADY_EXISTS';
end;
$$;

revoke all on function public.open_shift_auth(uuid, integer) from public, anon;
grant execute on function public.open_shift_auth(uuid, integer) to authenticated, service_role;

create or replace function public.restore_shift_auth(p_row jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_shift_id uuid;
begin
  if auth.uid() is null or public.current_staff_role() <> 'provider' then
    raise exception 'PROVIDER_REQUIRED';
  end if;
  if p_row is null or jsonb_typeof(p_row) <> 'object' then
    raise exception 'INVALID_RESTORE_SHIFT';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;
  begin
    v_shift_id := (nullif(p_row->>'id', ''))::uuid;
    if v_shift_id is null or (nullif(p_row->>'clinic_id', ''))::uuid is distinct from v_clinic_id then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  exception when invalid_text_representation then
    raise exception 'INVALID_RESTORE_SHIFT';
  end;
  if coalesce((p_row->>'isOpen')::boolean, false) then
    raise exception 'OPEN_SHIFT_RESTORE_FORBIDDEN';
  end if;
  if exists (select 1 from public.shifts where id = v_shift_id and clinic_id is distinct from v_clinic_id) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  insert into public.shifts (
    id, "openedBy", "startTime", "endTime", "openingFloatCents",
    "cashCollectedCents", "cardCollectedCents", "bankTransferCollectedCents",
    "expectedCashCents", "actualCashCents", "discrepancyCents", notes,
    "isOpen", opening_float, actual_cash, discrepancy_reason,
    created_at, updated_at, is_deleted, clinic_id
  ) values (
    v_shift_id,
    left(coalesce(nullif(p_row->>'openedBy', ''), 'Restored'), 200),
    coalesce(nullif(p_row->>'startTime', '')::timestamptz, now()),
    nullif(p_row->>'endTime', '')::timestamptz,
    round(coalesce(nullif(p_row->>'openingFloatCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'cashCollectedCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'cardCollectedCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'bankTransferCollectedCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'expectedCashCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'actualCashCents', '')::numeric, 0))::integer,
    round(coalesce(nullif(p_row->>'discrepancyCents', '')::numeric, 0))::integer,
    left(coalesce(p_row->>'notes', ''), 1000),
    false,
    coalesce(nullif(p_row->>'opening_float', '')::numeric, 0),
    nullif(p_row->>'actual_cash', '')::numeric,
    left(coalesce(p_row->>'discrepancy_reason', ''), 1000),
    coalesce(nullif(p_row->>'created_at', '')::timestamptz, now()),
    coalesce(nullif(p_row->>'updated_at', '')::timestamptz, now()),
    coalesce((p_row->>'is_deleted')::boolean, false),
    v_clinic_id
  )
  on conflict (id) do update set
    "openedBy" = excluded."openedBy",
    "startTime" = excluded."startTime",
    "endTime" = excluded."endTime",
    "openingFloatCents" = excluded."openingFloatCents",
    "cashCollectedCents" = excluded."cashCollectedCents",
    "cardCollectedCents" = excluded."cardCollectedCents",
    "bankTransferCollectedCents" = excluded."bankTransferCollectedCents",
    "expectedCashCents" = excluded."expectedCashCents",
    "actualCashCents" = excluded."actualCashCents",
    "discrepancyCents" = excluded."discrepancyCents",
    notes = excluded.notes,
    "isOpen" = false,
    opening_float = excluded.opening_float,
    actual_cash = excluded.actual_cash,
    discrepancy_reason = excluded.discrepancy_reason,
    updated_at = now(),
    is_deleted = excluded.is_deleted;

  return v_shift_id;
end;
$$;

revoke all on function public.restore_shift_auth(jsonb) from public, anon;
grant execute on function public.restore_shift_auth(jsonb) to authenticated, service_role;

-- All browser shift mutations now go through open/close/restore RPCs.
revoke insert, update, delete on public.shifts from authenticated;
grant select on public.shifts to authenticated;

commit;
