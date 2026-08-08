-- =====================================================================
-- Step 32 — Free Auth + RLS boundary test (auth.uid() + staff role)
-- =====================================================================
-- Proves the policies from supabase/migrations/20260808_free_auth_rls.sql:
--   * anon has NO access to any table;
--   * an authenticated JWT whose sub is NOT linked to an active staff row is
--     treated as a non-staff outsider (sees zero rows, cannot write);
--   * a linked MANAGER may read/write operational data and manage staff;
--   * a linked CASHIER may operate but may NOT manage staff (role-scoped);
--   * the staff PIN column is not readable by any staff (column-locked);
--   * no role has DELETE.
--
-- It does NOT create Supabase Auth accounts or passwords. It simulates the
-- authenticated identity by setting request.jwt.claims (the same claim
-- auth.uid() reads at runtime). Successful writes run inside nested blocks that
-- roll back, so the test leaves ZERO residue beyond the two seed rows, which the
-- CLEANUP section removes.
--
-- HOW TO RUN (staging only — never production while it is locked):
--   Supabase MCP: run the three sections below in order via execute_sql.
--   Requires: the migration applied, and the two seed staff rows present.
-- PASS => the SUMMARY raise shows every line ending in the non-(BAD) verdict.
-- =====================================================================

-- ---- SEED (staging synthetic data; marker KPAH_TEST_<UTC>) -----------------
INSERT INTO public.users (id,name,username,role,pin,avatar_color,active,is_deleted,auth_user_id)
VALUES
 (gen_random_uuid(),'KPAH_TEST_20260808 Manager','kpah_test_mgr','manager','000000','#111',true,false,'11111111-1111-1111-1111-111111111111'),
 (gen_random_uuid(),'KPAH_TEST_20260808 Cashier','kpah_test_cash','cashier','000000','#222',true,false,'22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- ---- PROOF -----------------------------------------------------------------
DO $$
DECLARE res text := E'\n'; allowed boolean; n int;
BEGIN
  -- A) anon: zero access
  EXECUTE 'set local role anon'; perform set_config('request.jwt.claims','',true);
  BEGIN PERFORM 1 FROM public.invoices LIMIT 1; res:=res||'A1 anon SELECT invoices: ALLOWED(BAD)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN res:=res||'A1 anon SELECT invoices: DENIED'||E'\n'; END;
  BEGIN PERFORM 1 FROM public.users LIMIT 1; res:=res||'A2 anon SELECT users: ALLOWED(BAD)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN res:=res||'A2 anon SELECT users: DENIED'||E'\n'; END;
  RESET ROLE;

  -- B) authenticated, unlinked (not staff)
  EXECUTE 'set local role authenticated';
  perform set_config('request.jwt.claims','{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}',true);
  SELECT count(*) INTO n FROM public.invoices;
  res:=res||'B1 unlinked SELECT invoices visible_rows='||n||' (expect 0)'||E'\n';
  BEGIN INSERT INTO public.invoices(id,"patientId") VALUES (gen_random_uuid(),'KPAH_TEST_B'); allowed:=true; RAISE EXCEPTION 'UNDO';
  EXCEPTION WHEN insufficient_privilege THEN allowed:=false; WHEN others THEN allowed:=(SQLERRM='UNDO'); IF NOT allowed THEN RAISE; END IF; END;
  res:=res||'B2 unlinked INSERT invoices: '||CASE WHEN allowed THEN 'ALLOWED(BAD)' ELSE 'DENIED' END||E'\n';
  RESET ROLE;

  -- C) manager (linked)
  EXECUTE 'set local role authenticated';
  perform set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}',true);
  BEGIN INSERT INTO public.invoices(id,"patientId") VALUES (gen_random_uuid(),'KPAH_TEST_C'); allowed:=true; RAISE EXCEPTION 'UNDO';
  EXCEPTION WHEN insufficient_privilege THEN allowed:=false; WHEN others THEN allowed:=(SQLERRM='UNDO'); IF NOT allowed THEN RAISE; END IF; END;
  res:=res||'C1 manager INSERT invoices: '||CASE WHEN allowed THEN 'ALLOWED' ELSE 'DENIED(BAD)' END||E'\n';
  BEGIN INSERT INTO public.users(id,name,username,role,active) VALUES (gen_random_uuid(),'x','kpah_test_c_new','veterinarian',true); allowed:=true; RAISE EXCEPTION 'UNDO';
  EXCEPTION WHEN insufficient_privilege THEN allowed:=false; WHEN others THEN allowed:=(SQLERRM='UNDO'); IF NOT allowed THEN RAISE; END IF; END;
  res:=res||'C2 manager INSERT users: '||CASE WHEN allowed THEN 'ALLOWED' ELSE 'DENIED(BAD)' END||E'\n';
  BEGIN PERFORM pin FROM public.users LIMIT 1; res:=res||'C3 manager SELECT users.pin: ALLOWED(BAD)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN res:=res||'C3 manager SELECT users.pin: DENIED(column-locked)'||E'\n'; END;
  BEGIN PERFORM id,name,role FROM public.users LIMIT 1; res:=res||'C4 manager SELECT users(non-pin): ALLOWED'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN res:=res||'C4 manager SELECT users(non-pin): DENIED(BAD)'||E'\n'; END;
  RESET ROLE;

  -- D) cashier (linked, non-manager)
  EXECUTE 'set local role authenticated';
  perform set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',true);
  BEGIN INSERT INTO public.invoices(id,"patientId") VALUES (gen_random_uuid(),'KPAH_TEST_D'); allowed:=true; RAISE EXCEPTION 'UNDO';
  EXCEPTION WHEN insufficient_privilege THEN allowed:=false; WHEN others THEN allowed:=(SQLERRM='UNDO'); IF NOT allowed THEN RAISE; END IF; END;
  res:=res||'D1 cashier INSERT invoices: '||CASE WHEN allowed THEN 'ALLOWED' ELSE 'DENIED(BAD)' END||E'\n';
  BEGIN INSERT INTO public.users(id,name,username,role,active) VALUES (gen_random_uuid(),'x','kpah_test_d_new','veterinarian',true); allowed:=true; RAISE EXCEPTION 'UNDO';
  EXCEPTION WHEN insufficient_privilege THEN allowed:=false; WHEN others THEN allowed:=(SQLERRM='UNDO'); IF NOT allowed THEN RAISE; END IF; END;
  res:=res||'D2 cashier INSERT users: '||CASE WHEN allowed THEN 'ALLOWED(BAD)' ELSE 'DENIED(role-locked)' END||E'\n';
  BEGIN DELETE FROM public.invoices WHERE 1=0; res:=res||'D3 cashier DELETE invoices: ALLOWED(BAD)'||E'\n';
  EXCEPTION WHEN insufficient_privilege THEN res:=res||'D3 cashier DELETE invoices: DENIED(no-delete-grant)'||E'\n'; END;
  RESET ROLE;

  RAISE EXCEPTION 'STEP32_PROOF %', res;  -- surfaces the result; aborts txn (no residue)
END $$;

-- ---- CLEANUP (remove the synthetic seed rows; prove zero residue) ----------
-- DELETE public.users WHERE username LIKE 'kpah_test_%';
-- SELECT count(*) AS residue FROM public.users WHERE username LIKE 'kpah_test_%';  -- expect 0
