-- Remediation P2.3: explicit boarding settlement tender and server-priced
-- milk-cup care events. The current ledger supports cash, card, and bank
-- transfer receipts; refunds remain cash-only until a payment/refund ledger
-- exists that can represent non-cash reversals without touching drawer cash.

begin;

do $$
begin
  if to_regprocedure('public.start_boarding_admission_auth(jsonb,uuid)') is null
     or to_regprocedure('public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)') is null
     or to_regprocedure('public.update_boarding_care_auth(uuid,jsonb)') is null
     or to_regprocedure('public.settle_boarding_account_auth(uuid,uuid)') is null
     or to_regclass('public.boarding_charge_events') is null then
    raise exception 'BOARDING_TENDER_PREREQUISITES_REQUIRED';
  end if;
end
$$;

alter table public.boarding_charge_events
  drop constraint if exists boarding_charge_events_event_type_check;
alter table public.boarding_charge_events
  add constraint boarding_charge_events_event_type_check
  check (event_type in ('doctor_round', 'food', 'medication', 'milk_cup'));

-- Keep the historical two-argument entry point as a cash-only compatibility
-- wrapper while removing authenticated access from the old permissive body.
do $$
begin
  if to_regprocedure('public.start_boarding_admission_auth(jsonb,uuid)') is not null
     and to_regprocedure('public.start_boarding_admission_impl(jsonb,uuid)') is null then
    alter function public.start_boarding_admission_auth(jsonb, uuid)
      rename to start_boarding_admission_impl;
  end if;
end
$$;

