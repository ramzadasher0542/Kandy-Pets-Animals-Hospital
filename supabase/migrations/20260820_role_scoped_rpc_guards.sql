-- Step 37 - role-scoped mutation boundaries
--
-- The earlier Auth guards proved that the caller was an active staff member,
-- but did not check the staff role. That allowed any linked staff account to
-- reach invoice-void and shift-close RPCs directly. This migration narrows the
-- high-risk RPCs and table writes without changing the free-tier architecture.

DO $$
BEGIN
  IF to_regprocedure('public.commit_checkout_invoice_and_stock_impl(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'checkout implementation RPC is missing; apply Step 33 first';
  END IF;
  IF to_regprocedure('public.atomic_stock_decrement(uuid,integer)') IS NULL THEN
    RAISE EXCEPTION 'atomic stock RPC is missing; apply the stock schema first';
  END IF;
END
$$;

-- Inventory consumption/adjustment entry point used by the browser. Clinical
-- staff may consume stock for care, but may not increase stock or edit the
-- catalog. Positive adjustments remain an operational/admin capability.
CREATE OR REPLACE FUNCTION public.atomic_stock_decrement_auth(
  p_item_id uuid,
  p_qty_delta integer
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  v_role := public.current_staff_role();
  IF v_role NOT IN ('cashier', 'veterinarian', 'manager', 'owner', 'admin', 'provider')
     OR (v_role = 'veterinarian' AND p_qty_delta > 0) THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED: stock mutation';
  END IF;

  RETURN public.atomic_stock_decrement(p_item_id, p_qty_delta);
END;
$$;

REVOKE ALL ON FUNCTION public.atomic_stock_decrement_auth(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atomic_stock_decrement_auth(uuid, integer)
  TO authenticated, service_role;

-- Checkout is a POS operation, not a clinical-staff operation. Validate the
-- canonical financial fields before the privileged implementation runs. The
-- tax rate is read from the same global configuration used by the UI.
CREATE OR REPLACE FUNCTION public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_line jsonb;
  v_lines_total numeric := 0;
  v_subtotal numeric;
  v_discount numeric;
  v_tax numeric;
  v_sales_total numeric;
  v_tax_rate numeric := 0;
  v_taxable numeric;
  v_expected_tax numeric;
  v_line_qty numeric;
  v_line_unit numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'STAFF_AUTH_REQUIRED';
  END IF;

  v_role := public.current_staff_role();
  IF v_role NOT IN ('cashier', 'owner', 'manager', 'admin', 'provider') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED: checkout';
  END IF;

  BEGIN
    v_subtotal := NULLIF(p_invoice->>'subtotal', '')::numeric;
    v_discount := NULLIF(p_invoice->>'discount', '')::numeric;
    v_tax := NULLIF(p_invoice->>'tax', '')::numeric;
    v_sales_total := NULLIF(p_invoice->>'sales_total', '')::numeric;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_TOTALS';
  END;

  IF p_invoice IS NULL
     OR jsonb_typeof(p_invoice) <> 'object'
     OR jsonb_typeof(p_invoice->'items') <> 'array'
     OR v_subtotal IS NULL OR v_discount IS NULL OR v_tax IS NULL OR v_sales_total IS NULL
     OR v_subtotal < 0 OR v_discount < 0 OR v_tax < 0 OR v_sales_total < 0 THEN
    RAISE EXCEPTION 'INVALID_FINANCIAL_TOTALS';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_invoice->'items') LOOP
    v_line_qty := NULLIF(v_line->>'quantity', '')::numeric;
    v_line_unit := NULLIF(v_line->>'unitPrice', '')::numeric;
    IF v_line_qty IS NULL OR v_line_unit IS NULL OR v_line_qty <= 0 OR v_line_unit < 0 THEN
      RAISE EXCEPTION 'INVALID_INVOICE_LINE';
    END IF;
    v_lines_total := v_lines_total
      + (v_line_qty * v_line_unit);
  END LOOP;

  IF abs(v_lines_total - v_subtotal) > 0.01 THEN
    RAISE EXCEPTION 'INVOICE_SUBTOTAL_MISMATCH';
  END IF;

  SELECT COALESCE(tax_rate, 0) INTO v_tax_rate
  FROM public.system_config
  WHERE id = 'global';
  v_tax_rate := COALESCE(v_tax_rate, 0);
  v_taxable := GREATEST(0, v_subtotal - v_discount);
  v_expected_tax := round(v_taxable * v_tax_rate, 0);

  IF abs(v_tax - v_expected_tax) > 0.01
     OR abs(v_sales_total - (v_taxable + v_tax)) > 0.01 THEN
    RAISE EXCEPTION 'INVOICE_TOTAL_MISMATCH';
  END IF;

  RETURN public.commit_checkout_invoice_and_stock_impl(p_invoice, p_stock_items);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_checkout_invoice_and_stock(jsonb, jsonb)
  TO authenticated, service_role;

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
  IF public.current_staff_role() NOT IN ('owner', 'manager', 'admin', 'provider') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED: void invoice';
  END IF;
  RETURN public.void_invoice_and_reverse_revenue(p_invoice_id);
END;
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
  IF public.current_staff_role() NOT IN ('cashier', 'owner', 'manager', 'admin', 'provider') THEN
    RAISE EXCEPTION 'ROLE_NOT_ALLOWED: close shift';
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

REVOKE ALL ON FUNCTION public.void_invoice_and_reverse_revenue_auth(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_invoice_and_reverse_revenue_auth(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.close_shift_and_reconcile_auth(uuid,numeric,numeric,numeric,text,jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_shift_and_reconcile_auth(uuid,numeric,numeric,numeric,text,jsonb)
  TO authenticated, service_role;

-- Narrow direct table writes as a second line of defence. The RPCs above remain
-- the preferred mutation path; these policies stop a browser from bypassing
-- the role checks by calling PostgREST directly.
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.invoices;
    DROP POLICY IF EXISTS staff_update ON public.invoices;
    CREATE POLICY staff_insert ON public.invoices FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.invoices FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
  END IF;

  IF to_regclass('public.inventory') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.inventory;
    DROP POLICY IF EXISTS staff_update ON public.inventory;
    CREATE POLICY staff_insert ON public.inventory FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.inventory FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
  END IF;

  IF to_regclass('public.inventory_batches') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.inventory_batches;
    DROP POLICY IF EXISTS staff_update ON public.inventory_batches;
    CREATE POLICY staff_insert ON public.inventory_batches FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.inventory_batches FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
  END IF;

  IF to_regclass('public.medical_records') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.medical_records;
    DROP POLICY IF EXISTS staff_update ON public.medical_records;
    CREATE POLICY staff_insert ON public.medical_records FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['veterinarian','manager','admin','provider']));
    CREATE POLICY staff_update ON public.medical_records FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['veterinarian','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['veterinarian','manager','admin','provider']));
  END IF;

  IF to_regclass('public.shifts') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.shifts;
    DROP POLICY IF EXISTS staff_update ON public.shifts;
    CREATE POLICY staff_insert ON public.shifts FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.shifts FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
  END IF;

  IF to_regclass('public.shift_reconciliations') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.shift_reconciliations;
    DROP POLICY IF EXISTS staff_update ON public.shift_reconciliations;
    CREATE POLICY staff_insert ON public.shift_reconciliations FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.shift_reconciliations FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
  END IF;

  IF to_regclass('public.cash_adjustments') IS NOT NULL THEN
    DROP POLICY IF EXISTS staff_insert ON public.cash_adjustments;
    DROP POLICY IF EXISTS staff_update ON public.cash_adjustments;
    CREATE POLICY staff_insert ON public.cash_adjustments FOR INSERT TO authenticated
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['cashier','owner','manager','admin','provider']));
    CREATE POLICY staff_update ON public.cash_adjustments FOR UPDATE TO authenticated
      USING (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']))
      WITH CHECK (public.current_staff_role() = ANY (ARRAY['owner','manager','admin','provider']));
  END IF;
END
$$;

