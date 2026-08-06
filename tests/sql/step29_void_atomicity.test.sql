-- Step 29 atomic-invoice-void verification (non-mutating, real pass/fail result set).
--
-- Run the whole block via Supabase MCP execute_sql or psql. It builds temp fixtures
-- inside ONE transaction, exercises void_invoice_and_reverse_revenue across scenarios,
-- SELECTs a (name, passed, detail) report, then ROLLBACKs — no data persists and the
-- pass/fail is a returned result set (NOT a RAISE). All rows must show passed = true.
--
-- The two SET LOCAL ROLE blocks at the end prove the invoker-security RPC works under
-- the live RLS policies for BOTH the anon and authenticated app roles (not just as an
-- elevated role). Concurrent-void safety is guaranteed by the SELECT ... FOR UPDATE
-- lock on the invoice row; the retry test (T2) demonstrates the idempotent outcome a
-- blocked concurrent caller sees after the first void commits.

BEGIN;
CREATE TEMP TABLE _r(name text, passed boolean, detail text) ON COMMIT DROP;

-- T1 normal paid void (restock + revenue reversal + status + ...) & T2 retry idempotency
DO $$
DECLARE i uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); inv uuid:=gen_random_uuid();
        r1 jsonb; r2 jsonb; stk numeric; csh numeric; st text;
BEGIN
  INSERT INTO inventory (id, stock) VALUES (i, 5);
  INSERT INTO shifts (id,"isOpen","cashCollectedCents") VALUES (s, false, 1000);
  INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","sales_total","shiftId")
    VALUES (inv, jsonb_build_array(jsonb_build_object('itemId', i::text,'category','retail','quantity',2)),
            'paid','cash',10, s::text);
  r1 := public.void_invoice_and_reverse_revenue(inv);
  r2 := public.void_invoice_and_reverse_revenue(inv);
  SELECT stock INTO stk FROM inventory WHERE id=i;
  SELECT "cashCollectedCents" INTO csh FROM shifts WHERE id=s;
  SELECT "paymentStatus" INTO st FROM invoices WHERE id=inv;
  INSERT INTO _r VALUES
   ('T1_normal_paid_void', COALESCE((r1->>'already_void')='false' AND (r1->>'reversed')='true'
       AND (r1->'restocked'->>(i::text))='7' AND stk=7 AND csh=0 AND st='void', false),
     format('r1=%s stock=%s cash=%s status=%s', r1, stk, csh, st)),
   ('T2_retry_idempotent', COALESCE((r2->>'already_void')='true' AND (r2->>'reversed')='false'
       AND stk=7 AND csh=0, false),
     format('r2=%s stock=%s cash=%s', r2, stk, csh));
END $$;

-- T3 stock-failure rollback (bad itemId -> RPC raises -> nothing changes)
DO $$
DECLARE s uuid:=gen_random_uuid(); inv uuid:=gen_random_uuid(); badi uuid:=gen_random_uuid();
        ok boolean:=false; msg text; st text; csh numeric;
BEGIN
  INSERT INTO shifts (id,"isOpen","cashCollectedCents") VALUES (s,false,500);
  INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","sales_total","shiftId")
    VALUES (inv, jsonb_build_array(jsonb_build_object('itemId', badi::text,'category','retail','quantity',2)),
            'paid','cash',5, s::text);
  BEGIN PERFORM public.void_invoice_and_reverse_revenue(inv);
  EXCEPTION WHEN others THEN ok:=true; msg:=SQLERRM; END;
  SELECT "paymentStatus" INTO st FROM invoices WHERE id=inv;
  SELECT "cashCollectedCents" INTO csh FROM shifts WHERE id=s;
  INSERT INTO _r VALUES ('T3_stock_failure_rollback',
    COALESCE(ok AND st<>'void' AND csh=500, false),
    format('raised=%s status=%s cash=%s err=%s', ok, st, csh, msg));
END $$;

-- T4 missing shiftId on paid -> rejected, no change
DO $$
DECLARE inv uuid:=gen_random_uuid(); ok boolean:=false; msg text; st text;
BEGIN
  INSERT INTO invoices (id,"paymentStatus","paymentMethod","sales_total","shiftId")
    VALUES (inv,'paid','cash',5,'');
  BEGIN PERFORM public.void_invoice_and_reverse_revenue(inv);
  EXCEPTION WHEN others THEN ok:=(SQLERRM LIKE '%MISSING_SHIFT_ID%'); msg:=SQLERRM; END;
  SELECT "paymentStatus" INTO st FROM invoices WHERE id=inv;
  INSERT INTO _r VALUES ('T4_missing_shiftId_rejected',
    COALESCE(ok AND st<>'void', false), format('err=%s status=%s', msg, st));
END $$;

