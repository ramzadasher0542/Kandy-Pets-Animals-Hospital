-- Step 28 shift-accounting verification (non-mutating).
--
-- Each block creates temporary rows inside a transaction and ends with a RAISE, so
-- EVERYTHING rolls back — no test rows persist and existing data is untouched. Run
-- each block on its own (e.g. via Supabase MCP execute_sql or psql). A block that
-- ends with '...PASSED'/'..._OK' means all its assertions held; any other error is a
-- real assertion failure. These exercise the REAL functions (attribution, retry
-- idempotency, void reversal + idempotency, method-cents math, duplicate-open
-- rejection). Two-device races are covered by the FOR UPDATE row lock in
-- apply_shift_revenue; cross-midnight reconciliation is covered by
-- fetchPaidInvoicesForShift querying by shiftId with no date filter (client side).

-- Block 1: attribution by invoice.shiftId, checkout retry idempotency, void
-- reversal + idempotency, and split/single method-cents math.
DO $$
DECLARE
  s uuid := gen_random_uuid();
  inv1 jsonb;
  r1 jsonb; r2 jsonb;
  cash numeric;
  mc record;
BEGIN
  INSERT INTO public.shifts (id,"openedBy","startTime","openingFloatCents","isOpen","opening_float")
  VALUES (s,'TEST','TEST',0,false,0);   -- closed temp shift (avoids single-open index)

  SELECT * INTO mc FROM public._invoice_method_cents(
    jsonb_build_object('paymentMethod','split','splitPayments',
      jsonb_build_array(jsonb_build_object('method','cash','amount',10),
                        jsonb_build_object('method','card','amount',5)),'sales_total',15));
  ASSERT mc.cash_cents=1000 AND mc.card_cents=500 AND mc.bank_cents=0, 'split cents wrong';

  SELECT * INTO mc FROM public._invoice_method_cents(jsonb_build_object('paymentMethod','cash','sales_total',7.5));
  ASSERT mc.cash_cents=750, 'single cents wrong';

  inv1 := jsonb_build_object('id', gen_random_uuid(),'patientId','RETAIL','petName','x','ownerName','x',
    'ownerPhone','x','date','2026-08-06','subtotal',15,'tax',0,'discount',0,'sales_total',15,
    'paymentStatus','paid','paymentMethod','cash','createdBy','TEST','shiftId', s::text);
  r1 := public.commit_checkout_invoice_and_stock(inv1, '[]'::jsonb);
  r2 := public.commit_checkout_invoice_and_stock(inv1, '[]'::jsonb);   -- retry
  SELECT "cashCollectedCents" INTO cash FROM public.shifts WHERE id=s;
  ASSERT (r1->>'already_committed')='false', 'first commit not fresh';
  ASSERT (r2->>'already_committed')='true', 'retry not idempotent';
  ASSERT cash=1500, format('checkout revenue not applied once: %s', cash);

  r1 := public.void_invoice_and_reverse_revenue((inv1->>'id')::uuid);
  r2 := public.void_invoice_and_reverse_revenue((inv1->>'id')::uuid);   -- retry
  SELECT "cashCollectedCents" INTO cash FROM public.shifts WHERE id=s;
  ASSERT (r1->>'reversed')='true' AND (r1->>'already_void')='false', 'first void wrong';
  ASSERT (r2->>'already_void')='true' AND (r2->>'reversed')='false', 'void not idempotent';
  ASSERT cash=0, format('revenue not reversed once: %s', cash);

  RAISE EXCEPTION 'STEP28_TESTS_PASSED';
END $$;

-- Block 2: the single-open-shift unique index rejects a concurrent duplicate open.
-- (Requires one open shift to already exist; rolls back regardless.)
DO $$
BEGIN
  BEGIN
    INSERT INTO public.shifts (id,"openedBy","startTime","openingFloatCents","isOpen","opening_float")
    VALUES (gen_random_uuid(),'TEST','TEST',0,true,0);
    RAISE EXCEPTION 'DUPLICATE_OPEN_NOT_REJECTED';
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_OPEN_REJECTED_OK';
  END;
END $$;
