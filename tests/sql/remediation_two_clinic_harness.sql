-- Remediation P0.4 disposable two-clinic verification harness.
-- Run as postgres in a disposable or staging database. The transaction rolls
-- back every synthetic row. Do not run this against production data.

begin;

do $$
declare
  marker text := 'VHMS_REMEDIATION_' || replace(gen_random_uuid()::text, '-', '');
  clinic_a uuid;
  clinic_b uuid;
  auth_a uuid := gen_random_uuid();
  auth_b uuid := gen_random_uuid();
  visible_rows integer;
  duplicate_rejected boolean := false;
begin
  insert into public.clinics (name)
  values (marker || '_A')
  returning id into clinic_a;
  insert into public.clinics (name)
  values (marker || '_B')
  returning id into clinic_b;

  insert into public.users (id, name, username, role, active, is_deleted, auth_user_id, clinic_id)
  values (gen_random_uuid(), marker || ' user A', marker || '_A', 'owner', true, false, auth_a, clinic_a);
  insert into public.users (id, name, username, role, active, is_deleted, auth_user_id, clinic_id)
  values (gen_random_uuid(), marker || ' user B', marker || '_B', 'owner', true, false, auth_b, clinic_b);

  set local role authenticated;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', auth_a::text, 'role', 'authenticated')::text, true);
  select count(*) into visible_rows
  from public.users
  where username like marker || '%';
  if visible_rows <> 1 then
    raise exception 'FAIL: clinic A sees % synthetic users', visible_rows;
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', auth_b::text, 'role', 'authenticated')::text, true);
  select count(*) into visible_rows
  from public.users
  where username like marker || '%';
  if visible_rows <> 1 then
    raise exception 'FAIL: clinic B sees % synthetic users', visible_rows;
  end if;
  reset role;

  insert into public.shifts (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float)
  values (gen_random_uuid(), clinic_a, marker, marker, 0, true, 0);
  insert into public.shifts (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float)
  values (gen_random_uuid(), clinic_b, marker, marker, 0, true, 0);

  begin
    insert into public.shifts (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float)
    values (gen_random_uuid(), clinic_a, marker, marker, 0, true, 0);
  exception when unique_violation then
    duplicate_rejected := true;
  end;
  if not duplicate_rejected then
    raise exception 'FAIL: duplicate open shift was accepted in clinic A';
  end if;

  raise notice 'VHMS TWO-CLINIC HARNESS: PASS';
exception when others then
  reset role;
  raise;
end
$$;

rollback;
