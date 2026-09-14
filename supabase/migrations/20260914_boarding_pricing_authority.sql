-- Remediation P2.3: clinic-owned boarding pricing and server-authoritative
-- admission, charge events, and settlement.

begin;

do $$
begin
  if to_regclass('public.clinics') is null
     or to_regclass('public.boarding_records') is null
     or to_regclass('public.pets') is null
     or to_regclass('public.clients') is null
     or to_regclass('public.inventory') is null
     or to_regclass('public.shifts') is null
     or to_regclass('public.invoices') is null
     or to_regclass('public.cash_adjustments') is null
     or to_regprocedure('public.current_clinic_id()') is null
     or to_regprocedure('public.current_staff_role()') is null
     or to_regprocedure('public.is_current_user_superadmin()') is null
     or to_regprocedure('public.atomic_stock_decrement_auth(uuid,integer)') is null then
    raise exception 'BOARDING_PRICING_PREREQUISITES_REQUIRED';
  end if;
end
$$;

alter table public.boarding_records
  add column if not exists "pricingSnapshot" jsonb not null default '{}'::jsonb;
alter table public.boarding_records
  add column if not exists "checkedOutAt" timestamptz;

create table if not exists public.boarding_pricing_profiles (
  clinic_id uuid primary key references public.clinics(id) on delete cascade,
  enabled boolean not null default true,
  billing_unit text not null default 'night' check (billing_unit in ('night', 'day')),
  cat_no_food_cents bigint not null default 0 check (cat_no_food_cents >= 0),
  cat_with_food_cents bigint not null default 0 check (cat_with_food_cents >= 0),
  dog_no_food_cents bigint not null default 0 check (dog_no_food_cents >= 0),
  dog_with_food_cents bigint not null default 0 check (dog_with_food_cents >= 0),
  cat_litter_cents bigint not null default 0 check (cat_litter_cents >= 0),
  dog_litter_cents bigint not null default 0 check (dog_litter_cents >= 0),
  milk_cup_cents bigint not null default 0 check (milk_cup_cents >= 0),
  default_deposit_cents bigint not null default 0 check (default_deposit_cents >= 0),
  doctor_round_cents bigint not null default 0 check (doctor_round_cents >= 0),
  cleaning_cents_per_day bigint not null default 0 check (cleaning_cents_per_day >= 0),
  late_checkout_cents bigint not null default 0 check (late_checkout_cents >= 0),
  allow_food_charge boolean not null default true,
  allow_litter_charge boolean not null default true,
  allow_medical_boarding boolean not null default true,
  allow_doctor_rounds boolean not null default true,
  allow_cleaning_fee boolean not null default true,
  allow_medication_charge boolean not null default true,
  allow_late_checkout_fee boolean not null default false,
  pricing_version integer not null default 1 check (pricing_version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.boarding_pricing_profiles (
  clinic_id,
  enabled,
  billing_unit,
  cat_no_food_cents,
  cat_with_food_cents,
  dog_no_food_cents,
  dog_with_food_cents,
  cat_litter_cents,
  dog_litter_cents,
  milk_cup_cents,
  default_deposit_cents
)
select
  c.id,
  coalesce(cs.boarding_enabled, true),
  'night',
  case when (s.boarding_rates->>'catNofoodCents') ~ '^\d+$' then (s.boarding_rates->>'catNofoodCents')::bigint else 0 end,
  case when (s.boarding_rates->>'catWithfoodCents') ~ '^\d+$' then (s.boarding_rates->>'catWithfoodCents')::bigint else 0 end,
  case when (s.boarding_rates->>'dogNofoodCents') ~ '^\d+$' then (s.boarding_rates->>'dogNofoodCents')::bigint else 0 end,
  case when (s.boarding_rates->>'dogWithfoodCents') ~ '^\d+$' then (s.boarding_rates->>'dogWithfoodCents')::bigint else 0 end,
  case when (s.boarding_rates->>'catLitterCents') ~ '^\d+$' then (s.boarding_rates->>'catLitterCents')::bigint else 0 end,
  case when (s.boarding_rates->>'dogLitterCents') ~ '^\d+$' then (s.boarding_rates->>'dogLitterCents')::bigint else 0 end,
  case when (s.boarding_rates->>'milkCupCents') ~ '^\d+$' then (s.boarding_rates->>'milkCupCents')::bigint else 0 end,
  greatest(coalesce(s.default_deposit_cents, 0), 0)
from public.clinics c
left join public.clinic_settings cs on cs.clinic_id = c.id
left join public.system_config s on s.id = 'global'
on conflict (clinic_id) do nothing;

alter table public.boarding_pricing_profiles enable row level security;
drop policy if exists boarding_pricing_select on public.boarding_pricing_profiles;
create policy boarding_pricing_select
  on public.boarding_pricing_profiles
  for select to authenticated
  using (clinic_id = public.current_clinic_id() or public.is_current_user_superadmin());

revoke all on public.boarding_pricing_profiles from public, anon, authenticated;
grant select on public.boarding_pricing_profiles to authenticated;

create table if not exists public.boarding_charge_events (
  id uuid primary key,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  boarding_id uuid not null references public.boarding_records(id) on delete cascade,
  event_type text not null check (event_type in ('doctor_round', 'food', 'medication')),
  inventory_item_id uuid,
  label text not null,
  quantity numeric not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  created_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists boarding_charge_events_scope_idx
  on public.boarding_charge_events (clinic_id, boarding_id, created_at);

alter table public.boarding_charge_events enable row level security;
drop policy if exists boarding_charge_events_select on public.boarding_charge_events;
create policy boarding_charge_events_select
  on public.boarding_charge_events
  for select to authenticated
  using (clinic_id = public.current_clinic_id() or public.is_current_user_superadmin());
revoke all on public.boarding_charge_events from public, anon, authenticated;
grant select on public.boarding_charge_events to authenticated;

create or replace function public.save_boarding_pricing_profile_auth(
  p_profile jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_profile public.boarding_pricing_profiles;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'STAFF_AUTH_REQUIRED';
  end if;
  v_role := public.current_staff_role();
  if v_role not in ('owner', 'manager', 'admin', 'provider')
     and not public.is_current_user_superadmin() then
    raise exception 'ROLE_NOT_ALLOWED: boarding pricing';
  end if;
  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'INVALID_BOARDING_PRICING';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null and not public.is_current_user_superadmin() then
    raise exception 'CLINIC_REQUIRED';
  end if;
  if v_clinic_id is null then
    v_clinic_id := nullif(p_profile->>'clinic_id', '')::uuid;
  end if;
  if v_clinic_id is null then
    raise exception 'CLINIC_REQUIRED';
  end if;

  insert into public.boarding_pricing_profiles (
    clinic_id, enabled, billing_unit,
    cat_no_food_cents, cat_with_food_cents, dog_no_food_cents, dog_with_food_cents,
    cat_litter_cents, dog_litter_cents, milk_cup_cents, default_deposit_cents,
    doctor_round_cents, cleaning_cents_per_day, late_checkout_cents,
    allow_food_charge, allow_litter_charge, allow_medical_boarding,
    allow_doctor_rounds, allow_cleaning_fee, allow_medication_charge,
    allow_late_checkout_fee, pricing_version, updated_at, updated_by
  ) values (
    v_clinic_id,
    coalesce((p_profile->>'enabled')::boolean, true),
    case when p_profile->>'billing_unit' in ('night', 'day') then p_profile->>'billing_unit' else 'night' end,
    greatest(coalesce((p_profile->>'cat_no_food_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'cat_with_food_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'dog_no_food_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'dog_with_food_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'cat_litter_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'dog_litter_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'milk_cup_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'default_deposit_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'doctor_round_cents')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'cleaning_cents_per_day')::bigint, 0), 0),
    greatest(coalesce((p_profile->>'late_checkout_cents')::bigint, 0), 0),
    coalesce((p_profile->>'allow_food_charge')::boolean, true),
    coalesce((p_profile->>'allow_litter_charge')::boolean, true),
    coalesce((p_profile->>'allow_medical_boarding')::boolean, true),
    coalesce((p_profile->>'allow_doctor_rounds')::boolean, true),
    coalesce((p_profile->>'allow_cleaning_fee')::boolean, true),
    coalesce((p_profile->>'allow_medication_charge')::boolean, true),
    coalesce((p_profile->>'allow_late_checkout_fee')::boolean, false),
    greatest(coalesce((p_profile->>'pricing_version')::integer, 1), 1),
    now(), auth.uid()
  )
  on conflict (clinic_id) do update set
    enabled = excluded.enabled,
    billing_unit = excluded.billing_unit,
    cat_no_food_cents = excluded.cat_no_food_cents,
    cat_with_food_cents = excluded.cat_with_food_cents,
    dog_no_food_cents = excluded.dog_no_food_cents,
    dog_with_food_cents = excluded.dog_with_food_cents,
    cat_litter_cents = excluded.cat_litter_cents,
    dog_litter_cents = excluded.dog_litter_cents,
    milk_cup_cents = excluded.milk_cup_cents,
    default_deposit_cents = excluded.default_deposit_cents,
    doctor_round_cents = excluded.doctor_round_cents,
    cleaning_cents_per_day = excluded.cleaning_cents_per_day,
    late_checkout_cents = excluded.late_checkout_cents,
    allow_food_charge = excluded.allow_food_charge,
    allow_litter_charge = excluded.allow_litter_charge,
    allow_medical_boarding = excluded.allow_medical_boarding,
    allow_doctor_rounds = excluded.allow_doctor_rounds,
    allow_cleaning_fee = excluded.allow_cleaning_fee,
    allow_medication_charge = excluded.allow_medication_charge,
    allow_late_checkout_fee = excluded.allow_late_checkout_fee,
    pricing_version = public.boarding_pricing_profiles.pricing_version + 1,
    updated_at = now(),
    updated_by = auth.uid()
  returning * into v_profile;
  return to_jsonb(v_profile);
end;
$$;

create or replace function public.start_boarding_admission_auth(
  p_boarding jsonb,
  p_shift_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic_id uuid;
  v_role text;
  v_id uuid;
  v_pet_id text;
  v_pet_type text;
  v_food_type text;
  v_medical boolean;
  v_litter boolean;
  v_rate bigint;
  v_deposit bigint;
  v_profile public.boarding_pricing_profiles;
  v_boarding jsonb;
  v_adjustment jsonb;
  v_result public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'STAFF_AUTH_REQUIRED'; end if;
  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'owner', 'manager', 'admin', 'provider') then
    raise exception 'ROLE_NOT_ALLOWED: boarding admission';
  end if;
  v_clinic_id := public.current_clinic_id();
  if v_clinic_id is null or p_boarding is null or jsonb_typeof(p_boarding) <> 'object' then
    raise exception 'CLINIC_REQUIRED';
  end if;
  v_id := nullif(p_boarding->>'id', '')::uuid;
  v_pet_id := nullif(p_boarding->>'petId', '');
  if v_id is null or v_pet_id is null or p_shift_id is null then raise exception 'INVALID_BOARDING_PAYLOAD'; end if;
  if exists (select 1 from public.boarding_records where id = v_id and clinic_id = v_clinic_id) then
    select * into v_result from public.boarding_records where id = v_id and clinic_id = v_clinic_id;
    return jsonb_build_object('boarding', to_jsonb(v_result), 'idempotent', true);
  end if;
  if not exists (select 1 from public.shifts where id = p_shift_id and clinic_id = v_clinic_id and "isOpen" = true and is_deleted = false) then
    raise exception 'OPEN_SHIFT_REQUIRED';
  end if;
   select * into v_profile from public.boarding_pricing_profiles where clinic_id = v_clinic_id;
   if not found or not v_profile.enabled then raise exception 'BOARDING_DISABLED'; end if;
  select lower(coalesce(p."petType", '')) into v_pet_type from public.pets p where p.id::text = v_pet_id and p.clinic_id = v_clinic_id and coalesce(p.is_deleted, false) = false;
  if v_pet_type is null then raise exception 'PET_NOT_FOUND'; end if;
  v_food_type := coalesce(p_boarding->>'foodType', 'without_food');
  if v_food_type not in ('without_food', 'with_food') then raise exception 'INVALID_FOOD_TYPE'; end if;
  v_medical := coalesce((p_boarding->>'medicalBoarding')::boolean, false);
  v_litter := coalesce((p_boarding->>'hospitalProvidesLitter')::boolean, false);
  if v_food_type = 'with_food' and not v_profile.allow_food_charge then raise exception 'FOOD_SERVICE_DISABLED'; end if;
  if v_litter and not v_profile.allow_litter_charge then raise exception 'LITTER_SERVICE_DISABLED'; end if;
  if v_medical and not v_profile.allow_medical_boarding then raise exception 'MEDICAL_BOARDING_DISABLED'; end if;
  if v_pet_type in ('cat', 'feline') then
    v_rate := case when v_food_type = 'with_food' then v_profile.cat_with_food_cents else v_profile.cat_no_food_cents end;
    if v_litter then v_rate := v_rate + v_profile.cat_litter_cents; end if;
  elsif v_pet_type in ('dog', 'canine') then
    v_rate := case when v_food_type = 'with_food' then v_profile.dog_with_food_cents else v_profile.dog_no_food_cents end;
    if v_litter then v_rate := v_rate + v_profile.dog_litter_cents; end if;
  else
    raise exception 'UNSUPPORTED_PET_TYPE';
  end if;
  if v_rate <= 0 then raise exception 'BOARDING_RATE_NOT_CONFIGURED'; end if;
  v_deposit := v_profile.default_deposit_cents;
  v_boarding := p_boarding
    || jsonb_build_object(
      'clinic_id', v_clinic_id,
      'depositPaid', true,
      'billingItems', jsonb_build_array(jsonb_build_object('itemId', 'admission_deposit', 'name', 'Admission/Boarding Deposit (Refundable)', 'price', v_deposit, 'quantity', 1, 'category', 'service')),
      'totalChargesCents', 0,
      'depositAmountCents', v_deposit,
      'cageFeePerDayCents', v_rate,
      'cleaningFeePerDayCents', case when v_medical and v_profile.allow_cleaning_fee then v_profile.cleaning_cents_per_day else 0 end,
      'doctorFeePerVisitCents', case when v_medical and v_profile.allow_doctor_rounds then v_profile.doctor_round_cents else 0 end,
      'pricingSnapshot', to_jsonb(v_profile),
      'created_at', now(),
      'updated_at', now(),
      'is_deleted', false,
      '_dirty', false,
      'billed', false
    );
  insert into public.boarding_records
  select * from jsonb_populate_record(null::public.boarding_records, v_boarding)
  returning * into v_result;
  v_adjustment := jsonb_build_object(
    'id', md5(v_id::text || ':admission')::uuid,
    'clinic_id', v_clinic_id,
    'type', 'IN',
    'amount', v_deposit / 100.0,
    'category', 'Boarding Deposit',
    'reason', 'Refundable boarding deposit for ' || v_id::text,
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
  return jsonb_build_object('boarding', to_jsonb(v_result), 'deposit_cents', v_deposit, 'idempotent', false);
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
  if auth.uid() is null or not public.is_staff() then raise exception 'STAFF_AUTH_REQUIRED'; end if;
  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'veterinarian', 'owner', 'manager', 'admin', 'provider') then raise exception 'ROLE_NOT_ALLOWED: boarding charge'; end if;
  if p_boarding_id is null or p_event_id is null or p_quantity is null or p_quantity <= 0 or p_quantity <> trunc(p_quantity) or p_quantity > 1000 then raise exception 'INVALID_BOARDING_CHARGE'; end if;
  v_clinic_id := public.current_clinic_id();
  select * into v_boarding from public.boarding_records where id = p_boarding_id and clinic_id = v_clinic_id and status = 'active' and coalesce(is_deleted, false) = false for update;
  if not found then raise exception 'ACTIVE_BOARDING_NOT_FOUND'; end if;
  if exists (select 1 from public.boarding_charge_events where id = p_event_id and clinic_id = v_clinic_id) then
    return jsonb_build_object('boarding', to_jsonb(v_boarding), 'idempotent', true);
  end if;
   if jsonb_typeof(coalesce(v_boarding."pricingSnapshot", '{}'::jsonb)) = 'object'
      and v_boarding."pricingSnapshot" <> '{}'::jsonb then
     select * into v_profile
     from jsonb_populate_record(null::public.boarding_pricing_profiles, v_boarding."pricingSnapshot");
   else
     select * into v_profile from public.boarding_pricing_profiles where clinic_id = v_clinic_id;
   end if;
   if not found or not v_profile.enabled or v_profile.clinic_id is distinct from v_clinic_id then raise exception 'BOARDING_PRICING_SNAPSHOT_INVALID'; end if;
  if p_event_type = 'doctor_round' then
    if not v_profile.allow_doctor_rounds or not v_boarding."medicalBoarding" then raise exception 'DOCTOR_ROUNDS_DISABLED'; end if;
    v_label := 'Doctor Round'; v_unit_price := v_profile.doctor_round_cents;
  elsif p_event_type in ('food', 'medication') then
    if p_event_type = 'food' and not v_profile.allow_food_charge then raise exception 'FOOD_SERVICE_DISABLED'; end if;
    if p_event_type = 'medication' and not v_profile.allow_medication_charge then raise exception 'MEDICATION_SERVICE_DISABLED'; end if;
    if p_inventory_item_id is null then raise exception 'INVENTORY_ITEM_REQUIRED'; end if;
    select i.name, round(i.price * 100)::bigint, i.category into v_name, v_unit_price, v_category
    from public.inventory i
    where i.id = p_inventory_item_id and i.clinic_id = v_clinic_id and coalesce(i.is_deleted, false) = false and i.category = case when p_event_type = 'food' then 'food' else i.category end
    for update;
    if not found then raise exception 'INVENTORY_ITEM_NOT_FOUND'; end if;
    perform public.atomic_stock_decrement_auth(p_inventory_item_id, -p_quantity::integer);
    v_label := v_name || case when p_event_type = 'food' then ' (feeding)' else ' (medication)' end;
  else
    raise exception 'INVALID_BOARDING_CHARGE_TYPE';
  end if;
  if v_unit_price < 0 then raise exception 'INVALID_BOARDING_PRICE'; end if;
  v_item := jsonb_build_object('itemId', coalesce(p_inventory_item_id::text, p_event_type), 'name', v_label, 'price', v_unit_price, 'quantity', p_quantity, 'category', v_category);
  insert into public.boarding_charge_events (id, clinic_id, boarding_id, event_type, inventory_item_id, label, quantity, unit_price_cents, created_by)
  values (p_event_id, v_clinic_id, p_boarding_id, p_event_type, p_inventory_item_id, v_label, p_quantity, v_unit_price, auth.uid());
  update public.boarding_records
  set "billingItems" = coalesce("billingItems", '[]'::jsonb) || jsonb_build_array(v_item),
      "totalChargesCents" = coalesce("totalChargesCents", 0) + (v_unit_price * p_quantity),
      updated_at = now()
  where id = p_boarding_id and clinic_id = v_clinic_id;
  select * into v_boarding from public.boarding_records where id = p_boarding_id and clinic_id = v_clinic_id;
  return jsonb_build_object('boarding', to_jsonb(v_boarding), 'event_id', p_event_id, 'item', v_item, 'idempotent', false);
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
  if auth.uid() is null or not public.is_staff() then raise exception 'STAFF_AUTH_REQUIRED'; end if;
  v_clinic_id := public.current_clinic_id();
  update public.boarding_records
  set "feedingPlan" = p_feeding_plan, updated_at = now()
  where id = p_boarding_id and clinic_id = v_clinic_id and status = 'active' and coalesce(is_deleted, false) = false;
  if not found then raise exception 'ACTIVE_BOARDING_NOT_FOUND'; end if;
  select * into v_boarding from public.boarding_records where id = p_boarding_id and clinic_id = v_clinic_id;
  return to_jsonb(v_boarding);
end;
$$;

create or replace function public.set_boarding_billed_auth(
  p_boarding_id uuid,
  p_billed boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_boarding public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'STAFF_AUTH_REQUIRED'; end if;
  update public.boarding_records set billed = p_billed, updated_at = now()
  where id = p_boarding_id and clinic_id = public.current_clinic_id();
  if not found then raise exception 'BOARDING_NOT_FOUND'; end if;
  select * into v_boarding from public.boarding_records where id = p_boarding_id and clinic_id = public.current_clinic_id();
  return to_jsonb(v_boarding);
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
declare
  v_clinic_id uuid;
  v_role text;
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
  v_result public.boarding_records;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'STAFF_AUTH_REQUIRED'; end if;
  v_role := public.current_staff_role();
  if v_role not in ('cashier', 'owner', 'manager', 'admin', 'provider') then raise exception 'ROLE_NOT_ALLOWED: boarding settlement'; end if;
  v_clinic_id := public.current_clinic_id();
  select * into v_boarding from public.boarding_records where id = p_boarding_id and clinic_id = v_clinic_id for update;
  if not found then raise exception 'BOARDING_NOT_FOUND'; end if;
  if v_boarding.status = 'discharged' then return jsonb_build_object('boarding', to_jsonb(v_boarding), 'idempotent', true); end if;
  if not exists (select 1 from public.shifts where id = p_shift_id and clinic_id = v_clinic_id and "isOpen" = true and is_deleted = false) then raise exception 'OPEN_SHIFT_REQUIRED'; end if;
   if jsonb_typeof(coalesce(v_boarding."pricingSnapshot", '{}'::jsonb)) = 'object'
      and v_boarding."pricingSnapshot" <> '{}'::jsonb then
     select * into v_profile
     from jsonb_populate_record(null::public.boarding_pricing_profiles, v_boarding."pricingSnapshot");
   else
     select * into v_profile from public.boarding_pricing_profiles where clinic_id = v_clinic_id;
   end if;
    if not found or not v_profile.enabled or v_profile.clinic_id is distinct from v_clinic_id then raise exception 'BOARDING_PRICING_SNAPSHOT_INVALID'; end if;
  select lower(p."petType"), p.name, c.full_name, c.primary_phone
    into v_pet_type, v_pet_name, v_owner_name, v_owner_phone
  from public.pets p left join public.clients c on c.client_id = p."clientId" and c.clinic_id = v_clinic_id
  where p.id::text = v_boarding."petId" and p.clinic_id = v_clinic_id;
  if v_pet_type is null then raise exception 'PET_NOT_FOUND'; end if;
  v_nights := greatest(1, current_date - v_boarding."checkInDate"::date);
  v_rate := case
    when v_pet_type in ('cat', 'feline') and v_boarding."foodType" = 'with_food' then v_profile.cat_with_food_cents
    when v_pet_type in ('cat', 'feline') then v_profile.cat_no_food_cents
    when v_pet_type in ('dog', 'canine') and v_boarding."foodType" = 'with_food' then v_profile.dog_with_food_cents
    when v_pet_type in ('dog', 'canine') then v_profile.dog_no_food_cents
    else 0 end;
  if v_rate <= 0 then raise exception 'BOARDING_RATE_NOT_CONFIGURED'; end if;
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
  select coalesce(sum(quantity * unit_price_cents), 0), coalesce(jsonb_agg(jsonb_build_object('itemId', coalesce(inventory_item_id::text, event_type), 'name', label, 'price', unit_price_cents, 'quantity', quantity, 'category', 'service') order by created_at), '[]'::jsonb)
    into v_event_total, v_event_items
  from public.boarding_charge_events where boarding_id = p_boarding_id and clinic_id = v_clinic_id;
  v_total := v_base + v_cleaning + v_late_checkout + v_event_total;
  v_deposit := greatest(coalesce((v_boarding."pricingSnapshot"->>'default_deposit_cents')::bigint, v_profile.default_deposit_cents), 0);
  v_balance := v_deposit - v_total;
  v_items := jsonb_build_array(jsonb_build_object('itemId', 'boarding_stay', 'name', format('Boarding stay (%s %s)', v_nights, case when v_profile.billing_unit = 'night' then 'night(s)' else 'day(s)' end), 'price', v_rate, 'quantity', v_nights, 'category', 'service'));
  if v_cleaning > 0 then v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'boarding_cleaning', 'name', 'Medical boarding cleaning', 'price', v_profile.cleaning_cents_per_day, 'quantity', v_nights, 'category', 'service')); end if;
  if v_late_checkout > 0 then v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'late_checkout', 'name', 'Late pickup fee', 'price', v_late_checkout, 'quantity', 1, 'category', 'service')); end if;
  v_items := v_items || v_event_items;
  if v_balance < 0 then v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'additional_charges', 'name', 'Additional Charges Beyond Deposit', 'price', abs(v_balance), 'quantity', 1, 'category', 'service')); end if;
  if v_balance > 0 then v_items := v_items || jsonb_build_array(jsonb_build_object('itemId', 'settlement_refund', 'name', 'Boarding Deposit Refund', 'price', 0, 'quantity', 1, 'category', 'service')); end if;
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
    'paymentMethod', 'deposit',
    'paymentStatus', 'paid',
    'depositHeld', v_deposit / 100.0,
    'createdBy', (select coalesce(u.name, 'Staff') from public.users u where u.auth_user_id = auth.uid() limit 1),
    'shiftId', p_shift_id,
    'notes', format('Server-calculated boarding settlement using pricing version %s.', coalesce(v_boarding."pricingSnapshot"->>'pricing_version', v_profile.pricing_version::text)),
    'created_at', now(),
    'updated_at', now(),
    'is_deleted', false,
    '_dirty', false
  );
  insert into public.invoices select * from jsonb_populate_record(null::public.invoices, v_invoice) on conflict (id) do nothing;
  if v_balance <> 0 then
    v_adjustment := jsonb_build_object(
      'id', md5(v_boarding.id::text || ':settlement')::uuid,
      'clinic_id', v_clinic_id,
      'type', case when v_balance < 0 then 'IN' else 'OUT' end,
      'amount', abs(v_balance) / 100.0,
      'category', case when v_balance < 0 then 'Boarding Additional Charge' else 'Boarding Deposit Refund' end,
      'reason', format('Server-calculated boarding settlement for %s.', coalesce(v_pet_name, v_boarding."petId")),
      'date', now(),
      'createdBy', (select coalesce(u.name, 'Staff') from public.users u where u.auth_user_id = auth.uid() limit 1),
      'shiftId', p_shift_id,
      'updated_at', now(),
      'is_deleted', false,
      '_dirty', false
    );
    insert into public.cash_adjustments select * from jsonb_populate_record(null::public.cash_adjustments, v_adjustment) on conflict (id) do nothing;
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
  return jsonb_build_object('boarding', to_jsonb(v_result), 'invoice_id', v_boarding.id, 'total_charges_cents', v_total, 'deposit_cents', v_deposit, 'balance_cents', v_balance, 'idempotent', false);
