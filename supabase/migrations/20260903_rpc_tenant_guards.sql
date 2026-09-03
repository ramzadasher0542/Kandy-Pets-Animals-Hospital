-- Tenant guards for SECURITY DEFINER mutation wrappers.
--
-- RLS protects direct PostgREST calls. SECURITY DEFINER functions must perform
-- the same tenant checks themselves because their nested queries run with the
-- function owner's privileges.

begin;

create or replace function public.atomic_stock_decrement_auth(
  p_item_id uuid,
  p_qty_delta integer
) returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null or not public.is_staff() or public.current_clinic_id() is null then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;

  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'veterinarian', 'manager', 'owner', 'admin', 'provider')
     or (v_role = 'veterinarian' and p_qty_delta > 0) then
    raise exception 'ROLE_NOT_ALLOWED: stock mutation';
  end if;

  if not exists (
    select 1 from public.inventory
    where id = p_item_id and clinic_id = public.current_clinic_id()
  ) then
    raise exception 'ITEM_NOT_FOUND: %', p_item_id;
  end if;

  return public.atomic_stock_decrement(p_item_id, p_qty_delta);
end;
$$;

create or replace function public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_clinic_id uuid;
  v_invoice_id uuid;
  v_shift_id uuid;
  v_appointment_id uuid;
  v_item jsonb;
  v_item_id uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: checkout';
  end if;
  if p_invoice is null or jsonb_typeof(p_invoice) <> 'object'
     or jsonb_typeof(p_invoice->'items') <> 'array'
     or p_stock_items is null or jsonb_typeof(p_stock_items) <> 'array' then
    raise exception 'INVALID_CHECKOUT_PAYLOAD';
  end if;

  begin
    v_invoice_id := (nullif(p_invoice->>'id', ''))::uuid;
  exception when others then
    raise exception 'INVALID_INVOICE_ID';
  end;
  if v_invoice_id is null then
    raise exception 'INVALID_INVOICE_ID';
  end if;
  if nullif(p_invoice->>'clinic_id', '')::uuid is distinct from v_clinic_id then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;
  if exists (select 1 from public.invoices where id = v_invoice_id and clinic_id <> v_clinic_id) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  if nullif(p_invoice->>'shiftId', '') is not null then
    begin
      v_shift_id := (p_invoice->>'shiftId')::uuid;
    exception when others then
      raise exception 'INVALID_SHIFT_ID';
    end;
    if exists (select 1 from public.shifts where id = v_shift_id and clinic_id <> v_clinic_id)
       or not exists (select 1 from public.shifts where id = v_shift_id and clinic_id = v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  if nullif(p_invoice->>'appointmentId', '') is not null then
    begin
      v_appointment_id := (p_invoice->>'appointmentId')::uuid;
    exception when others then
      raise exception 'INVALID_APPOINTMENT_ID';
    end;
    if exists (select 1 from public.appointments where id = v_appointment_id and clinic_id <> v_clinic_id)
       or not exists (select 1 from public.appointments where id = v_appointment_id and clinic_id = v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  if nullif(p_invoice->>'patientId', '') is not null and p_invoice->>'patientId' <> 'RETAIL'
     and exists (select 1 from public.pets where id::text = p_invoice->>'patientId' and clinic_id <> v_clinic_id) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  for v_item in select value from jsonb_array_elements(p_stock_items) loop
    begin
      v_item_id := (nullif(v_item->>'item_id', ''))::uuid;
    exception when others then
      raise exception 'INVALID_STOCK_ITEM_ID';
    end;
    if v_item_id is null or not exists (
      select 1 from public.inventory where id = v_item_id and clinic_id = v_clinic_id
    ) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end loop;

  return public.commit_checkout_invoice_and_stock_impl(
    jsonb_set(p_invoice, '{clinic_id}', to_jsonb(v_clinic_id::text), true),
    p_stock_items
  );
end;
$$;

create or replace function public.void_invoice_and_reverse_revenue_auth(
  p_invoice_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_shift_id uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: void invoice';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or not exists (
    select 1 from public.invoices where id = p_invoice_id and clinic_id = v_clinic_id
  ) then
    raise exception 'INVOICE_NOT_FOUND: %', p_invoice_id;
  end if;

  begin
    select nullif("shiftId", '')::uuid into v_shift_id
    from public.invoices where id = p_invoice_id;
  exception when others then
    raise exception 'INVALID_SHIFT_ID_FOR_INVOICE';
  end;
  if v_shift_id is not null and (
    exists (select 1 from public.shifts where id = v_shift_id and clinic_id <> v_clinic_id)
    or not exists (select 1 from public.shifts where id = v_shift_id and clinic_id = v_clinic_id)
  ) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  return public.void_invoice_and_reverse_revenue(p_invoice_id);
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
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_clinic_id() is null
     or not exists (select 1 from public.shifts where id = p_shift_id and clinic_id = public.current_clinic_id())
     or p_reconciliation is null
     or nullif(p_reconciliation->>'clinic_id', '')::uuid is distinct from public.current_clinic_id() then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: close shift';
  end if;
  return public.close_shift_and_reconcile(
    p_shift_id, p_actual_cash_cents, p_expected_cash_cents,
    p_discrepancy_cents, p_notes, p_reconciliation
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.commit_boarding_cash_ledger_auth(jsonb,jsonb,jsonb)') is not null
     and to_regprocedure('public.commit_boarding_cash_ledger_unscoped(jsonb,jsonb,jsonb)') is null then
    alter function public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb)
      rename to commit_boarding_cash_ledger_unscoped;
  end if;
end
$$;

create or replace function public.commit_boarding_cash_ledger_auth(
  p_boarding jsonb,
  p_invoice jsonb,
  p_adjustment jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_boarding_id uuid;
  v_invoice_id uuid;
  v_adjustment_id uuid;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding cash ledger';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or p_boarding is null or jsonb_typeof(p_boarding) <> 'object'
     or nullif(p_boarding->>'id', '') is null
     or nullif(p_boarding->>'clinic_id', '')::uuid is distinct from v_clinic_id then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;
  begin
    v_boarding_id := (p_boarding->>'id')::uuid;
  exception when others then
    raise exception 'INVALID_BOARDING_ID';
  end;
  if exists (select 1 from public.boarding_records where id = v_boarding_id and clinic_id <> v_clinic_id) then
    raise exception 'CLINIC_SCOPE_MISMATCH';
  end if;

  if p_invoice is not null then
    if jsonb_typeof(p_invoice) <> 'object' or nullif(p_invoice->>'id', '') is null
       or nullif(p_invoice->>'clinic_id', '')::uuid is distinct from v_clinic_id then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    begin v_invoice_id := (p_invoice->>'id')::uuid; exception when others then raise exception 'INVALID_BOARDING_INVOICE_ID'; end;
    if exists (select 1 from public.invoices where id = v_invoice_id and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  if p_adjustment is not null then
    if jsonb_typeof(p_adjustment) <> 'object' or nullif(p_adjustment->>'id', '') is null
       or nullif(p_adjustment->>'clinic_id', '')::uuid is distinct from v_clinic_id then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
    begin v_adjustment_id := (p_adjustment->>'id')::uuid; exception when others then raise exception 'INVALID_BOARDING_ADJUSTMENT_ID'; end;
    if nullif(p_adjustment->>'shiftId', '') is null
       or not exists (select 1 from public.shifts where id::text = p_adjustment->>'shiftId' and clinic_id = v_clinic_id)
       or exists (select 1 from public.shifts where id::text = p_adjustment->>'shiftId' and clinic_id <> v_clinic_id) then
      raise exception 'CLINIC_SCOPE_MISMATCH';
    end if;
  end if;

  return public.commit_boarding_cash_ledger_unscoped(p_boarding, p_invoice, p_adjustment);
end;
$$;

revoke all on function public.atomic_stock_decrement_auth(uuid, integer) from public, anon;
grant execute on function public.atomic_stock_decrement_auth(uuid, integer) to authenticated, service_role;
revoke all on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) from public, anon;
grant execute on function public.commit_checkout_invoice_and_stock(jsonb, jsonb) to authenticated, service_role;
revoke all on function public.void_invoice_and_reverse_revenue_auth(uuid) from public, anon;
grant execute on function public.void_invoice_and_reverse_revenue_auth(uuid) to authenticated, service_role;
revoke all on function public.close_shift_and_reconcile_auth(uuid, numeric, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.close_shift_and_reconcile_auth(uuid, numeric, numeric, numeric, text, jsonb) to authenticated, service_role;
revoke all on function public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.commit_boarding_cash_ledger_unscoped(jsonb, jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.atomic_stock_decrement(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.commit_checkout_invoice_and_stock_impl(jsonb, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.close_shift_and_reconcile(uuid, numeric, numeric, numeric, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.void_invoice_and_reverse_revenue(uuid) from public, anon, authenticated, service_role;

commit;
