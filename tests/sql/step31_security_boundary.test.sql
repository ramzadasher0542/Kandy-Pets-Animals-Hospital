-- =====================================================================
-- Step 31 — Security boundary tests (run against production or a mirror)
-- =====================================================================
-- Purpose: prove the public data plane is CLOSED to the internet-facing
-- roles after 20260807_security_hardening.sql. Read-only: it never inserts,
-- updates, deletes, or truncates real rows (every attempt is expected to be
-- DENIED before it can mutate anything, and the block aborts on failure).
--
-- HOW TO RUN
--   Supabase MCP:  paste the DO block below into execute_sql.
--   psql:          psql "$DATABASE_URL" -f tests/sql/step31_security_boundary.test.sql
--
-- PASS  => the final NOTICE reads "STEP31 SECURITY BOUNDARY: ALL PASS".
-- FAIL  => the block RAISES with the first assertion that did not hold.
-- =====================================================================

DO $$
DECLARE
  ok boolean;
BEGIN
  -- Helper assertion: RAISE if condition is false.
  -- (Inlined per-check below; plpgsql has no local proc.)

  -- --- 1. anon has NO table privileges on representative clinic tables ------
  IF has_table_privilege('anon','public.invoices','SELECT')
     OR has_table_privilege('anon','public.medical_records','SELECT')
     OR has_table_privilege('anon','public.users','SELECT')
     OR has_table_privilege('anon','public.invoices','INSERT')
     OR has_table_privilege('anon','public.invoices','UPDATE')
     OR has_table_privilege('anon','public.invoices','DELETE')
     OR has_table_privilege('anon','public.invoices','TRUNCATE') THEN
    RAISE EXCEPTION 'FAIL: anon still holds table privileges on clinic tables';
  END IF;

  -- --- 2. authenticated has only the Free Auth/RLS write surface -------------
  -- Authenticated staff intentionally receive explicit SELECT/INSERT/UPDATE
  -- grants; RLS policies then restrict those operations to linked active staff.
  -- Destructive table privileges must remain closed.
  IF has_table_privilege('authenticated','public.invoices','DELETE')
     OR has_table_privilege('authenticated','public.invoices','TRUNCATE')
     OR has_table_privilege('authenticated','public.users','DELETE')
     OR has_table_privilege('authenticated','public.users','TRUNCATE') THEN
    RAISE EXCEPTION 'FAIL: authenticated still holds destructive table privileges';
  END IF;

  -- --- 3. Neither anon nor authenticated can execute wipe_all_tables --------
  IF has_function_privilege('anon','public.wipe_all_tables()','EXECUTE')
     OR has_function_privilege('authenticated','public.wipe_all_tables()','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: wipe_all_tables is still executable by anon/authenticated';
  END IF;

  -- --- 4. anon cannot execute the accounting RPCs --------------------------
  IF has_function_privilege('anon','public.commit_checkout_invoice_and_stock(jsonb,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.void_invoice_and_reverse_revenue(uuid)','EXECUTE')
     OR has_function_privilege('anon','public.close_shift_and_reconcile(uuid,numeric,numeric,numeric,text,jsonb)','EXECUTE')
     OR has_function_privilege('anon','public.apply_shift_revenue(uuid,integer,integer,integer)','EXECUTE')
     OR has_function_privilege('anon','public.atomic_stock_decrement(uuid,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: an accounting RPC is still executable by anon';
  END IF;

  -- --- 5. No permissive USING(true)/WITH CHECK(true) policies remain -------
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname='public' AND (qual='true' OR with_check='true')) THEN
    RAISE EXCEPTION 'FAIL: permissive true policies still exist';
  END IF;

  -- --- 6. Runtime probe as anon: every dangerous op must be DENIED ---------
  SET LOCAL role anon;
  BEGIN
    PERFORM 1 FROM public.invoices LIMIT 1;
    RESET role; RAISE EXCEPTION 'FAIL: anon SELECT on invoices was ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected
    WHEN others THEN RESET role; RAISE;
  END;
  BEGIN
    PERFORM public.wipe_all_tables();
    RESET role; RAISE EXCEPTION 'FAIL: anon EXECUTE wipe_all_tables was ALLOWED';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;  -- expected
    WHEN undefined_function     THEN NULL;  -- also acceptable (not visible to anon)
    WHEN others THEN RESET role; RAISE;
  END;
  RESET role;

  -- --- 7. service_role retains the verified server-side path ---------------
  IF NOT has_function_privilege('service_role','public.commit_checkout_invoice_and_stock(jsonb,jsonb)','EXECUTE')
     OR NOT has_table_privilege('service_role','public.invoices','SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role lost the verified server-side path';
  END IF;

  RAISE NOTICE 'STEP31 SECURITY BOUNDARY: ALL PASS';
END $$;
