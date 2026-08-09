-- Step 33 — Auth-guarded checkout RPC
--
-- The historical checkout function calls stock and shift accounting helpers.
-- Those helpers remain unavailable to browser roles. This wrapper is the only
-- browser entry point and runs the existing implementation after verifying the
-- caller is an active, linked staff identity.

DO $$
BEGIN
  IF to_regprocedure('public.commit_checkout_invoice_and_stock(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'checkout RPC is missing; apply the checkout schema before this migration';
  END IF;

  IF to_regprocedure('public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)') IS NULL THEN
    ALTER FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
      RENAME TO commit_checkout_invoice_and_stock_impl;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.commit_checkout_invoice_and_stock_impl(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  RETURN public.commit_checkout_invoice_and_stock_impl(p_invoice, p_stock_items);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
  TO authenticated, service_role;

-- Browser sessions must never call the mutation helper directly.
REVOKE ALL ON FUNCTION public.atomic_stock_decrement(uuid, integer)
  FROM anon, authenticated;
