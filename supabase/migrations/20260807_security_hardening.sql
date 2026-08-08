-- =====================================================================
-- Step 31 — Security Hardening: contain the public data plane
-- =====================================================================
-- Project: cjpmsjjluqlfcyzuspni (production)
--
-- WHAT THIS DOES
--   The production API surface currently lets the `anon` role (whose key
--   ships in the browser bundle) SELECT/INSERT/UPDATE/DELETE/TRUNCATE every
--   public table and EXECUTE every function, including the destructive
--   `wipe_all_tables()`. RLS is "enabled" but every policy is USING(true),
--   so it protects nothing. This migration CLOSES that surface.
--
-- WHY REVOCATION, NOT NEW POLICIES
--   The app has no real Supabase Auth session and no verified server-side
--   path, so there is no identity to scope auth.uid() policies to. Rather
--   than invent a predicate, we revoke the public grants outright. The
--   browser data plane will go OFFLINE and FAIL SAFE — which is the intended
--   and preferable state versus "publicly writable". Real auth-scoped RLS is
--   a separate, follow-up task once a genuine auth model exists.
--
-- SAFETY
--   Permission revocation only. NO rows are inserted, updated, deleted, or
--   truncated. `service_role` and `postgres` retain full access, so the
--   management/MCP path and any future server-side path keep working.
--
-- ROLLBACK (if ever needed)
--   Re-GRANT the privileges to the intended role and recreate the policies:
--     GRANT ... ON ALL TABLES IN SCHEMA public TO <role>;
--     GRANT EXECUTE ON FUNCTION ... TO <role>;
--   (See supabase_schema.sql / shift_accounting_rpc.sql for prior grants.)
-- =====================================================================

begin;

-- 1. Destructive / SECURITY DEFINER functions — revoke from EVERYONE public.
--    (`REVOKE ... FROM PUBLIC` removes the implicit grant to all roles.)
revoke execute on function public.wipe_all_tables()               from public, anon, authenticated;
revoke execute on function public.auto_cancel_expired_bookings()  from public, anon, authenticated;

-- 2. Accounting / helper RPCs — remove anon (and authenticated) execute.
--    These run SECURITY INVOKER, so they would fail on table access after
--    step 3 anyway; revoking EXECUTE makes the closure explicit and auditable.
revoke execute on function public.commit_checkout_invoice_and_stock(jsonb, jsonb)                          from anon, authenticated;
revoke execute on function public.void_invoice_and_reverse_revenue(uuid)                                   from anon, authenticated;
revoke execute on function public.close_shift_and_reconcile(uuid, numeric, numeric, numeric, text, jsonb)  from anon, authenticated;
revoke execute on function public.apply_shift_revenue(uuid, integer, integer, integer)                     from anon, authenticated;
revoke execute on function public.atomic_stock_decrement(uuid, integer)                                    from anon, authenticated;

-- 3. Revoke ALL table / sequence / function privileges in `public`
--    from the two internet-facing roles.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- 4. Drop the permissive USING(true) / WITH CHECK(true) policies. With grants
--    revoked AND RLS still enabled, no-policy => deny-by-default. Dropping
--    them removes the false sense of protection and the audit finding.
do $$
declare r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and (qual = 'true' or with_check = 'true')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 5. Stop future auto-grants from reopening the surface. Tables in `public`
--    are owned by `postgres`; target that role's default privileges.
alter default privileges for role postgres in schema public revoke all     on tables    from anon, authenticated;
alter default privileges for role postgres in schema public revoke all     on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions  from anon, authenticated;

commit;
