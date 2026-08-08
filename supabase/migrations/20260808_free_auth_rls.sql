-- =====================================================================
-- Step 32 — Free-tier Supabase Auth + real RLS (auth.uid() + staff role)
-- =====================================================================
-- Targets PRODUCTION's real schema: the staff table is public.users (NOT the
-- bootstrap file's staff_users). Every table op is guarded with to_regclass so
-- this same file runs safely on a partially-provisioned staging DB (kpah-dev)
-- and later, unchanged, on full production.
--
-- DESIGN
--   * Staff authenticate via Supabase Auth email/password (free tier). The
--     browser gets a real `authenticated` JWT whose `sub` = auth.uid().
--   * public.users gains a NULLABLE `auth_user_id uuid UNIQUE` that maps one
--     staff record to one auth identity. No FK to auth.users (cross-schema) —
--     the login flow only ever writes a real auth.uid(); integrity is by code.
--   * RLS policies use SECURITY DEFINER helpers that resolve auth.uid() -> the
--     staff row (active, not deleted). No policy trusts a PIN, header, or
--     client-supplied role. The PIN stays ONLY as a second-confirmation UX gate.
--   * anon keeps ZERO access. authenticated gets the MINIMUM: operational tables
--     for any active staff; the credentials table (users) is read-only to staff
--     WITHOUT the pin column and writable only by manager/owner; deletion_audit
--     stays deny-by-default; wipe_all_tables stays revoked.
--
-- SAFETY: permission/policy DDL only — no row mutation. Reversible by dropping
-- the policies/functions and re-revoking grants. Do NOT apply to production
-- until an owner-created staff Auth account is linked and the login is proven.
-- =====================================================================

-- 1. Mapping column ----------------------------------------------------
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
    -- one auth identity maps to at most one staff row
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='users_auth_user_id_key'
    ) THEN
      EXECUTE 'CREATE UNIQUE INDEX users_auth_user_id_key ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL';
    END IF;
  END IF;
END $$;

-- 2. Identity helpers (SECURITY DEFINER so policies never recurse on users) ---
CREATE OR REPLACE FUNCTION public.is_staff()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_user_id = auth.uid()
      AND active = true AND COALESCE(is_deleted,false) = false
  );
$$;

CREATE OR REPLACE FUNCTION public.current_staff_role()
  RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.users
  WHERE auth_user_id = auth.uid()
    AND active = true AND COALESCE(is_deleted,false) = false
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_staff_manager()
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.current_staff_role() IN ('manager','owner','admin','provider');
$$;

REVOKE ALL ON FUNCTION public.is_staff()             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_staff_role()   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff_manager()     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff()           TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_staff_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff_manager()   TO authenticated;

-- 3. Operational tables: any ACTIVE staff may read/write (no DELETE) ----------
DO $$
DECLARE
  t text;
  op_tables text[] := ARRAY[
    'appointments','boarding_records','cash_adjustments','clients','clinic_queue',
    'grooming_logs','inventory','inventory_batches','inventory_categories','invoices',
    'lab_results','medical_records','notifications','pets','shift_reconciliations',
    'shifts','suppliers','system_alerts','system_config','vaccinations'
  ];
BEGIN
  FOREACH t IN ARRAY op_tables LOOP
    IF to_regclass('public.'||t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_select ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS staff_update ON public.%I', t);
    EXECUTE format('CREATE POLICY staff_select ON public.%I FOR SELECT TO authenticated USING (public.is_staff())', t);
    EXECUTE format('CREATE POLICY staff_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_staff())', t);
    EXECUTE format('CREATE POLICY staff_update ON public.%I FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', t);
    -- minimum privileges: no DELETE, no TRUNCATE
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- 4. Credentials table (public.users): read = staff (NO pin column),
--    write = manager/owner only. anon: nothing.
DO $$ BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.users ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS staff_select_users ON public.users';
    EXECUTE 'DROP POLICY IF EXISTS staff_insert_users ON public.users';
    EXECUTE 'DROP POLICY IF EXISTS staff_update_users ON public.users';
    EXECUTE 'CREATE POLICY staff_select_users ON public.users FOR SELECT TO authenticated USING (public.is_staff())';
    EXECUTE 'CREATE POLICY staff_insert_users ON public.users FOR INSERT TO authenticated WITH CHECK (public.is_staff_manager())';
    EXECUTE 'CREATE POLICY staff_update_users ON public.users FOR UPDATE TO authenticated USING (public.is_staff_manager()) WITH CHECK (public.is_staff_manager())';
    -- Column-level: authenticated may SELECT everything EXCEPT the pin hash.
    EXECUTE 'REVOKE ALL ON public.users FROM anon, authenticated';
    EXECUTE 'GRANT SELECT (id, name, username, role, avatar_color, active, is_deleted, created_at, updated_at, auth_user_id) ON public.users TO authenticated';
    EXECUTE 'GRANT INSERT, UPDATE ON public.users TO authenticated';
  END IF;
END $$;

-- 5. Keep the destructive surface closed (idempotent re-assert) ---------------
DO $$ BEGIN
  IF to_regprocedure('public.wipe_all_tables()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wipe_all_tables() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 6. Future-proof default privileges: authenticated never auto-granted DELETE.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
-- (authenticated table access is granted explicitly per-table above.)
