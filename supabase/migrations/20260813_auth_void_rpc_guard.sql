-- Step 35 — Auth-guarded invoice void RPC
--
-- The browser calls this wrapper, never the SECURITY INVOKER accounting
-- function directly. The wrapper verifies the live Supabase Auth identity and
-- then runs the existing atomic void boundary with its owner privileges.

DO $$
BEGIN
  IF to_regprocedure('public.void_invoice_and_reverse_revenue(uuid)') IS NULL THEN
    RAISE EXCEPTION 'void invoice RPC is missing; apply the accounting schema first';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_revenue_auth(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  RETURN public.void_invoice_and_reverse_revenue(p_invoice_id);
END;
$$;

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_revenue_auth(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_revenue_auth(uuid)
  TO authenticated, service_role;