create or replace function public.start_boarding_admission_auth(
  p_boarding jsonb,
  p_shift_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('veterinarian', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding admission';
  end if;
  return public.start_boarding_admission_impl(
    coalesce(p_boarding, '{}'::jsonb) || jsonb_build_object('status', 'active'),
    p_shift_id
  );
end;
$$;

create or replace function public.record_boarding_charge_auth(
  p_boarding_id uuid,
  p_event_id uuid,
  p_event_type text,
  p_quantity numeric,
  p_inventory_item_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_boarding public.boarding_records;
  v_profile public.boarding_pricing_profiles;
  v_label text;
  v_unit_price bigint;
  v_name text;
  v_category text := 'service';
  v_item jsonb;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  v_role := public.current_staff_role();
  if v_role not in ('veterinarian', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding charge';
  end if;
  if p_boarding_id is null or p_event_id is null or p_quantity is null
     or p_quantity <= 0 or p_quantity <> trunc(p_quantity) or p_quantity > 1000 then
    raise exception 'INVALID_BOARDING_CHARGE';
  end if;
  if p_event_type not in ('doctor_round', 'food', 'medication', 'milk_cup') then
    raise exception 'INVALID_BOARDING_CHARGE_TYPE';
  end if;
  v_clinic_id := public.current_clinic_id();
  select * into v_boarding
  from public.boarding_records
  where id = p_boarding_id
    and clinic_id = v_clinic_id
    and status = 'active'
    and coalesce(is_deleted, false) = false
  for update;
  if not found then
    raise exception 'ACTIVE_BOARDING_NOT_FOUND';
  end if;
  if exists (
    select 1 from public.boarding_charge_events
    where id = p_event_id and clinic_id = v_clinic_id
  ) then
    return jsonb_build_object('boarding', to_jsonb(v_boarding), 'idempotent', true);
  end if;

  if jsonb_typeof(coalesce(v_boarding."pricingSnapshot", '{}'::jsonb)) = 'object'
     and v_boarding."pricingSnapshot" <> '{}'::jsonb then
    select * into v_profile
    from jsonb_populate_record(null::public.boarding_pricing_profiles, v_boarding."pricingSnapshot");
  else
    select * into v_profile
    from public.boarding_pricing_profiles
    where clinic_id = v_clinic_id;
  end if;
  if not found or not v_profile.enabled
     or v_profile.clinic_id is distinct from v_clinic_id then
    raise exception 'BOARDING_PRICING_SNAPSHOT_INVALID';
  end if;

  if p_event_type = 'doctor_round' then
    if not v_profile.allow_doctor_rounds or not v_boarding."medicalBoarding" then
      raise exception 'DOCTOR_ROUNDS_DISABLED';
    end if;
    v_label := 'Doctor Round';
    v_unit_price := v_profile.doctor_round_cents;
  elsif p_event_type = 'milk_cup' then
    if v_profile.milk_cup_cents <= 0 then
      raise exception 'MILK_CUP_SERVICE_DISABLED';
    end if;
    v_label := 'Milk cup';
    v_unit_price := v_profile.milk_cup_cents;
  elsif p_event_type in ('food', 'medication') then
    if p_event_type = 'food' and not v_profile.allow_food_charge then
      raise exception 'FOOD_SERVICE_DISABLED';
    end if;
    if p_event_type = 'medication' and not v_profile.allow_medication_charge then
      raise exception 'MEDICATION_SERVICE_DISABLED';
    end if;
    if p_inventory_item_id is null then
      raise exception 'INVENTORY_ITEM_REQUIRED';
    end if;
    select i.name, round(i.price * 100)::bigint, i.category
      into v_name, v_unit_price, v_category
    from public.inventory i
    where i.id = p_inventory_item_id
      and i.clinic_id = v_clinic_id
      and coalesce(i.is_deleted, false) = false
      and i.category = case when p_event_type = 'food' then 'food' else i.category end
    for update;
    if not found then
      raise exception 'INVENTORY_ITEM_NOT_FOUND';
    end if;
    perform public.atomic_stock_decrement_auth(p_inventory_item_id, -p_quantity::integer);
    v_label := v_name || case when p_event_type = 'food' then ' (feeding)' else ' (medication)' end;
  end if;
  if v_unit_price < 0 then
    raise exception 'INVALID_BOARDING_PRICE';
  end if;

  v_item := jsonb_build_object(
    'itemId', coalesce(p_inventory_item_id::text, p_event_type),
    'name', v_label,
    'price', v_unit_price,
    'quantity', p_quantity,
    'category', v_category
  );
  insert into public.boarding_charge_events (
    id, clinic_id, boarding_id, event_type, inventory_item_id, label,
    quantity, unit_price_cents, created_by
  ) values (
    p_event_id, v_clinic_id, p_boarding_id, p_event_type, p_inventory_item_id,
    v_label, p_quantity, v_unit_price, auth.uid()
  );
  update public.boarding_records
  set "billingItems" = coalesce("billingItems", '[]'::jsonb) || jsonb_build_array(v_item),
      "totalChargesCents" = coalesce("totalChargesCents", 0) + (v_unit_price * p_quantity),
      updated_at = now()
  where id = p_boarding_id and clinic_id = v_clinic_id;
  select * into v_boarding
  from public.boarding_records
  where id = p_boarding_id and clinic_id = v_clinic_id;
  return jsonb_build_object(
    'boarding', to_jsonb(v_boarding),
    'event_id', p_event_id,
    'item', v_item,
    'idempotent', false
  );
end;
$$;

create or replace function public.update_boarding_care_auth(
  p_boarding_id uuid,
  p_feeding_plan jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_boarding public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  if public.current_staff_role() not in ('veterinarian', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding care';
  end if;
  if p_feeding_plan is not null and jsonb_typeof(p_feeding_plan) <> 'object' then
    raise exception 'INVALID_FEEDING_PLAN';
  end if;
  if p_feeding_plan is not null and (
    nullif(trim(p_feeding_plan->>'inventoryItemId'), '') is null
    or coalesce((p_feeding_plan->>'quantityPerMeal')::numeric, 0) <= 0
    or coalesce((p_feeding_plan->>'mealsPerDay')::numeric, 0) <= 0
    or coalesce((p_feeding_plan->>'quantityPerMeal')::numeric, 0) > 1000
    or coalesce((p_feeding_plan->>'mealsPerDay')::numeric, 0) > 100
  ) then
    raise exception 'INVALID_FEEDING_PLAN';
  end if;
  v_clinic_id := public.current_clinic_id();
  if p_feeding_plan is not null and not exists (
    select 1 from public.inventory i
    where i.id = nullif(p_feeding_plan->>'inventoryItemId', '')::uuid
      and i.clinic_id = v_clinic_id
      and i.category = 'food'
      and coalesce(i.is_deleted, false) = false
  ) then
    raise exception 'FOOD_INVENTORY_ITEM_NOT_FOUND';
  end if;
  update public.boarding_records
  set "feedingPlan" = p_feeding_plan, updated_at = now()
  where id = p_boarding_id
    and clinic_id = v_clinic_id
    and status = 'active'
    and coalesce(is_deleted, false) = false;
  if not found then
    raise exception 'ACTIVE_BOARDING_NOT_FOUND';
  end if;
  select * into v_boarding
  from public.boarding_records
  where id = p_boarding_id and clinic_id = v_clinic_id;
  return to_jsonb(v_boarding);
end;
$$;

create or replace function public.settle_boarding_account_auth(
  p_boarding_id uuid,
  p_shift_id uuid,
  p_tender_method text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_tender_method text;
  v_boarding public.boarding_records;
  v_profile public.boarding_pricing_profiles;
  v_pet_type text;
  v_pet_name text;
  v_owner_name text;
  v_owner_phone text;
  v_rate bigint;
  v_base bigint;
  v_cleaning bigint;
  v_late_checkout bigint;
  v_event_total bigint;
  v_total bigint;
  v_deposit bigint;
  v_balance bigint;
  v_nights integer;
  v_event_items jsonb;
  v_items jsonb;
  v_invoice jsonb;
  v_adjustment jsonb;
  v_payment_method text;
  v_split_payments jsonb;
  v_result public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  v_role := public.current_staff_role();
  if v_role not in ('veterinarian', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding settlement';
  end if;
  v_tender_method := lower(trim(coalesce(p_tender_method, '')));
  if v_tender_method not in ('cash', 'card', 'bank_transfer') then
    raise exception 'INVALID_BOARDING_TENDER';
  end if;
  v_clinic_id := public.current_clinic_id();
  select * into v_boarding
  from public.boarding_records
  where id = p_boarding_id and clinic_id = v_clinic_id
  for update;
  if not found then
    raise exception 'BOARDING_NOT_FOUND';
  end if;
  if v_boarding.status = 'discharged' then
    return jsonb_build_object('boarding', to_jsonb(v_boarding), 'idempotent', true);
  end if;
  if not exists (
    select 1 from public.shifts
    where id = p_shift_id and clinic_id = v_clinic_id and "isOpen" = true and is_deleted = false
  ) then
    raise exception 'OPEN_SHIFT_REQUIRED';
  end if;
  if jsonb_typeof(coalesce(v_boarding."pricingSnapshot", '{}'::jsonb)) = 'object'
     and v_boarding."pricingSnapshot" <> '{}'::jsonb then
    select * into v_profile
    from jsonb_populate_record(null::public.boarding_pricing_profiles, v_boarding."pricingSnapshot");
  else
    select * into v_profile
    from public.boarding_pricing_profiles where clinic_id = v_clinic_id;
  end if;
  if not found or not v_profile.enabled or v_profile.clinic_id is distinct from v_clinic_id then
    raise exception 'BOARDING_PRICING_SNAPSHOT_INVALID';
  end if;
  select lower(p."petType"), p.name, c.full_name, c.primary_phone
    into v_pet_type, v_pet_name, v_owner_name, v_owner_phone
  from public.pets p
  left join public.clients c on c.client_id = p."clientId" and c.clinic_id = v_clinic_id
  where p.id::text = v_boarding."petId" and p.clinic_id = v_clinic_id;
  if v_pet_type is null then
    raise exception 'PET_NOT_FOUND';
  end if;
  v_nights := greatest(1, current_date - v_boarding."checkInDate"::date);
  v_rate := case
    when v_pet_type in ('cat', 'feline') and v_boarding."foodType" = 'with_food' then v_profile.cat_with_food_cents
    when v_pet_type in ('cat', 'feline') then v_profile.cat_no_food_cents
    when v_pet_type in ('dog', 'canine') and v_boarding."foodType" = 'with_food' then v_profile.dog_with_food_cents
    when v_pet_type in ('dog', 'canine') then v_profile.dog_no_food_cents
    else 0
  end;
  if v_rate <= 0 then
    raise exception 'BOARDING_RATE_NOT_CONFIGURED';
  end if;
  if v_boarding."hospitalProvidesLitter" then
    v_rate := v_rate + case when v_pet_type in ('cat', 'feline') then v_profile.cat_litter_cents else v_profile.dog_litter_cents end;
  end if;
  v_base := v_rate * v_nights;
  v_cleaning := case when v_boarding."medicalBoarding" and v_profile.allow_cleaning_fee then v_profile.cleaning_cents_per_day * v_nights else 0 end;
  v_late_checkout := case
    when v_profile.allow_late_checkout_fee
      and v_boarding."expectedCheckOut" is not null
      and current_date > v_boarding."expectedCheckOut"::date
    then coalesce(v_profile.late_checkout_cents, 0)
    else 0
  end;
  select coalesce(sum(quantity * unit_price_cents), 0),
         coalesce(jsonb_agg(jsonb_build_object(
           'itemId', coalesce(inventory_item_id::text, event_type),
           'name', label, 'price', unit_price_cents, 'quantity', quantity,
           'category', 'service'
         ) order by created_at), '[]'::jsonb)
    into v_event_total, v_event_items
  from public.boarding_charge_events
  where boarding_id = p_boarding_id and clinic_id = v_clinic_id;
  v_total := v_base + v_cleaning + v_late_checkout + v_event_total;
  v_deposit := greatest(coalesce((v_boarding."pricingSnapshot"->>'default_deposit_cents')::bigint, v_profile.default_deposit_cents), 0);
  v_balance := v_deposit - v_total;
  if v_balance > 0 and v_tender_method <> 'cash' then
    raise exception 'REFUND_TENDER_MUST_BE_CASH';
  end if;
  v_payment_method := case when v_balance < 0 then 'split' else 'deposit' end;
  if v_balance < 0 then
    v_split_payments := jsonb_build_array(
      jsonb_build_object('method', 'deposit', 'amount', v_deposit / 100.0),
      jsonb_build_object('method', v_tender_method, 'amount', abs(v_balance) / 100.0)
    );
  end if;
  v_items := jsonb_build_array(jsonb_build_object(
    'itemId', 'boarding_stay',
    'name', format('Boarding stay (%s %s)', v_nights, case when v_profile.billing_unit = 'night' then 'night(s)' else 'day(s)' end),
    'price', v_rate, 'quantity', v_nights, 'category', 'service'
  ));
  if v_cleaning > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'boarding_cleaning', 'name', 'Medical boarding cleaning', 'price', v_profile.cleaning_cents_per_day, 'quantity', v_nights, 'category', 'service'));
  end if;
  if v_late_checkout > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'late_checkout', 'name', 'Late pickup fee', 'price', v_late_checkout, 'quantity', 1, 'category', 'service'));
  end if;
  v_items := v_items || v_event_items;
  if v_balance < 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'additional_charges', 'name', 'Additional Charges Beyond Deposit', 'price', abs(v_balance), 'quantity', 1, 'category', 'service'));
  end if;
  if v_balance > 0 then
    v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'settlement_refund', 'name', 'Boarding Deposit Refund', 'price', 0, 'quantity', 1, 'category', 'service'));
  end if;
  v_invoice := jsonb_build_object(
    'id', v_boarding.id,
    'clinic_id', v_clinic_id,
    'patientId', v_boarding."petId",
    'petName', coalesce(v_pet_name, 'Boarding Patient'),
    'ownerName', coalesce(v_owner_name, 'Unknown Owner'),
    'ownerPhone', coalesce(v_owner_phone, '0000000000'),
    'date', now(),
    'items', v_items,
    'subtotal', v_total / 100.0,
    'tax', 0,
    'discount', 0,
    'sales_total', v_total / 100.0,
    'cogs', 0,
    'profit', v_total / 100.0,
    'paymentMethod', v_payment_method,
    'splitPayments', v_split_payments,
    'paymentStatus', 'paid',
    'depositHeld', v_deposit / 100.0,
    'createdBy', (select coalesce(u.name, 'Staff') from public.users u where u.auth_user_id = auth.uid() limit 1),
    'shiftId', p_shift_id,
    'notes', format('Server-calculated boarding settlement using %s tender and pricing version %s.', v_tender_method, coalesce(v_boarding."pricingSnapshot"->>'pricing_version', v_profile.pricing_version::text)),
    'created_at', now(),
    'updated_at', now(),
    'is_deleted', false,
    '_dirty', false
  );
  insert into public.invoices
  select * from jsonb_populate_record(null::public.invoices, v_invoice)
  on conflict (id) do nothing;
  if v_balance <> 0 and (v_balance < 0 and v_tender_method = 'cash' or v_balance > 0) then
    v_adjustment := jsonb_build_object(
      'id', md5(v_boarding.id::text || ':settlement')::uuid,
      'clinic_id', v_clinic_id,
      'type', case when v_balance < 0 then 'IN' else 'OUT' end,
      'amount', abs(v_balance) / 100.0,
      'category', case when v_balance < 0 then 'Boarding Additional Charge' else 'Boarding Deposit Refund' end,
      'reason', format('Server-calculated boarding settlement for %s (%s).', coalesce(v_pet_name, v_boarding."petId"), v_tender_method),
      'date', now(),
      'createdBy', (select coalesce(u.name, 'Staff') from public.users u where u.auth_user_id = auth.uid() limit 1),
      'shiftId', p_shift_id,
      'updated_at', now(),
      'is_deleted', false,
      '_dirty', false
    );
    insert into public.cash_adjustments
    select * from jsonb_populate_record(null::public.cash_adjustments, v_adjustment)
    on conflict (id) do nothing;
  end if;
  update public.boarding_records
  set status = 'discharged',
      "checkedOutAt" = now(),
      "billingItems" = v_items,
      "totalChargesCents" = v_total,
      "depositPaid" = true,
      billed = true,
      updated_at = now()
  where id = v_boarding.id and clinic_id = v_clinic_id;
  select * into v_result from public.boarding_records where id = v_boarding.id and clinic_id = v_clinic_id;
  return jsonb_build_object(
    'boarding', to_jsonb(v_result),
    'invoice_id', v_boarding.id,
    'total_charges_cents', v_total,
    'deposit_cents', v_deposit,
    'balance_cents', v_balance,
    'payment_method', v_payment_method,
    'tender_method', v_tender_method,
    'idempotent', false
  );