end;
$$;

revoke all on function public.save_boarding_pricing_profile_auth(jsonb) from public, anon;
revoke all on function public.start_boarding_admission_auth(jsonb, uuid) from public, anon;
revoke all on function public.record_boarding_charge_auth(uuid, uuid, text, numeric, uuid) from public, anon;
revoke all on function public.update_boarding_care_auth(uuid, jsonb) from public, anon;
revoke all on function public.set_boarding_billed_auth(uuid, boolean) from public, anon;
revoke all on function public.settle_boarding_account_auth(uuid, uuid) from public, anon;
grant execute on function public.save_boarding_pricing_profile_auth(jsonb) to authenticated, service_role;
grant execute on function public.start_boarding_admission_auth(jsonb, uuid) to authenticated, service_role;
grant execute on function public.record_boarding_charge_auth(uuid, uuid, text, numeric, uuid) to authenticated, service_role;
grant execute on function public.update_boarding_care_auth(uuid, jsonb) to authenticated, service_role;
grant execute on function public.set_boarding_billed_auth(uuid, boolean) to authenticated, service_role;
grant execute on function public.settle_boarding_account_auth(uuid, uuid) to authenticated, service_role;

revoke all on function public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb) to service_role;

revoke insert, update, delete on public.boarding_records from authenticated;
grant select on public.boarding_records to authenticated;

commit;
