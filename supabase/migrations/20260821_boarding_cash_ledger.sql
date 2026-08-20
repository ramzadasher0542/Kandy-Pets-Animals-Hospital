-- Step 38 - atomic boarding settlement ledger
--
-- Boarding admission and discharge previously changed boarding_records without
-- changing the active shift. This function commits the boarding row, optional
-- settlement invoice, and optional cash movement in one transaction.

CREATE OR REPLACE FUNCTION public.commit_boarding_cash_ledger_auth(
  p_boarding jsonb,
  p_invoice jsonb,
  p_adjustment jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_boarding_id uuid;
  v_invoice_id uuid;
  v_adjustment_id uuid;
  v_boarding jsonb;
  v_invoice jsonb;
  v_adjustment jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  v_role := public.current_staff_role();
  IF v_role NOT IN ('cashier', 'owner', 'manager', 'admin', 'provider') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED: boarding cash ledger';
  END IF;

  IF p_boarding IS NULL OR jsonb_typeof(p_boarding) <> 'object'
     OR NULLIF(p_boarding->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_BOARDING_PAYLOAD';
  END IF;

  BEGIN
    v_boarding_id := (p_boarding->>'id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_BOARDING_ID';
  END;

  IF p_invoice IS NOT NULL THEN
    IF jsonb_typeof(p_invoice) <> 'object' OR NULLIF(p_invoice->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_BOARDING_INVOICE';
    END IF;
    BEGIN
      v_invoice_id := (p_invoice->>'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_BOARDING_INVOICE_ID';
    END;
  END IF;

  IF p_adjustment IS NOT NULL THEN
    IF jsonb_typeof(p_adjustment) <> 'object'
       OR NULLIF(p_adjustment->>'id', '') IS NULL
       OR p_adjustment->>'type' NOT IN ('IN', 'OUT')
       OR NULLIF(p_adjustment->>'amount', '') IS NULL
       OR (p_adjustment->>'amount')::numeric <= 0
       OR NULLIF(p_adjustment->>'shiftId', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_BOARDING_ADJUSTMENT';
    END IF;
    BEGIN
      v_adjustment_id := (p_adjustment->>'id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_BOARDING_ADJUSTMENT_ID';
    END;
    IF NOT EXISTS (
      SELECT 1
      FROM public.shifts
      WHERE id::text = p_adjustment->>'shiftId'
        AND "isOpen" = true
        AND is_deleted = false
    ) THEN
      RAISE EXCEPTION 'OPEN_SHIFT_REQUIRED';
    END IF;
  END IF;

  v_boarding := jsonb_build_object(
    'created_at', now(),
    'updated_at', now(),
    'is_deleted', false,
    '_dirty', false
  ) || p_boarding;

  INSERT INTO public.boarding_records
  SELECT * FROM jsonb_populate_record(NULL::public.boarding_records, v_boarding)
  ON CONFLICT (id) DO UPDATE SET
    "petId" = EXCLUDED."petId",
    "cageNumber" = EXCLUDED."cageNumber",
    "checkInDate" = EXCLUDED."checkInDate",
    "expectedCheckOut" = EXCLUDED."expectedCheckOut",
    status = EXCLUDED.status,
    "foodType" = EXCLUDED."foodType",
    "medicalBoarding" = EXCLUDED."medicalBoarding",
    "depositPaid" = EXCLUDED."depositPaid",
    "billingItems" = EXCLUDED."billingItems",
    "updated_at" = now(),
    is_deleted = EXCLUDED.is_deleted,
    _dirty = EXCLUDED._dirty,
    billed = EXCLUDED.billed,
    "feedingPlan" = EXCLUDED."feedingPlan",
    "estimatedStayDays" = EXCLUDED."estimatedStayDays",
    "depositAmountCents" = EXCLUDED."depositAmountCents",
    "cageFeePerDayCents" = EXCLUDED."cageFeePerDayCents",
    "cleaningFeePerDayCents" = EXCLUDED."cleaningFeePerDayCents",
    "doctorFeePerVisitCents" = EXCLUDED."doctorFeePerVisitCents",
    "hospitalProvidesLitter" = EXCLUDED."hospitalProvidesLitter",
    "totalChargesCents" = EXCLUDED."totalChargesCents";

  IF p_invoice IS NOT NULL THEN
    v_invoice := jsonb_build_object(
      'created_at', now(),
      'updated_at', now(),
      'is_deleted', false,
      '_dirty', false
    ) || p_invoice;
    INSERT INTO public.invoices
    SELECT * FROM jsonb_populate_record(NULL::public.invoices, v_invoice)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF p_adjustment IS NOT NULL THEN
    v_adjustment := jsonb_build_object(
      'updated_at', (now() AT TIME ZONE 'utc')::text,
      'is_deleted', false,
      '_dirty', false
    ) || p_adjustment;
    INSERT INTO public.cash_adjustments
    SELECT * FROM jsonb_populate_record(NULL::public.cash_adjustments, v_adjustment)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'boarding_id', v_boarding_id,
    'invoice_id', v_invoice_id,
    'adjustment_id', v_adjustment_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_boarding_cash_ledger_auth(jsonb, jsonb, jsonb)
  TO authenticated, service_role;