end;
$$;

create or replace function public.settle_boarding_account_auth(
  p_boarding_id uuid,
  p_shift_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.settle_boarding_account_auth(p_boarding_id, p_shift_id, 'cash');
end;
$$;

revoke all on function public.start_boarding_admission_impl(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.start_boarding_admission_impl(jsonb, uuid) to service_role;
revoke all on function public.start_boarding_admission_auth(jsonb, uuid) from public, anon;
grant execute on function public.start_boarding_admission_auth(jsonb, uuid) to authenticated, service_role;
revoke all on function public.record_boarding_charge_auth(uuid, uuid, text, numeric, uuid) from public, anon;
grant execute on function public.record_boarding_charge_auth(uuid, uuid, text, numeric, uuid) to authenticated, service_role;
revoke all on function public.update_boarding_care_auth(uuid, jsonb) from public, anon;
grant execute on function public.update_boarding_care_auth(uuid, jsonb) to authenticated, service_role;
revoke all on function public.settle_boarding_account_auth(uuid, uuid, text) from public, anon;
grant execute on function public.settle_boarding_account_auth(uuid, uuid, text) to authenticated, service_role;
revoke all on function public.settle_boarding_account_auth(uuid, uuid) from public, anon;
grant execute on function public.settle_boarding_account_auth(uuid, uuid) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.settle_boarding_account_auth(uuid,uuid,text)') is null
     or not has_function_privilege('authenticated', 'public.settle_boarding_account_auth(uuid,uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.settle_boarding_account_auth(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'BOARDING_TENDER_RELEASE_INVALID';
  end if;
end
$$;

commit;
