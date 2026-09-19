-- Current-contract role/action matrix.
-- The DO block is atomic; the intentional PASS exception is caught so all
-- synthetic rows are rolled back before the statement completes.

DO $$
DECLARE
  marker text := 'VHMS_ROLE_ACTION_' || replace(gen_random_uuid()::text, '-', '');
  clinic_a uuid;
  clinic_b uuid;
  owner_a uuid := gen_random_uuid();
  manager_a uuid := gen_random_uuid();
  cashier_a uuid := gen_random_uuid();
  vet_a uuid := gen_random_uuid();
  owner_b uuid := gen_random_uuid();
  new_staff uuid := gen_random_uuid();
  auth_owner_a uuid := gen_random_uuid();
  auth_manager_a uuid := gen_random_uuid();
  auth_cashier_a uuid := gen_random_uuid();
  auth_vet_a uuid := gen_random_uuid();
  auth_owner_b uuid := gen_random_uuid();
  inventory_id uuid := gen_random_uuid();
  shift_id uuid := gen_random_uuid();
  visible_rows integer;
  v_role text;
  failed boolean;
  staff_deleted boolean;
BEGIN
  IF has_table_privilege('authenticated', 'public.invoices', 'INSERT')
     OR has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.invoices', 'DELETE')
     OR has_table_privilege('authenticated', 'public.users', 'DELETE')
     OR has_column_privilege('authenticated', 'public.users', 'role', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.users', 'clinic_id', 'UPDATE') THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: direct sensitive write privilege';
  END IF;

  IF has_function_privilege('anon', 'public.current_clinic_id()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.commit_checkout_invoice_and_stock(jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.settle_boarding_account_auth(uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: anonymous privileged RPC';
  END IF;

  INSERT INTO public.clinics (name) VALUES (marker || '_A') RETURNING id INTO clinic_a;
  INSERT INTO public.clinics (name) VALUES (marker || '_B') RETURNING id INTO clinic_b;

  INSERT INTO public.users
    (id, name, username, role, active, is_deleted, auth_user_id, clinic_id, is_superadmin)
  VALUES
    (owner_a, marker || ' owner A', marker || '_owner_a', 'owner', true, false, auth_owner_a, clinic_a, false),
    (manager_a, marker || ' manager A', marker || '_manager_a', 'manager', true, false, auth_manager_a, clinic_a, false),
    (cashier_a, marker || ' cashier A', marker || '_cashier_a', 'cashier', true, false, auth_cashier_a, clinic_a, false),
    (vet_a, marker || ' vet A', marker || '_vet_a', 'veterinarian', true, false, auth_vet_a, clinic_a, false),
    (owner_b, marker || ' owner B', marker || '_owner_b', 'owner', true, false, auth_owner_b, clinic_b, false);

  INSERT INTO public.inventory
    (id, clinic_id, name, category, price, cost, stock, is_deleted, _dirty)
  VALUES (inventory_id, clinic_a, marker || ' service', 'service', 15, 0, 0, false, false);

  INSERT INTO public.shifts
    (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float, is_deleted)
  VALUES (shift_id, clinic_a, marker || ' owner A', now()::text, 0, true, 0, false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_manager_a::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO visible_rows FROM public.users WHERE username LIKE marker || '%';
  IF visible_rows <> 4 THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: manager same-clinic visibility=%', visible_rows;
  END IF;
  SELECT count(*) INTO visible_rows FROM public.users WHERE clinic_id = clinic_b AND username LIKE marker || '%';
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: manager cross-clinic visibility=%', visible_rows;
  END IF;
  v_role := public.current_staff_role();
  IF v_role <> 'manager' THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: current role=%', v_role;
  END IF;

  failed := false;
  BEGIN
    PERFORM public.manage_staff_user(new_staff, marker || ' bad', marker || '_bad', 'cashier', '#000000', true, false);
  EXCEPTION WHEN others THEN
    failed := SQLERRM = 'OWNER_REQUIRED';
  END;
  IF NOT failed THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: manager staff mutation allowed';
  END IF;
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM public.manage_staff_user(new_staff, marker || ' new staff', marker || '_new_staff', 'cashier', '#000000', true, false);
  PERFORM public.set_staff_panel_permissions(new_staff, '["pos", "shift"]'::jsonb);
  RESET ROLE;

  SELECT role INTO v_role FROM public.users WHERE id = new_staff AND clinic_id = clinic_a;
  IF v_role <> 'cashier' THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: owner staff creation';
  END IF;

  failed := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_owner_a::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.manage_staff_user(owner_b, marker || ' cross', marker || '_cross', 'cashier', '#000000', true, false);
  EXCEPTION WHEN others THEN
    failed := true;
  END;
  RESET ROLE;
  IF NOT failed THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: cross-clinic staff mutation allowed';
  END IF;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_owner_a::text, 'role', 'authenticated')::text, true);
  PERFORM public.delete_staff_user(new_staff);
  RESET ROLE;
  SELECT is_deleted INTO staff_deleted FROM public.users WHERE id = new_staff;
  IF staff_deleted IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ROLE_ACTION_FAIL: owner staff deletion';
  END IF;

  RAISE EXCEPTION 'VHMS_ROLE_ACTION_MATRIX_PASS';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END
$$;
