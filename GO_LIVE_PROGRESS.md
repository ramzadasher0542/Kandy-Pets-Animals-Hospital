# Go-Live Progress

Last verified: 2026-08-08

Guidance state: synced to the latest GitHub `main` checkout.

Latest repo commit (main): `2d2b88f`

Auth-login work: branch `step32-supabase-auth-login` (NOT merged, NOT deployed).

Live deployment: `https://kpah-aps.vercel.app/`

## Agent Gate

- Required code/SQL model: **Claude Opus 4.8**.
- Required live database tool: **Supabase MCP ON**.
- Current worker status: **Supabase MCP ON and connected** to production `cjpmsjjluqlfcyzuspni` and staging `wlqfftrxzfgxhbtsllwo` (kpah-dev). Live SQL/RLS evidence recorded below.

## Containment proof (production `cjpmsjjluqlfcyzuspni`, verified 2026-08-08)

- Public policies: **0**. anon table grants: **0**. authenticated table grants: **0**.
- Tables with RLS enabled: **22 / 22**.
- `wipe_all_tables()` and accounting RPCs are **not** executable by anon or authenticated.
- Live REST with the public anon key returns **HTTP 401 permission denied** for table reads and the wipe RPC.
- The browser app is intentionally **offline for cloud data** until a real Supabase Auth login is wired and proven — it fails safe, not silently.
- Applied via `supabase/migrations/20260807_security_hardening.sql`.

## Free Auth + RLS (Step 32) — staging proof only

- New migration `supabase/migrations/20260808_free_auth_rls.sql`: nullable `users.auth_user_id`
  mapping, SECURITY DEFINER identity helpers (`is_staff`, `current_staff_role`, `is_staff_manager`),
  and `auth.uid()` + staff-role RLS. anon stays closed; `users.pin` is column-locked.
- Provisioned staging `kpah-dev` (production-faithful `users`/`invoices`/`medical_records`/`deletion_audit`)
  and proved the policies with `tests/sql/step32_free_auth_rls.test.sql`:
  anon denied; unlinked-authenticated sees 0 rows and cannot write; linked manager can operate and
  manage staff; linked cashier can operate but cannot manage staff; no role can DELETE; pin column locked.
- Synthetic staging data only (marker `KPAH_TEST_20260808`), cleaned up — **zero residue** verified.
- Production was **not** modified — it stays fully locked until a real staff Auth account is linked.

## Step 32 — Supabase Auth login (branch `step32-supabase-auth-login`, not merged/deployed)

- `src/App.tsx`: replaced the staff-name/PIN login (and all local/provider fallbacks) with
  **Supabase Auth email/password only** — session restore on startup, `fetchStaffForAuthUser`
  mapping, and an explicit **"Staff account is not linked"** sign-out when an authenticated
  identity has no staff row. Login form now shows email + password (no staff names).
- The PIN survives only as a second-confirmation gate (`requireAuth`), not as a DB login.
- Playwright: a **DEV-only** test-auth stub (`window.__KP_TEST_AUTH__`, guarded by
  `import.meta.env.DEV`, verified **stripped from the production bundle**) lets the suite sign in
  without a live Auth session; the shared `login()` helpers were updated. A separate
  `tests/staging-auth-login.spec.ts` requires a REAL account via env and **SKIPS/BLOCKED** otherwise.
- `src/components/POSRegister.tsx`: queued patients now stay checkout-able even when their
  appointment row is outside the loaded window (synthesized from the queue entry).
- Corruption screen reworded to a **safe local-cache-reset** message (never implies cloud deletion).
- **BLOCKED / not proven:** real end-to-end login needs an owner-created, linked staff Auth account
  (none exists). Reported BLOCKED, not PASS.
- **Known test gap (pre-existing, not auth):** the app loads operational data from Supabase, but the
  Playwright fixture stubs Supabase empty while seeding IndexedDB — so data-dependent specs (e.g.
  cv1 Test A) stay red until the fixture bridges IndexedDB→REST responses. Test B passes (stub works).

## Free-tier boundary

- Supabase free tier supports a safe Auth/RLS demo + staging environment.
- It does **not** provide certified scheduled backups / PITR. No certified restore path exists.
- Therefore real clinic data is not permitted yet.

## Current Decision

`NOT READY FOR REAL CLINIC DATA`

Security containment holds and the free Auth/RLS design is proven on staging. Two owner actions
remain before any staging login is fully usable and before real clinic data can be considered.

## Owner Actions Required

1. Create the first staff Supabase Auth account (email/password) and link it by setting
   `public.users.auth_user_id` for that staff row (e.g. Keerthi). Do not reuse the owner email as a
   staff identity unless that is the intended owner login. No password may be invented or reset by the agent.
2. Provide a real recovery path (Pro PITR or a verified external backup) before real clinic data.

## One Next Action

Owner creates and links the first staff Auth account so the end-to-end Supabase Auth login and
second-device reads can be verified on staging; then continue the App.tsx login wiring slice.
