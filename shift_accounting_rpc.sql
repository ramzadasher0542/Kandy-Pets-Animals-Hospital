-- Step 28: atomic, multi-device-safe shift accounting.
--
-- 1) _invoice_method_cents(jsonb)  -> splits an invoice payload into integer cents
--    per payment method (cash/card/bank_transfer), mirroring the client's drawer math
--    exactly (round(amount*100)). Handles split payments and single-method invoices.
-- 2) apply_shift_revenue(shift, cash, card, bank) -> the ONE reviewed revenue-delta
--    primitive: locks the target shift row FOR UPDATE and applies validated integer-cent
--    deltas to its collected-cents counters. Attribution is always by an explicit shift
--    id (never a fresh "latest open shift" lookup).
-- 3) commit_checkout_invoice_and_stock is ADAPTED to apply paid-sale revenue to the
--    invoice's OWN shiftId inside the same transaction, only on first insert
--    (ON CONFLICT DO NOTHING) -> revenue is applied exactly once per invoice, so a
--    lost-response retry cannot double-count. Everything else about the RPC is unchanged.
-- 4) void_invoice_and_reverse_revenue(invoice) -> atomically flips a not-yet-void invoice
--    to 'void' (preserving the appointment->'booked' cascade) and reverses the exact
--    revenue once, attributed to the invoice's shiftId. Idempotent: a second call sees
--    paymentStatus='void' and returns already_void without reversing again.
-- 5) uniq_shifts_single_open -> smallest DB protection against concurrent open shifts:
--    a partial unique index allowing at most one row with isOpen = true. Live data was
--    inspected first (exactly 1 open shift), so this creates cleanly without touching data.
--
-- All functions are SECURITY INVOKER and rely on the existing shifts/invoices/appointments
-- RLS (UPDATE/SELECT already granted to anon/authenticated). No RLS change, no PUBLIC grant,
-- no data delete/merge/rewrite.

-- 1) ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._invoice_method_cents(
  p_invoice jsonb,
  OUT cash_cents integer,
  OUT card_cents integer,
  OUT bank_cents integer
)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_elem jsonb;
  v_method text;
BEGIN
  cash_cents := 0; card_cents := 0; bank_cents := 0;
  IF (p_invoice->>'paymentMethod') = 'split'
     AND jsonb_typeof(p_invoice->'splitPayments') = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_invoice->'splitPayments') LOOP
      v_method := v_elem->>'method';
      IF v_method = 'cash' THEN
        cash_cents := cash_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      ELSIF v_method = 'card' THEN
        card_cents := card_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      ELSIF v_method = 'bank_transfer' THEN
        bank_cents := bank_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      END IF;
    END LOOP;
  ELSE
    v_method := p_invoice->>'paymentMethod';
    IF v_method = 'cash' THEN
      cash_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    ELSIF v_method = 'card' THEN
      card_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    ELSIF v_method = 'bank_transfer' THEN
      bank_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    END IF;
  END IF;
END;
$$;

