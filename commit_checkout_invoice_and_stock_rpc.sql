-- Step 18: atomic checkout invoice + inventory RPC.
--
-- Persists ONE checkout invoice and decrements ALL of its inventory items in a
-- single database transaction (a plpgsql function is atomic): any invoice or
-- stock failure rolls back the whole invoice-plus-stock operation. This covers
-- ONLY the invoice + inventory boundary. Shift revenue, client lifetime totals,
-- visit closing and source billing remain SEPARATE post-commit effects in the
-- client and are NOT part of this transaction.
--
-- Idempotent by invoice id: the invoice is inserted with ON CONFLICT (id) DO
-- NOTHING. If the row already exists (a retry after a lost response), stock is
-- NOT decremented again; the function returns already_committed=true plus the
-- current stock for the requested items.
--
-- Stock changes reuse the existing public.atomic_stock_decrement(uuid, integer)
-- RPC, preserving its FEFO/batch semantics, soft-delete handling, clamp-at-zero
-- behavior and updated_at handling.
--
-- SECURITY INVOKER: runs as the calling role, subject to the existing RLS on
-- invoices / appointments / inventory / inventory_batches -- identical access to
-- the current direct client writes, no privilege escalation. EXECUTE is granted
-- only to the existing application roles (never PUBLIC).
--
-- p_invoice      : jsonb object shaped like the invoices row (keys = column names).
--                  The caller pre-formats `date` exactly as upsertInvoice does.
-- p_stock_items  : jsonb array of { "item_id": <uuid>, "qty": <positive integer> }.
--
-- Returns: { "invoice_id": <uuid>, "already_committed": <bool>,
--            "remaining_stock": { "<item_id>": <numeric>, ... } }

CREATE OR REPLACE FUNCTION public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
BEGIN
  -- ---- validate invoice payload (before any mutation) ----
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

  -- ---- validate stock items (before any mutation) ----
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

  -- ---- idempotent invoice insert ----
  -- Merge server defaults for NOT NULL columns the invoice payload omits
  -- (updated_at, is_deleted, _dirty, created_at); the payload overrides them
  -- if present. This mirrors PostgREST default-filling for absent keys.
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
    -- Already committed by a prior (possibly lost) response: do NOT re-decrement.
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

  -- ---- newly inserted: mirror upsertInvoice's appointment cascade ----
  v_appt := NULLIF(v_full->>'appointmentId', '');
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments
    SET status = CASE WHEN (v_full->>'paymentStatus') = 'void' THEN 'booked' ELSE 'completed' END
    WHERE id = v_appt::uuid;
  END IF;

  -- ---- decrement every requested stock item via the existing FEFO RPC ----
  -- A failure here (e.g. ITEM_NOT_FOUND) raises and rolls back the invoice too.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_remaining := public.atomic_stock_decrement(v_item_id, (-v_qty)::integer);
    v_stock := v_stock || jsonb_build_object(v_item_id::text, v_remaining);
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_committed', false,
    'remaining_stock', v_stock
  );
END;
$$;

-- Least-privilege execution: match the existing app roles, never PUBLIC.
REVOKE ALL ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
  TO anon, authenticated, service_role;
