-- Remediation P2/P3: make cash adjustments and shift reconciliation
-- server-owned financial mutations. Browser roles may read ledger rows, but may
-- not forge actor, clinic, timestamp, or derived drawer totals.

begin;

create or replace function public.add_cash_adjustment_auth(p_adjustment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_actor_id text;
  v_actor_name text;
  v_adjustment_id uuid;
  v_shift_id uuid;
  v_type text;
  v_amount numeric;
  v_category text;
  v_reason text;
  v_existing public.cash_adjustments;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: cash adjustment';
  end if;
  if p_adjustment is null or jsonb_typeof(p_adjustment) <> 'object' then
    raise exception 'INVALID_CASH_ADJUSTMENT';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  begin
    v_adjustment_id := (nullif(p_adjustment->>'id', ''))::uuid;
    v_shift_id := (nullif(p_adjustment->>'shiftId', ''))::uuid;
    v_amount := nullif(p_adjustment->>'amount', '')::numeric;
  exception when others then
    raise exception 'INVALID_CASH_ADJUSTMENT';
  end;
  if v_adjustment_id is null or v_shift_id is null
     or v_amount is null or v_amount <= 0 or v_amount <> round(v_amount, 2) then
    raise exception 'INVALID_CASH_ADJUSTMENT';
  end if;
  if nullif(p_adjustment->>'clinic_id', '')::uuid is distinct from v_clinic_id then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  v_type := upper(coalesce(nullif(trim(p_adjustment->>'type'), ''), ''));
  if v_type not in ('IN', 'OUT') then
    raise exception 'INVALID_CASH_ADJUSTMENT_TYPE';
  end if;
  v_category := left(trim(coalesce(p_adjustment->>'category', '')), 120);
  v_reason := left(trim(coalesce(p_adjustment->>'reason', '')), 1000);
  if v_category = '' or v_reason = '' then
    raise exception 'INVALID_CASH_ADJUSTMENT_REASON';
  end if;

  select coalesce(nullif(trim(username), ''), auth.uid()::text),
         left(coalesce(nullif(trim(name), ''), 'Staff'), 200)
    into v_actor_id, v_actor_name
  from public.users
  where auth_user_id = auth.uid()
    and clinic_id = v_clinic_id
    and coalesce(active, true)
    and not coalesce(is_deleted, false)
  limit 1;
  if v_actor_id is null then
    raise exception 'STAFF_IDENTITY_REQUIRED';
  end if;

  if not exists (
    select 1 from public.shifts
    where id = v_shift_id
      and clinic_id = v_clinic_id
      and "isOpen" = true
      and not coalesce(is_deleted, false)
  ) then
    if exists (select 1 from public.shifts where id = v_shift_id and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    raise exception 'OPEN_SHIFT_REQUIRED';
  end if;

  select * into v_existing
  from public.cash_adjustments
  where id = v_adjustment_id
  for update;
  if found then
    if v_existing.clinic_id is distinct from v_clinic_id
       or v_existing."shiftId" is distinct from v_shift_id::text then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    return jsonb_build_object(
      'already_committed', true,
      'adjustment', to_jsonb(v_existing)
    );
  end if;

  insert into public.cash_adjustments (
    id, type, amount, category, reason, date, "createdBy", "shiftId",
    updated_at, is_deleted, _dirty, clinic_id
  ) values (
    v_adjustment_id, v_type, round(v_amount, 2), v_category, v_reason,
    to_char(current_date, 'YYYY-MM-DD'), v_actor_id, v_shift_id::text,
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    false, true, v_clinic_id
  ) returning * into v_existing;

  return jsonb_build_object(
    'already_committed', false,
    'adjustment', to_jsonb(v_existing)
  );
end;
$$;

create or replace function public.close_shift_and_reconcile_auth(
  p_shift_id uuid,
  p_actual_cash_cents numeric,
  p_expected_cash_cents numeric,
  p_discrepancy_cents numeric,
  p_notes text,
  p_reconciliation jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_actor_id text;
  v_actor_name text;
  v_reconciliation_id uuid;
  v_shift public.shifts;
  v_adjustment_delta_cents numeric := 0;
  v_expected_cash_cents numeric;
  v_actual_cash_cents numeric;
  v_discrepancy_cents numeric;
  v_now_iso text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: close shift';
  end if;
  if p_shift_id is null or p_reconciliation is null
     or jsonb_typeof(p_reconciliation) <> 'object' then
    raise exception 'INVALID_RECONCILIATION_PAYLOAD';
  end if;
  begin
    v_reconciliation_id := (nullif(p_reconciliation->>'id', ''))::uuid;
  exception when others then
    raise exception 'INVALID_RECONCILIATION_ID';
  end;
  if v_reconciliation_id is null then
    raise exception 'INVALID_RECONCILIATION_ID';
  end if;

  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;
  select * into v_shift
  from public.shifts
  where id = p_shift_id
    and clinic_id = v_clinic_id
  for update;
  if not found then
    if exists (select 1 from public.shifts where id = p_shift_id and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    raise exception 'SHIFT_NOT_FOUND: %', p_shift_id;
  end if;
  if not coalesce(v_shift."isOpen", false) then
    return jsonb_build_object(
      'shift_id', p_shift_id,
      'already_closed', true,
      'reconciliation_id', null
    );
  end if;

  begin
    v_actual_cash_cents := p_actual_cash_cents::numeric;
    if p_expected_cash_cents is null or p_discrepancy_cents is null then
      raise exception 'INVALID_RECONCILIATION_TOTALS';
    end if;
    if v_actual_cash_cents is null or v_actual_cash_cents < 0
       or v_actual_cash_cents <> trunc(v_actual_cash_cents)
       or p_expected_cash_cents <> trunc(p_expected_cash_cents)
       or p_discrepancy_cents <> trunc(p_discrepancy_cents) then
      raise exception 'INVALID_RECONCILIATION_TOTALS';
    end if;
  exception when others then
    raise exception 'INVALID_RECONCILIATION_TOTALS';
  end;

  select coalesce(sum(
    case when upper(type) = 'IN' then amount else -amount end
  ), 0) * 100
    into v_adjustment_delta_cents
  from public.cash_adjustments
  where "shiftId" = p_shift_id::text
    and clinic_id = v_clinic_id
    and not coalesce(is_deleted, false);

  v_expected_cash_cents := round(
    coalesce(v_shift."openingFloatCents", 0)
    + coalesce(v_shift."cashCollectedCents", 0)
    + v_adjustment_delta_cents
  );
  v_discrepancy_cents := v_actual_cash_cents - v_expected_cash_cents;
  if round(p_expected_cash_cents) <> v_expected_cash_cents
     or round(p_discrepancy_cents) <> v_discrepancy_cents then
    raise exception 'SHIFT_TOTALS_MISMATCH';
  end if;

  select coalesce(nullif(trim(username), ''), auth.uid()::text),
         left(coalesce(nullif(trim(name), ''), 'Staff'), 200)
    into v_actor_id, v_actor_name
  from public.users
  where auth_user_id = auth.uid()
    and clinic_id = v_clinic_id
    and coalesce(active, true)
    and not coalesce(is_deleted, false)
  limit 1;
  if v_actor_id is null then
    raise exception 'STAFF_IDENTITY_REQUIRED';
  end if;

  update public.shifts
  set "endTime" = v_now_iso,
      "expectedCashCents" = v_expected_cash_cents,
      "actualCashCents" = v_actual_cash_cents,
      "discrepancyCents" = v_discrepancy_cents,
      notes = coalesce(nullif(left(trim(coalesce(p_notes, '')), 1000), ''), 'Shift closed'),
      "isOpen" = false,
      actual_cash = v_actual_cash_cents / 100.0,
      discrepancy_reason = coalesce(left(trim(coalesce(p_notes, '')), 1000), ''),
      updated_at = now()
  where id = p_shift_id;

  insert into public.shift_reconciliations (
    clinic_id, id, "timestamp", "userId", "userName", "openingFloat", "cashSales",
    "expectedClosing", "actualClosing", discrepancy, status,
    updated_at, is_deleted, _dirty
  ) values (
    v_clinic_id, v_reconciliation_id, v_now_iso, v_actor_id, v_actor_name,
    coalesce(v_shift."openingFloatCents", 0) / 100.0,
    coalesce(v_shift."cashCollectedCents", 0) / 100.0,
    v_expected_cash_cents / 100.0,
    v_actual_cash_cents / 100.0,
    v_discrepancy_cents / 100.0,
    case when v_discrepancy_cents = 0 then 'balanced' else 'discrepancy' end,
    v_now_iso, false, true
  );

  return jsonb_build_object(
    'shift_id', p_shift_id,
    'already_closed', false,
    'reconciliation_id', v_reconciliation_id,
    'expected_cash_cents', v_expected_cash_cents,
    'actual_cash_cents', v_actual_cash_cents,
    'discrepancy_cents', v_discrepancy_cents
  );
end;
$$;

revoke all on function public.add_cash_adjustment_auth(jsonb) from public, anon;
grant execute on function public.add_cash_adjustment_auth(jsonb) to authenticated, service_role;
revoke all on function public.close_shift_and_reconcile_auth(uuid, numeric, numeric, numeric, text, jsonb)
  from public, anon;
grant execute on function public.close_shift_and_reconcile_auth(uuid, numeric, numeric, numeric, text, jsonb)
  to authenticated, service_role;

revoke insert, update, delete on public.cash_adjustments from public, anon, authenticated;
grant select on public.cash_adjustments to authenticated;
revoke insert, update, delete on public.shift_reconciliations from public, anon, authenticated;
grant select on public.shift_reconciliations to authenticated;

commit;
