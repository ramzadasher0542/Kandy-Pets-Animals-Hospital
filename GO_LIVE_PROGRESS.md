# Go-Live Progress

Last verified: 2026-08-13 UTC

Enterprise cleanup merged through PR #10.
Live deployment: https://kpah-aps.vercel.app/

## Completed

- Fixed the false CRITICAL DATABASE CORRUPTION DETECTED screen. Unauthenticated RLS failures no longer masquerade as local IndexedDB corruption.
- Supabase Auth email/password login is live and protected cloud reads wait for an authenticated session.
- Production cjpmsjjluqlfcyzuspni has RLS enabled across the application tables, anonymous reads denied, and destructive RPC execution denied.
- The current administrator Auth identity is linked to an active `public.users` row with role `admin`. No clinical rows were changed.
- Auth accounts are linked to owner, cashier, veterinarian, and administrator app roles for beta testing.
- Fresh live administrator login verified: all clinic panels and all six Settings tabs are visible.
- Independent production administrator session verified with the approved owner credential: cloud sync was active, inventory loaded, and the linked admin identity was visible.
- Fresh live cashier login verified: only POS and Shift & Drawer are visible; Settings and all other panels are hidden.
- Vercel production serves the merged build. Lint and production build passed previously; the Vercel preview for PR #4 passed.
- Browser-initiated cloud erase remains disabled. Full JSON export and protected beta merge restore are available in the release; provider-managed recovery remains required for catastrophic loss.
- The application is visibly labelled **Beta / under development**. Payroll is deferred.
- Staff Management and payroll are intentionally deferred from the active beta UI. Existing staff identity rows and dormant payroll tables are retained and untouched.
- Protected non-empty restore verified with the production export: 27 tables and 39 rows merged, followed by a clean reload with inventory and Reports intact. Staff tables were left untouched. This verifies the beta merge path, not catastrophic recovery or provider-managed backups.
- The retired deployment integration was revoked and verified absent from the installed-apps list.
- Production bundle scan found no browser write-authorizing secret or shared header.
- Read-only Step 31 security-boundary check re-run against production passed after correcting a stale test expectation. The live grants are consistent with the Free Auth/RLS design: anon has no table grants, authenticated has only explicit SELECT/INSERT/UPDATE grants, and destructive DELETE/TRUNCATE privileges remain closed.
- Supabase log review found one historical PostgREST error at 2026-08-13 04:38:06 UTC requesting the nonexistent `staff_profiles.email` column. The current source and production bundle use `staff_profiles.*`; the stale request was not reproduced, and no schema column was added to mask it.
- The same log window contains five historical permission-denied reads for pets, lab results, vaccinations, grooming, and boarding. The current grant summary and corrected security check pass; a fresh authenticated smoke test subsequently loaded every live panel without reproducing those errors.
- Authenticated production smoke test covered every live navigation panel without a load error. Staff & Security remained visible, while Staff Management remained absent from the primary navigation.
- Found and fixed a real production defect in invoice reversal: the deployed browser called missing `void_invoice_and_reverse_revenue_auth(uuid)`. Step 35 added the Auth-guarded wrapper and was applied to production. Controlled checkout created invoice `88a9a88c` for Rs. 1,000 and reduced `test 1` stock from 100 to 99; the retry then voided it, restored stock to 100, and restored the active shift cash total to zero.
- Step 31 security regression was re-run after Step 35 and passed with no rows returned.
- Daily backup policy is implemented in the shift-close flow: administrator/provider authorization is required, the final reconciliation is committed first, and a full JSON snapshot is prepared in the Z-report. The operator must explicitly click **Download Daily Backup** before dismissing the report, preserving a real browser user gesture for the portable file. This is not provider-managed storage; a failed export leaves the shift closed but explicitly reports that the day is not backed up.
- Step 36 added the Auth-guarded `close_shift_and_reconcile_auth(uuid,numeric,numeric,numeric,text,jsonb)` wrapper, applied it to production, and published `supabase/migrations/20260813_auth_shift_close_rpc_guard.sql`.
- Production shift-close verification passed with a synthetic Rs. 5,000 drawer: the Z-report showed the correct shift ID, valid open/close timestamps, Rs. 5,000 starting float, Rs. 5,000 actual cash, and a balanced result. The cloud runner's download bridge did not expose the browser-created file, so external retention must still be confirmed on the operator's browser.
- A fresh authenticated full export is retained at `outputs/ceylonpets_backup_FULL_2026-08-13_05-25.json` with 27 tables and 43 rows.
- Before manual clinical sign-off, fixed five source-level blockers found by review: Patient Portal now displays sex correctly, lab history uses `requestDate`, treatment notes persist from the editor state, and vaccination/grooming success is shown only after the cloud write succeeds. Type-check, build, and audit pass after these changes.
- The retained backup is valid but stale for replay: it contains an old open synthetic shift and pre-test operational state. It was not restored into production because doing so could reopen or overwrite current operational records. A fresh post-test export and a restore rehearsal against a safe target are still required.
- Removed unused `jspdf` and `jspdf-autotable` dependencies, regenerated the lockfile, and confirmed `npm audit` reports 0 vulnerabilities; type-check and production build pass.
- Controlled checkout test passed with a Rs. 1,000 test item; the invoice was voided atomically, restoring stock and shift totals to baseline.
- Checkout RPC privilege hardening is recorded in PR #10 with an Auth-guarded browser wrapper and no direct browser access to mutation helpers.

## Remaining Work: 3 Items

1. Operate the daily backup policy with external retention and rehearse a restore against a safe target; do not replay the stale retained file into production.
2. Complete manual clinical workflow sign-off after an authenticated browser session is available; this has not been completed in this run.
3. Rotate the temporary beta-test password before entering any real clinic data.

## Current Decision

BETA / UNDER DEVELOPMENT. NOT READY FOR REAL CLINIC DATA until daily backup retention/recovery and manual clinical workflow sign-off are complete. Staff Management remains explicitly deferred.

## Deployability Assessment

**65% controlled-beta deployable.** This is a weighted engineering readiness score,
not a safety certification: hosting/release 18/20, authentication and authorization
15/20, core clinical/financial workflow coverage 12/25, recovery 12/20, and QA/
operations 8/15.

The system remains **NO-GO as an unrestricted clinical system of record**. The
controlled export and merge restore works, but Supabase Free has no certified
provider-managed backups or PITR, and manual workflow sign-off remains incomplete.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
