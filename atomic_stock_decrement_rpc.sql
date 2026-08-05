-- Atomic stock adjustment RPC (Step 17)
-- Serializes stock changes at the DATABASE level, replacing the client-side
-- read-modify-write in src/lib/db.ts:atomicStockDecrement. The whole adjustment
-- runs in one transaction (a plpgsql function is atomic) and takes row locks
-- (FOR UPDATE) on the inventory row and every affected batch row, so two browsers
-- can no longer overwrite each other or leave a partial batch update.
--
-- Semantics preserved EXACTLY from the current client implementation:
--   * negative delta  -> consume active (quantityRemaining > 0) non-deleted batches
--                        in expiry order (FEFO), flooring naturally, no oversell below 0;
--   * positive delta  -> return stock to the newest non-deleted batch (max expiryDate);
--   * no-batch item   -> apply delta directly to inventory.stock, clamped at 0;
--   * soft-deleted batches (is_deleted = true) are ignored throughout;
--   * for batch-tracked items, inventory.stock is recomputed as the sum of remaining
--     batch quantities, and expiryDate/lotNumber point at the soonest active batch
--     (NULL when none remain active);
--   * returns the resulting numeric stock.
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
  v_remaining integer;
  v_consume integer;
  v_total numeric;
  v_expiry text;
  v_lot text;
  v_newest_id uuid;
  b RECORD;
BEGIN
  -- Lock the target inventory row; fail closed if it does not exist
  -- (mirrors the client's ITEM_NOT_FOUND throw).
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
      -- FEFO consumption across active batches, soonest expiry first.
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

  -- No batches: manual-stock item. Apply the delta directly, clamp at 0.
  v_item_stock := GREATEST(0, v_item_stock + p_qty_delta);
  UPDATE public.inventory
  SET stock = v_item_stock,
      updated_at = now()
  WHERE id = p_item_id;
  RETURN v_item_stock;
END;
$$;

-- Least-privilege execution: match the existing table grantees, no broadening.
REVOKE ALL ON FUNCTION public.atomic_stock_decrement(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.atomic_stock_decrement(uuid, integer)
  TO anon, authenticated, service_role;
