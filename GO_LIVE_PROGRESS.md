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
- The same log window contains five historical permission-denied reads for pets, lab results, vaccinations, grooming, and boarding. The current grant summary and corrected security check pass; authenticated UI reads were not re-run because no clinic session is currently signed in.
- Removed unused `jspdf` and `jspdf-autotable` dependencies, regenerated the lockfile, and confirmed `npm audit` reports 0 vulnerabilities; type-check and production build pass.
- Controlled checkout test passed with a Rs. 1,000 test item; the invoice was voided atomically, restoring stock and shift totals to baseline.
- Checkout RPC privilege hardening is recorded in PR #10 with an Auth-guarded browser wrapper and no direct browser access to mutation helpers.

## Remaining Work: 2 Items

1. Establish provider-managed backup/recovery or an approved operational recovery policy.
2. Complete manual clinical workflow sign-off.

## Current Decision

BETA / UNDER DEVELOPMENT. NOT READY FOR REAL CLINIC DATA until backup/recovery and manual clinical workflow sign-off are complete. Staff Management remains explicitly deferred.

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