-- 2) ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_shift_revenue(
  p_shift_id uuid,
  p_cash_cents integer,
  p_card_cents integer,
  p_bank_cents integer
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_shift_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SHIFT_ID';
  END IF;
  -- Lock the target shift row so concurrent deltas serialize (no read-modify-write race).
  PERFORM 1 FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: %', p_shift_id;
  END IF;
  UPDATE public.shifts SET
    "cashCollectedCents"         = "cashCollectedCents"         + COALESCE(p_cash_cents, 0),
    "cardCollectedCents"         = "cardCollectedCents"         + COALESCE(p_card_cents, 0),
    "bankTransferCollectedCents" = "bankTransferCollectedCents" + COALESCE(p_bank_cents, 0),
    updated_at = now()
  WHERE id = p_shift_id;
END;
$$;

-- 3) ---------------------------------------------------------------------------
-- commit_checkout_invoice_and_stock, adapted: apply paid-sale revenue to the
-- invoice's own shiftId on first insert only (idempotent by invoice id).
CREATE OR REPLACE FUNCTION public.commit_checkout_invoice_and_stock(p_invoice jsonb, p_stock_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice_id uuid;
  v_full jsonb;
  v_inserted integer;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_remaining numeric;
  v_stock jsonb := '{}'::jsonb;
  v_appt text;
  v_cash integer;
  v_card integer;
  v_bank integer;
BEGIN
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_INVOICE_PAYLOAD';
  END IF;
  IF NULLIF(p_invoice->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END IF;
  BEGIN
    v_invoice_id := (p_invoice->>'id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END;

  IF p_stock_items IS NULL OR jsonb_typeof(p_stock_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_STOCK_ITEMS';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
    IF NULLIF(v_item->>'item_id', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_STOCK_ITEM_ID';
    END IF;
    BEGIN
      PERFORM (v_item->>'item_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_STOCK_ITEM_ID';
    END;
    IF (v_item->>'qty') IS NULL THEN
      RAISE EXCEPTION 'INVALID_STOCK_QTY';
    END IF;
    v_qty := (v_item->>'qty')::numeric;
    IF v_qty <= 0 OR v_qty <> floor(v_qty) THEN
      RAISE EXCEPTION 'INVALID_STOCK_QTY';
    END IF;
  END LOOP;

  v_full := jsonb_build_object(
    'is_deleted', false,
    '_dirty', false,
    'created_at', now(),
    'updated_at', now()
  ) || p_invoice;

  INSERT INTO public.invoices
  SELECT * FROM jsonb_populate_record(null::public.invoices, v_full)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
      v_item_id := (v_item->>'item_id')::uuid;
      SELECT stock INTO v_remaining FROM public.inventory WHERE id = v_item_id;
      v_stock := v_stock || jsonb_build_object(v_item_id::text, v_remaining);
    END LOOP;
    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'already_committed', true,
      'remaining_stock', v_stock
    );
  END IF;

  v_appt := NULLIF(v_full->>'appointmentId', '');
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments
    SET status = CASE WHEN (v_full->>'paymentStatus') = 'void' THEN 'booked' ELSE 'completed' END
    WHERE id = v_appt::uuid;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_remaining := public.atomic_stock_decrement(v_item_id, (-v_qty)::integer);
    v_stock := v_stock || jsonb_build_object(v_item_id::text, v_remaining);
  END LOOP;

  -- Attribute paid-sale revenue to the invoice's OWN shift (never a fresh lookup),
  -- inside this transaction. Applied only on first insert above, so exactly once.
  IF (v_full->>'paymentStatus') = 'paid' AND NULLIF(v_full->>'shiftId', '') IS NOT NULL THEN
    SELECT * INTO v_cash, v_card, v_bank FROM public._invoice_method_cents(v_full);
    PERFORM public.apply_shift_revenue((v_full->>'shiftId')::uuid, v_cash, v_card, v_bank);
  END IF;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_committed', false,
    'remaining_stock', v_stock
  );
END;
$function$;

-- 4) ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_revenue(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_cash integer;
  v_card integer;
  v_bank integer;
  v_appt text;
  v_was_paid boolean;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id;
  END IF;

  -- Idempotent: a retry / concurrent second void reverses nothing again.
  IF v_inv."paymentStatus" = 'void' THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'already_void', true, 'reversed', false);
  END IF;

  v_was_paid := (v_inv."paymentStatus" = 'paid');

  UPDATE public.invoices SET "paymentStatus" = 'void', updated_at = now() WHERE id = p_invoice_id;

  -- Preserve the existing void cascade: revert the linked appointment to 'booked'.
  v_appt := NULLIF(v_inv."appointmentId", '');
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments SET status = 'booked' WHERE id = v_appt::uuid;
  END IF;

  -- Reverse the exact revenue exactly once, on the invoice's own shift.
  IF v_was_paid AND NULLIF(v_inv."shiftId", '') IS NOT NULL THEN
    SELECT * INTO v_cash, v_card, v_bank FROM public._invoice_method_cents(to_jsonb(v_inv));
    PERFORM public.apply_shift_revenue(v_inv."shiftId"::uuid, -v_cash, -v_card, -v_bank);
  END IF;

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'already_void', false, 'reversed', v_was_paid);
END;
$$;

-- 5) ---------------------------------------------------------------------------
-- Smallest safe protection against concurrent open shifts: at most one isOpen=true row.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_shifts_single_open
  ON public.shifts ("isOpen")
  WHERE "isOpen" = true;

-- Grants: existing app roles only, never PUBLIC.
REVOKE ALL ON FUNCTION public._invoice_method_cents(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._invoice_method_cents(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_shift_revenue(uuid, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_shift_revenue(uuid, integer, integer, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_revenue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_revenue(uuid) TO anon, authenticated, service_role;
