# Go-Live Progress

## Current Handoff Context (2026-08-20 UTC)

- Project repository: `ramzadasher0542/Kandy-Pets-Animals-Hospital`
- Supabase project: `Kandy-Pets-Animals-Hospital` (`cjpmsjjluqlfcyzuspni`), Free plan
- Vercel project: `kpah-aps`, production URL `https://kpah-aps.vercel.app/`, Hobby plan
- Vercel production variables confirmed present: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Owner requirement: use Supabase and Vercel Free/Hobby tiers only
- Owner requirement: Staff Management and Payroll remain paused; dormant payroll tables are not part of the active release
- Administrator identity: `ramzadasher0542@gmail.com`, role `admin`
- Administrator password is intentionally not stored in this repository, progress file, or agent memory. Keep it in the owner's password manager and manage it through Supabase Auth.

### Latest Verification

- Supabase dashboard reports **Healthy**; Free-plan usage is within limits: 22 MB / 5 GB egress, 29 MB / 500 MB database, 10 / 50,000 MAU, and 0 / 1 GB storage.
- Vercel production deployment is **Ready**, sourced from `main`; commit `3208ff5` (`fix: restore boarding manager source`) is promoted to `https://kpah-aps.vercel.app/`.
- Live administrator sign-in succeeded; the app displayed **CLOUD SYNC ACTIVE**, all active clinic navigation, and Settings.
- Staff & Security remains available for Auth/access control, but live UI inspection found no Staff Management screen and no Payroll content.
- The live inventory still contains the synthetic `Synthetic Exam Service` test item. It was not removed because production-data deletion requires explicit approval.
- Step 38 is applied to production Supabase: boarding admission/settlement can atomically persist the boarding row, settlement invoice, and cash adjustment through `commit_boarding_cash_ledger_auth`.
- Step 38 was corrected to quote the case-sensitive `shifts."isOpen"` column and re-applied; production verification returned `has_quoted_is_open=true` and `has_unquoted_isopen=false`.
- Live boarding retest passed with synthetic `QA Luna`: Rs. 15,000 admission cash-in, discharged kennel, Rs. 15,000 refund cash-out, and database readback confirmed both movements in the same shift.
- `MANUAL_CHECKLIST.md` is now the owner-facing click-by-click verification guide. It contains no password.

### Next Handoff Actions

1. Run the repository lint and production build checks before any release change.
2. Keep external backups outside Supabase; the Free tier has no certified PITR/provider-managed recovery.
3. Obtain approval before removing or quarantining synthetic QA rows, and configure approved boarding rates before real clinic use.
4. Re-run administrator and restricted-role smoke tests after any new deployment.
5. Re-run grooming, role, payment, security, and recovery scenarios from `MANUAL_CHECKLIST.md`; the boarding deposit/refund scenario now passes in production.

Last verified: 2026-08-20 UTC

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
- Manual synthetic clinical sign-off covered appointment check-in, examination persistence, laboratory order/finalization, vaccination history, grooming consent/service mapping, boarding intake/discharge, Reports, and Settings/Data & Operations. No real patient data was used.
- Fixed and deployed the boarding empty-rate guard. A live synthetic boarding admission now displays `Rs. 0.00/day` instead of `NaN`; the underlying `boarding_rates` configuration remains empty and requires approved business rates.
- Published POS queue billing fixes `c97057d` and `c15785f`, then confirmed the final Vercel production asset. A clean authenticated discharge-queue checkout created invoice `c4c97ddb` for Rs. 5,000, and voiding it restored vaccine stock and the shift baseline.
- Synthetic QA appointments were cancelled after testing. A zero-float synthetic shift was opened, reconciled, and closed as balanced. The failed pre-fix clinical checkout created no invoice and changed no stock.
- Found and fixed a second financial-integrity defect: voiding a clinical invoice left linked vaccination/lab/grooming/boarding rows marked billed. Invoice items now retain source references, and a successful void releases those exact rows for rebilling. A fresh vaccination was checked out as invoice `88e0bd5e`, voided, and then reappeared in POS as a billable charge.
- A fresh post-test export is retained at `outputs/ceylonpets_backup_FULL_2026-08-14.json` with 27 tables and 88 rows. The browser download bridge still exposed no file, so the JSON was captured from the authenticated export and preserved directly as a workspace artifact.
- The fresh 88-row snapshot was merged back into the same synthetic beta production state, reporting `Backup merged: 88 rows across 20 tables`. This is a same-state rehearsal, not an independent safe-environment recovery test.
- Fixed the first Vercel build failure caused by a missing conditional branch, removed the duplicated editor copy of `BoardingManager.tsx`, and promoted the clean 1,031-line source in commit `3208ff5`.
- Corrected and published migration commit `4ad4de8`; the live boarding retest admitted and discharged `QA Luna`, and Supabase readback confirmed one `IN 15000` deposit plus one `OUT 15000` refund.

## Remaining Work: 4 Items

1. Keep the fresh JSON backup outside Supabase on the operator's own storage and rehearse restore against a separate safe target; the current same-state rehearsal is not independent disaster recovery.
2. Configure approved boarding rates; do not treat the zero-rate guard as a business configuration.
3. Keep the administrator credential in a password manager and rotate it if it is temporary, shared, or exposed before entering any real clinic data.
4. Remove or quarantine the remaining synthetic QA clinical rows before beta handoff; no automated clinical regression suite is claimed.

## Current Decision

BETA / UNDER DEVELOPMENT. NOT READY FOR REAL CLINIC DATA until independent backup recovery, approved boarding rates, and password rotation are complete. Staff Management remains explicitly deferred.

## Deployability Assessment

**82% controlled-beta deployable (provisional).** This is a weighted engineering
readiness score, not a safety certification: hosting/release 20/20, authentication
and authorization 16/20, core clinical/financial workflow coverage 22/25, recovery
14/20, and QA/operations 10/15.

The system remains **NO-GO as an unrestricted clinical system of record**. The
controlled export and same-state merge restore work, but Supabase Free has no
certified provider-managed backups or PITR, independent recovery is unproven,
boarding rates are not configured, and the temporary password must be rotated.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
