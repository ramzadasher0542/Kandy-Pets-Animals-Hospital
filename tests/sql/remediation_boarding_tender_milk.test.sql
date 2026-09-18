-- Behavioral staging test for explicit boarding tender and milk-cup pricing.
-- Run on a disposable/staging target as postgres. The final exception rolls
-- back every synthetic row created by this block.

do $$
declare
  v_clinic uuid := gen_random_uuid();
  v_auth uuid := gen_random_uuid();
  v_shift uuid := gen_random_uuid();
  v_pet text := gen_random_uuid()::text;
  v_boarding uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_result jsonb;
  v_retry jsonb;
  v_denied boolean := false;
  v_event_count integer;
  v_status text;
  v_total bigint;
begin
  if to_regprocedure('public.settle_boarding_account_auth(uuid,uuid,text)') is null
     or to_regprocedure('public.record_boarding_charge_auth(uuid,uuid,text,numeric,uuid)') is null then
    raise exception 'BOARDING_TENDER_MILK_CUP_FAIL: required RPC missing';
  end if;

  insert into public.clinics (id, name)
  values (v_clinic, 'BOARDING_TENDER_' || v_clinic::text);
  insert into public.users (id, name, username, role, active, is_deleted, auth_user_id, clinic_id)
  values (gen_random_uuid(), 'Boarding Owner', 'boarding_tender_' || v_auth::text,
          'owner', true, false, v_auth, v_clinic);
  insert into public.clients (client_id, full_name, clinic_id)
  values ('BOARDING_TENDER_CLIENT_' || v_auth::text, 'Tender Client', v_clinic);
  insert into public.pets (id, "clientId", name, "petType", clinic_id)
  values (v_pet, 'BOARDING_TENDER_CLIENT_' || v_auth::text, 'Tender Cat', 'cat', v_clinic);
  insert into public.boarding_pricing_profiles (
    clinic_id, enabled, billing_unit, cat_no_food_cents, milk_cup_cents,
    default_deposit_cents, allow_late_checkout_fee, pricing_version
  ) values (v_clinic, true, 'night', 1000, 75, 5000, false, 1);
  insert into public.shifts (
    id, clinic_id, "isOpen", "cashCollectedCents", "cardCollectedCents",
    "bankTransferCollectedCents", "openedBy", "startTime", "openingFloatCents",
    opening_float, is_deleted
  ) values (v_shift, v_clinic, true, 0, 0, 0, 'boarding_tender_test', now(), 0, 0, false);

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_auth::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_result := public.start_boarding_admission_auth(
    jsonb_build_object(
      'id', v_boarding::text, 'clinic_id', v_clinic::text, 'petId', v_pet,
      'foodType', 'without_food', 'medicalBoarding', false,
      'hospitalProvidesLitter', false, 'status', 'discharged',
      'cageNumber', 'TENDER-CAGE', 'checkInDate', current_date::text,
      'expectedCheckOut', current_date::text, 'depositPaid', true
    ), v_shift
  );

  if coalesce(v_result->'boarding'->>'status', '') <> 'active' then
    raise exception 'BOARDING_TENDER_MILK_CUP_FAIL: admission status was client-controlled';
  end if;

  v_result := public.record_boarding_charge_auth(v_boarding, v_event, 'milk_cup', 1, null);
  v_retry := public.record_boarding_charge_auth(v_boarding, v_event, 'milk_cup', 1, null);

  select count(*), max("totalChargesCents")
    into v_event_count, v_total
  from public.boarding_charge_events e
  join public.boarding_records b on b.id = e.boarding_id
  where e.id = v_event and e.clinic_id = v_clinic;
  if v_event_count <> 1 or v_total <> 75 or coalesce(v_retry->>'idempotent', '') <> 'true' then
    raise exception 'BOARDING_TENDER_MILK_CUP_FAIL: event pricing/idempotency';
  end if;

  begin
    perform public.settle_boarding_account_auth(v_boarding, v_shift, 'card');
  exception when others then
    v_denied := sqlerrm like '%REFUND_TENDER_MUST_BE_CASH%';
  end;
  if not v_denied then
    raise exception 'BOARDING_TENDER_MILK_CUP_FAIL: non-cash refund was accepted';
  end if;

  v_result := public.settle_boarding_account_auth(v_boarding, v_shift, 'cash');
  select status into v_status from public.boarding_records where id = v_boarding;
  if v_status <> 'discharged' or coalesce(v_result->>'tender_method', '') <> 'cash' then
    raise exception 'BOARDING_TENDER_MILK_CUP_FAIL: cash settlement did not complete';
  end if;

  raise exception 'BOARDING_TENDER_MILK_CUP_PASS event_idempotent=% refund_cash_only=% total=%',
    v_retry->>'idempotent', v_denied, v_total;
end
$$;
