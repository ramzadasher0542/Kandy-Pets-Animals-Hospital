-- Atomic stock adjustment RPC (Step 17, made strict in Step 19)
-- Serializes stock changes at the DATABASE level, replacing the client-side
-- read-modify-write in src/lib/db.ts:atomicStockDecrement. The whole adjustment
-- runs in one transaction (a plpgsql function is atomic) and takes row locks
-- (FOR UPDATE) on the inventory row and every affected batch row, so two browsers
-- can no longer overwrite each other or leave a partial batch update.
--
-- Semantics:
--   * negative delta  -> STRICT: availability is computed from the (locked)
--                        non-deleted batches (or inventory.stock for manual items)
--                        BEFORE any write; if requested > available it raises
--                        INSUFFICIENT_STOCK and changes nothing (no clamp, no
--                        partial batch consumption). Otherwise it consumes active
--                        (quantityRemaining > 0) non-deleted batches in expiry
--                        order (FEFO);
--   * positive delta  -> return stock to the newest non-deleted batch (max expiryDate);
--   * no-batch item   -> apply delta directly to inventory.stock (strict on negatives);
--   * soft-deleted batches (is_deleted = true) are ignored throughout;
--   * for batch-tracked items, inventory.stock is recomputed as the sum of remaining
--     batch quantities, and expiryDate/lotNumber point at the soonest active batch
--     (NULL when none remain active);
--   * returns the resulting numeric stock.
--
-- INSUFFICIENT_STOCK propagates out of commit_checkout_invoice_and_stock (which
-- calls this function inside its invoice-plus-stock transaction), rolling back the
-- invoice too so an oversell records no sale.
--
-- SECURITY INVOKER: runs as the calling role and remains subject to the existing
-- RLS policies on inventory / inventory_batches -- identical access to today's
-- direct client writes, no privilege escalation. EXECUTE is granted only to the
-- roles that already hold table privileges (anon, authenticated, service_role).

CREATE OR REPLACE FUNCTION public.atomic_stock_decrement(
  p_item_id  uuid,
  p_qty_delta integer
) RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item_stock numeric;
  v_batch_count integer;
  v_available numeric;
  v_remaining integer;
  v_consume integer;
  v_total numeric;
  v_expiry text;
  v_lot text;
  v_newest_id uuid;
  b RECORD;
BEGIN
  -- Lock the target inventory row; fail closed if it does not exist.
  SELECT stock INTO v_item_stock
  FROM public.inventory
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: %', p_item_id;
  END IF;

  SELECT count(*) INTO v_batch_count
  FROM public.inventory_batches
  WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

  IF v_batch_count > 0 THEN
    IF p_qty_delta < 0 THEN
      -- Lock all non-deleted batches for this item BEFORE computing availability,
      -- then reject an oversell before touching any batch row (no partial consume).
      PERFORM 1 FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false
      FOR UPDATE;

      SELECT COALESCE(sum("quantityRemaining"), 0) INTO v_available
      FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

      IF abs(p_qty_delta) > v_available THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: item=%, requested=%, available=%',
          p_item_id, abs(p_qty_delta), v_available;
      END IF;

      -- FEFO consumption, soonest expiry first (rows already locked above).
      v_remaining := abs(p_qty_delta);
      FOR b IN
        SELECT id, "quantityRemaining"
        FROM public.inventory_batches
        WHERE "inventoryItemId" = p_item_id
          AND is_deleted = false
          AND "quantityRemaining" > 0
        ORDER BY "expiryDate" ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_consume := LEAST(b."quantityRemaining", v_remaining);
        UPDATE public.inventory_batches
        SET "quantityRemaining" = "quantityRemaining" - v_consume,
            updated_at = now()
        WHERE id = b.id;
        v_remaining := v_remaining - v_consume;
      END LOOP;

    ELSIF p_qty_delta > 0 THEN
      -- Return stock to the newest non-deleted batch (max expiryDate).
      SELECT id INTO v_newest_id
      FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false
      ORDER BY "expiryDate" DESC, id DESC
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        UPDATE public.inventory_batches
        SET "quantityRemaining" = "quantityRemaining" + p_qty_delta,
            updated_at = now()
        WHERE id = v_newest_id;
      END IF;
    END IF;

    -- Batch totals are the source of truth: recompute inventory.stock.
    SELECT COALESCE(sum("quantityRemaining"), 0) INTO v_total
    FROM public.inventory_batches
    WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

    -- expiry/lot follow the soonest-expiring active batch, else NULL.
    v_expiry := NULL;
    v_lot := NULL;
    SELECT "expiryDate", "lotNumber" INTO v_expiry, v_lot
    FROM public.inventory_batches
    WHERE "inventoryItemId" = p_item_id
      AND is_deleted = false
      AND "quantityRemaining" > 0
    ORDER BY "expiryDate" ASC, id ASC
    LIMIT 1;

    UPDATE public.inventory
    SET stock = v_total,
        "expiryDate" = v_expiry,
        "lotNumber" = v_lot,
        updated_at = now()
    WHERE id = p_item_id;

    RETURN v_total;
  END IF;

  -- No batches: manual-stock item. The inventory row is already locked above, so
  -- v_item_stock is the live availability. Reject an oversell before any update.
  IF p_qty_delta < 0 AND (v_item_stock + p_qty_delta) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: item=%, requested=%, available=%',
      p_item_id, abs(p_qty_delta), v_item_stock;
  END IF;
  v_item_stock := v_item_stock + p_qty_delta;
  UPDATE public.inventory
  SET stock = v_item_stock,
      updated_at = now()
  WHERE id = p_item_id;
  RETURN v_item_stock;
END;
$$;

-- Least-privilege execution: match the existing app roles, never PUBLIC.
REVOKE ALL ON FUNCTION public.atomic_stock_decrement(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atomic_stock_decrement(uuid, integer)
  TO anon, authenticated, service_role;