-- T5 unpaid void -> restocks, no revenue reversal
DO $$
DECLARE i uuid:=gen_random_uuid(); inv uuid:=gen_random_uuid(); r jsonb; stk numeric; st text;
BEGIN
  INSERT INTO inventory (id, stock) VALUES (i, 1);
  INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","sales_total","shiftId")
    VALUES (inv, jsonb_build_array(jsonb_build_object('itemId', i::text,'category','retail','quantity',3)),
            'unpaid','cash',9,'');
  r := public.void_invoice_and_reverse_revenue(inv);
  SELECT stock INTO stk FROM inventory WHERE id=i;
  SELECT "paymentStatus" INTO st FROM invoices WHERE id=inv;
  INSERT INTO _r VALUES ('T5_unpaid_void_restocks_no_reversal',
    COALESCE((r->>'reversed')='false' AND (r->>'already_void')='false' AND stk=4 AND st='void', false),
    format('r=%s stock=%s status=%s', r, stk, st));
END $$;

-- T6 split-payment reversal
DO $$
DECLARE s uuid:=gen_random_uuid(); inv uuid:=gen_random_uuid(); r jsonb; csh numeric; crd numeric;
BEGIN
  INSERT INTO shifts (id,"isOpen","cashCollectedCents","cardCollectedCents") VALUES (s,false,1000,500);
  INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","splitPayments","sales_total","shiftId")
    VALUES (inv, '[]'::jsonb, 'paid','split',
            jsonb_build_array(jsonb_build_object('method','cash','amount',10),
                              jsonb_build_object('method','card','amount',5)), 15, s::text);
  r := public.void_invoice_and_reverse_revenue(inv);
  SELECT "cashCollectedCents", "cardCollectedCents" INTO csh, crd FROM shifts WHERE id=s;
  INSERT INTO _r VALUES ('T6_split_payment_reversal',
    COALESCE((r->>'reversed')='true' AND csh=0 AND crd=0, false),
    format('r=%s cash=%s card=%s', r, csh, crd));
END $$;

SELECT name, passed, detail FROM _r ORDER BY name;
ROLLBACK;

-- T7 authenticated-role RLS: the invoker-security RPC applies all effects as the
-- authenticated app role under live policies (passed=true expected).
BEGIN;
INSERT INTO inventory (id, stock) VALUES ('11111111-1111-1111-1111-111111111111', 5);
INSERT INTO shifts (id,"isOpen","cashCollectedCents") VALUES ('22222222-2222-2222-2222-222222222222', false, 1000);
INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","sales_total","shiftId")
  VALUES ('33333333-3333-3333-3333-333333333333',
          jsonb_build_array(jsonb_build_object('itemId','11111111-1111-1111-1111-111111111111','category','retail','quantity',2)),
          'paid','cash',10,'22222222-2222-2222-2222-222222222222');
SET LOCAL ROLE authenticated;
SELECT public.void_invoice_and_reverse_revenue('33333333-3333-3333-3333-333333333333');
RESET ROLE;
SELECT 'authenticated' AS role,
  ((SELECT "paymentStatus" FROM invoices WHERE id='33333333-3333-3333-3333-333333333333')='void'
   AND (SELECT stock FROM inventory WHERE id='11111111-1111-1111-1111-111111111111')=7
   AND (SELECT "cashCollectedCents" FROM shifts WHERE id='22222222-2222-2222-2222-222222222222')=0) AS passed;
ROLLBACK;

-- T8 anon-role RLS: same, executed as the anon app role.
BEGIN;
INSERT INTO inventory (id, stock) VALUES ('44444444-4444-4444-4444-444444444444', 5);
INSERT INTO shifts (id,"isOpen","cashCollectedCents") VALUES ('55555555-5555-5555-5555-555555555555', false, 1000);
INSERT INTO invoices (id, items,"paymentStatus","paymentMethod","sales_total","shiftId")
  VALUES ('66666666-6666-6666-6666-666666666666',
          jsonb_build_array(jsonb_build_object('itemId','44444444-4444-4444-4444-444444444444','category','retail','quantity',2)),
          'paid','cash',10,'55555555-5555-5555-5555-555555555555');
SET LOCAL ROLE anon;
SELECT public.void_invoice_and_reverse_revenue('66666666-6666-6666-6666-666666666666');
RESET ROLE;
SELECT 'anon' AS role,
  ((SELECT "paymentStatus" FROM invoices WHERE id='66666666-6666-6666-6666-666666666666')='void'
   AND (SELECT stock FROM inventory WHERE id='44444444-4444-4444-4444-444444444444')=7
   AND (SELECT "cashCollectedCents" FROM shifts WHERE id='55555555-5555-5555-5555-555555555555')=0) AS passed;
ROLLBACK;
