-- Step 36 — Auth-guarded shift close RPC
--
-- The browser calls this wrapper, never the SECURITY INVOKER accounting
-- function directly. The wrapper verifies the live Supabase Auth identity and
-- then runs the existing atomic shift-close boundary with its owner privileges.

DO $$
BEGIN
  IF to_regprocedure('public.close_shift_and_reconcile(uuid,numeric,numeric,numeric,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'shift close RPC is missing; apply the accounting schema first';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.close_shift_and_reconcile_auth(
  p_shift_id uuid,
  p_actual_cash_cents numeric,
  p_expected_cash_cents numeric,
  p_discrepancy_cents numeric,
  p_notes text,
  p_reconciliation jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  RETURN public.close_shift_and_reconcile(
    p_shift_id,
    p_actual_cash_cents,
    p_expected_cash_cents,
    p_discrepancy_cents,
    p_notes,
    p_reconciliation
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_shift_and_reconcile_auth(uuid,numeric,numeric,numeric,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_shift_and_reconcile_auth(uuid,numeric,numeric,numeric,text,jsonb)
  TO authenticated, service_role;
