-- Boarding integrity behavior test.
-- Run as postgres with RLS enabled. The final PASS exception rolls back all
-- synthetic rows created by the block.

do $$
declare
  c uuid := gen_random_uuid();
  a uuid := gen_random_uuid();
  s uuid := gen_random_uuid();
  p1 text := gen_random_uuid()::text;
  p2 text := gen_random_uuid()::text;
  b1 uuid := gen_random_uuid();
  b2 uuid := gen_random_uuid();
  r1 jsonb;
  r2 jsonb;
  r3 jsonb;
  denied boolean := false;
  denied_error text;
  settled jsonb;
  retry jsonb;
  boarding_status text;
  boarding_billed boolean;
  source_ref_present boolean;
  effect_status text;
begin
  insert into public.clinics (id, name) values (c, 'BOARDING_INTEGRITY_' || c::text);
  insert into public.users (id, name, username, role, active, is_deleted, auth_user_id, clinic_id)
  values (gen_random_uuid(), 'Boarding Owner', 'boarding_owner_' || a::text,
          'owner', true, false, a, c);
  insert into public.clients (client_id, full_name, clinic_id)
  values ('BOARDING_CLIENT_' || a::text, 'Boarding Client', c);
  insert into public.pets (id, "clientId", name, "petType", clinic_id)
  values (p1, 'BOARDING_CLIENT_' || a::text, 'Boarding Cat One', 'cat', c),
         (p2, 'BOARDING_CLIENT_' || a::text, 'Boarding Cat Two', 'cat', c);
  insert into public.boarding_pricing_profiles (
    clinic_id, enabled, billing_unit, cat_no_food_cents, default_deposit_cents,
    allow_late_checkout_fee, pricing_version
  ) values (c, true, 'night', 1000, 500, false, 1)
  on conflict (clinic_id) do update set
    enabled = excluded.enabled,
    billing_unit = excluded.billing_unit,
    cat_no_food_cents = excluded.cat_no_food_cents,
    default_deposit_cents = excluded.default_deposit_cents,
    allow_late_checkout_fee = excluded.allow_late_checkout_fee,
    pricing_version = excluded.pricing_version;
  insert into public.shifts (
    id, clinic_id, "isOpen", "cashCollectedCents", "cardCollectedCents",
    "bankTransferCollectedCents", "openedBy", "startTime", "openingFloatCents",
    opening_float, is_deleted
  ) values (s, c, true, 0, 0, 0, 'boarding_test', 'BOARDING_TEST', 0, 0, false);

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', a::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  r1 := public.start_boarding_admission_auth(
    jsonb_build_object(
      'id', b1::text, 'petId', p1, 'foodType', 'without_food',
      'medicalBoarding', false, 'hospitalProvidesLitter', false,
      'status', 'active', 'cageNumber', 'CAGE-A',
      'checkInDate', current_date::text, 'expectedCheckOut', current_date::text
    ), s
  );
  r3 := public.start_boarding_admission_auth(
    jsonb_build_object(
      'id', b1::text, 'petId', p1, 'foodType', 'without_food',
      'medicalBoarding', false, 'hospitalProvidesLitter', false,
      'status', 'active', 'cageNumber', 'CAGE-A',
      'checkInDate', current_date::text, 'expectedCheckOut', current_date::text
    ), s
  );

  begin
    r2 := public.start_boarding_admission_auth(
      jsonb_build_object(
        'id', b2::text, 'petId', p2, 'foodType', 'without_food',
        'medicalBoarding', false, 'hospitalProvidesLitter', false,
        'status', 'active', 'cageNumber', 'CAGE-A',
        'checkInDate', current_date::text, 'expectedCheckOut', current_date::text
      ), s
    );
  exception when others then
    denied := sqlerrm like '%CAGE_OCCUPIED%';
    denied_error := sqlerrm;
  end;

  execute 'reset role';
  update public.users set role = 'cashier' where auth_user_id = a;
  execute 'set local role authenticated';
  begin
    perform public.set_boarding_billed_auth(b1, true);
  exception when others then
    denied := denied and sqlerrm like '%ROLE_NOT_ALLOWED%';
    denied_error := denied_error || ' | ' || sqlerrm;
  end;
  execute 'reset role';
  update public.users set role = 'owner' where auth_user_id = a;
  execute 'set local role authenticated';

  settled := public.settle_boarding_account_auth(b1, s);
  retry := public.settle_boarding_account_auth(b1, s);
  execute 'reset role';

  select status, billed into boarding_status, boarding_billed
  from public.boarding_records where id = b1;
  select exists (
    select 1
    from jsonb_array_elements(i.items) item
    cross join jsonb_array_elements(coalesce(item->'sourceRefs', '[]'::jsonb)) ref
    where ref->>'type' = 'boarding' and ref->>'id' = b1::text
  ) into source_ref_present
  from public.invoices i where i.id = b1;
  select status into effect_status from public.checkout_effects where invoice_id = b1;

  if coalesce(r1->>'idempotent', '') <> 'false'
     or coalesce(r3->>'idempotent', '') <> 'true'
     or not denied
     or coalesce(settled->>'idempotent', '') <> 'false'
     or coalesce(retry->>'idempotent', '') <> 'true'
     or boarding_status <> 'discharged'
     or not boarding_billed
     or not source_ref_present
     or effect_status <> 'applied' then
    raise exception 'BOARDING_INTEGRITY_FAIL admission_bad=% retry_bad=% denied_bad=% settlement_bad=% settlement_retry_bad=% status_bad=% billed_bad=% source_bad=% effect_bad=% details=%',
      coalesce((r1->>'idempotent')::boolean, true),
      coalesce((r3->>'idempotent')::boolean, false),
      not denied,
      coalesce((settled->>'idempotent')::boolean, true),
      not coalesce((retry->>'idempotent')::boolean, false),
      boarding_status <> 'discharged', not boarding_billed,
      not source_ref_present, effect_status <> 'applied', denied_error;
  end if;

  raise exception 'BOARDING_INTEGRITY_PASS admission_idempotent=% cage_and_role_denied=% settlement_idempotent=% retry_idempotent=% status=% source_ref=% effect=%',
    r3->>'idempotent', denied, settled->>'idempotent', retry->>'idempotent',
    boarding_status, source_ref_present, effect_status;
end
$$;
