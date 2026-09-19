-- Current-contract checkout, retry, void, tenant-scope, and shift matrix.
-- The intentional PASS exception rolls the whole DO block back.
DO $$
DECLARE
  marker text := 'VHMS_FINANCIAL_' || replace(gen_random_uuid()::text, '-', '');
  clinic_a uuid;
  clinic_b uuid;
  owner_a uuid := gen_random_uuid();
  auth_owner_a uuid := gen_random_uuid();
  item_id uuid := gen_random_uuid();
  shift_a uuid := gen_random_uuid();
  shift_b uuid := gen_random_uuid();
  invoice_id uuid := gen_random_uuid();
  payload jsonb;
  first_result jsonb;
  retry_result jsonb;
  void_result jsonb;
  void_retry jsonb;
  cash numeric;
  stock numeric;
  status text;
  total numeric;
  failed boolean;
  duplicate_rejected boolean := false;
BEGIN
  INSERT INTO public.clinics (name) VALUES (marker || '_A') RETURNING id INTO clinic_a;
  INSERT INTO public.clinics (name) VALUES (marker || '_B') RETURNING id INTO clinic_b;
  INSERT INTO public.users
    (id, name, username, role, active, is_deleted, auth_user_id, clinic_id, is_superadmin)
  VALUES (owner_a, marker || ' owner', marker || '_owner', 'owner', true, false, auth_owner_a, clinic_a, false);
  INSERT INTO public.inventory
    (id, clinic_id, name, category, price, cost, stock, is_deleted, _dirty)
  VALUES (item_id, clinic_a, marker || ' service', 'service', 15, 0, 0, false, false);
  INSERT INTO public.shifts
    (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float, is_deleted)
  VALUES (shift_a, clinic_a, marker || ' owner', now()::text, 0, true, 0, false);
  INSERT INTO public.shifts
    (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float, is_deleted)
  VALUES (shift_b, clinic_b, marker || ' other', now()::text, 0, true, 0, false);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_owner_a::text, 'role', 'authenticated')::text, true);
  payload := jsonb_build_object(
    'id', invoice_id,
    'clinic_id', clinic_a,
    'patientId', 'RETAIL',
    'petName', 'Retail',
    'ownerName', 'Retail',
    'ownerPhone', '0000000000',
    'date', current_date::text,
    'items', jsonb_build_array(jsonb_build_object('itemId', item_id, 'quantity', 1, 'sourceRefs', '[]'::jsonb)),
    'sales_total', 999,
    'discount', 0,
    'tax', 0,
    'paymentStatus', 'paid',
    'paymentMethod', 'cash',
    'shiftId', shift_a,
    'createdBy', 'forged caller'
  );
  first_result := public.commit_checkout_invoice_and_stock(payload, '[]'::jsonb);
  retry_result := public.commit_checkout_invoice_and_stock(payload, '[]'::jsonb);
  RESET ROLE;

  SELECT "cashCollectedCents" INTO cash FROM public.shifts WHERE id = shift_a;
  SELECT i.stock INTO stock FROM public.inventory AS i WHERE i.id = item_id;
  SELECT i."paymentStatus", i.sales_total INTO status, total FROM public.invoices AS i WHERE i.id = invoice_id;
  IF first_result->>'already_committed' <> 'false'
     OR retry_result->>'already_committed' <> 'true'
     OR cash <> 1500
     OR stock <> 0
     OR status <> 'paid'
     OR total <> 15 THEN
    RAISE EXCEPTION 'FINANCIAL_MATRIX_FAIL: checkout first=% retry=% cash=% stock=% status=% total=%', first_result, retry_result, cash, stock, status, total;
  END IF;

  void_result := public.void_invoice_and_reverse_revenue(invoice_id);
  void_retry := public.void_invoice_and_reverse_revenue(invoice_id);
  SELECT "cashCollectedCents" INTO cash FROM public.shifts WHERE id = shift_a;
  SELECT i.stock INTO stock FROM public.inventory AS i WHERE i.id = item_id;
  SELECT i."paymentStatus" INTO status FROM public.invoices AS i WHERE i.id = invoice_id;
  IF void_result->>'already_void' <> 'false'
     OR void_result->>'reversed' <> 'true'
     OR void_retry->>'already_void' <> 'true'
     OR void_retry->>'reversed' <> 'false'
     OR cash <> 0
     OR stock <> 0
     OR status <> 'void' THEN
    RAISE EXCEPTION 'FINANCIAL_MATRIX_FAIL: void=% retry=% cash=% stock=% status=%', void_result, void_retry, cash, stock, status;
  END IF;

  failed := false;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', auth_owner_a::text, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.commit_checkout_invoice_and_stock(
      jsonb_set(payload, '{id}', to_jsonb(gen_random_uuid()), true) || jsonb_build_object('clinic_id', clinic_b),
      '[]'::jsonb
    );
  EXCEPTION WHEN others THEN
    failed := SQLERRM LIKE '%CLINIC_SCOPE_MISMATCH%';
  END;
  RESET ROLE;
  IF NOT failed THEN
    RAISE EXCEPTION 'FINANCIAL_MATRIX_FAIL: cross-clinic checkout accepted';
  END IF;

  BEGIN
    INSERT INTO public.shifts
      (id, clinic_id, "openedBy", "startTime", "openingFloatCents", "isOpen", opening_float, is_deleted)
    VALUES (gen_random_uuid(), clinic_a, marker || ' duplicate', now()::text, 0, true, 0, false);
  EXCEPTION WHEN unique_violation THEN
    duplicate_rejected := true;
  END;
  IF NOT duplicate_rejected THEN
    RAISE EXCEPTION 'FINANCIAL_MATRIX_FAIL: duplicate open shift accepted';
  END IF;

  RAISE EXCEPTION 'VHMS_FINANCIAL_INTEGRITY_MATRIX_PASS';
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END
$$;
