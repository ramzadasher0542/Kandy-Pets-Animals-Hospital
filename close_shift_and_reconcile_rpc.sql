-- Step 25: atomic shift close + reconciliation RPC.
--
-- Replaces the two separate client calls (closeShift -> UPDATE shifts, then
-- upsertShiftReconciliation -> INSERT shift_reconciliations) with ONE plpgsql
-- function transaction: both writes commit together or neither does, so a failure
-- between them can no longer close the shift while losing the reconciliation.
--
-- Semantics are preserved EXACTLY from the previous closeShift + upsert:
--   * shifts row is updated with endTime (ISO-8601 UTC text, matching the client's
--     toISOString()), expectedCashCents / actualCashCents / discrepancyCents
--     (rounded, as closeShift did), notes (falling back to 'Shift closed'),
--     isOpen = false, actual_cash = round(actualCashCents)/100, discrepancy_reason,
--     updated_at = now();
--   * the reconciliation row is inserted with the same columns the prior upsert
--     wrote (id, timestamp, userId, userName, openingFloat, cashSales,
--     expectedClosing, actualClosing, discrepancy, status); updated_at / is_deleted
--     / _dirty use their column defaults exactly as before.
--   * fails with SHIFT_NOT_FOUND if the target shift does not exist (no silent
--     zero-row success), and validates the shift id and reconciliation id/payload
--     before mutating.
--
-- IDEMPOTENT BY p_shift_id (Step 26): the target shift row is locked FOR UPDATE and
-- its isOpen flag is checked first. Only an OPEN shift is closed + reconciled (one
-- insert). A retried/concurrent call after the shift is already closed performs NO
-- update and NO second insert and returns already_closed = true. The row lock
-- serializes concurrent calls so two callers can never both insert a reconciliation.
--
-- SECURITY INVOKER: runs as the caller and stays subject to the existing RLS on
-- shifts (UPDATE) and shift_reconciliations (INSERT), both already permitted for
-- anon/authenticated -- no RLS change, no privilege escalation. EXECUTE granted
-- only to the existing app roles, never PUBLIC.

CREATE OR REPLACE FUNCTION public.close_shift_and_reconcile(
  p_shift_id uuid,
  p_actual_cash_cents numeric,
  p_expected_cash_cents numeric,
  p_discrepancy_cents numeric,
  p_notes text,
  p_reconciliation jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_recon_id uuid;
  v_now_iso text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_is_open boolean;
BEGIN
  -- ---- validate before any mutation ----
  IF p_shift_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SHIFT_ID';
  END IF;
  IF p_reconciliation IS NULL OR jsonb_typeof(p_reconciliation) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_PAYLOAD';
  END IF;
  IF NULLIF(p_reconciliation->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_ID';
  END IF;
  BEGIN
    v_recon_id := (p_reconciliation->>'id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_ID';
  END;

  -- Lock the target shift row and read its state. The lock serializes concurrent
  -- calls so only one can proceed past the isOpen check to insert a reconciliation.
  SELECT "isOpen" INTO v_is_open
  FROM public.shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: %', p_shift_id;
  END IF;

  -- Idempotent: a retry/concurrent call after the shift is already closed does NOT
  -- re-close it and does NOT insert a second reconciliation.
  IF v_is_open = false THEN
    RETURN jsonb_build_object(
      'shift_id', p_shift_id,
      'already_closed', true,
      'reconciliation_id', NULL
    );
  END IF;

  -- 1) Close the shift (mirrors the previous closeShift update exactly).
  UPDATE public.shifts SET
    "endTime"            = v_now_iso,
    "expectedCashCents"  = round(p_expected_cash_cents),
    "actualCashCents"    = round(p_actual_cash_cents),
    "discrepancyCents"   = round(p_discrepancy_cents),
    notes                = COALESCE(NULLIF(p_notes, ''), 'Shift closed'),
    "isOpen"             = false,
    actual_cash          = round(p_actual_cash_cents) / 100.0,
    discrepancy_reason   = COALESCE(p_notes, ''),
    updated_at           = now()
  WHERE id = p_shift_id;

  -- 2) Insert the reconciliation row. Same columns the prior upsert wrote;
  --    updated_at / is_deleted / _dirty use their column defaults, as before.
  INSERT INTO public.shift_reconciliations
    (id, "timestamp", "userId", "userName", "openingFloat", "cashSales",
     "expectedClosing", "actualClosing", discrepancy, status)
  VALUES (
    v_recon_id,
    p_reconciliation->>'timestamp',
    p_reconciliation->>'userId',
    p_reconciliation->>'userName',
    (p_reconciliation->>'openingFloat')::numeric,
    (p_reconciliation->>'cashSales')::numeric,
    (p_reconciliation->>'expectedClosing')::numeric,
    (p_reconciliation->>'actualClosing')::numeric,
    (p_reconciliation->>'discrepancy')::numeric,
    p_reconciliation->>'status'
  );

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'already_closed', false,
    'reconciliation_id', v_recon_id
  );
END;
$$;

-- Least-privilege execution: existing app roles only, never PUBLIC.
REVOKE ALL ON FUNCTION public.close_shift_and_reconcile(uuid, numeric, numeric, numeric, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_shift_and_reconcile(uuid, numeric, numeric, numeric, text, jsonb)
  TO anon, authenticated, service_role;
