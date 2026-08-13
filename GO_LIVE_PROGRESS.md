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
- Fresh live cashier login verified: only POS and Shift & Drawer are visible; Settings and all other panels are hidden.
- Vercel production serves the merged build. Lint and production build passed previously; the Vercel preview for PR #4 passed.
- Browser-initiated cloud erase remains disabled. Full JSON export and protected beta merge restore are available in the release; provider-managed recovery remains required for catastrophic loss.
- The application is visibly labelled **Beta / under development**. Payroll is deferred.
- Staff Management currently covers roster, login links, scheduling, and time clock only. Payroll UI and runtime payslip reads are disabled; the existing dormant payslips table is retained and untouched.
- Protected non-empty restore verified with the production export: 27 tables and 39 rows merged, followed by a clean reload with inventory, Staff Management, and Reports intact. This verifies the beta merge path, not catastrophic recovery or provider-managed backups.
- The retired deployment integration was revoked and verified absent from the installed-apps list.
- Production bundle scan found no browser write-authorizing secret or shared header.
- Removed unused `jspdf` and `jspdf-autotable` dependencies, regenerated the lockfile, and confirmed `npm audit` reports 0 vulnerabilities; type-check and production build pass.
- Controlled checkout test passed with a Rs. 1,000 test item; the invoice was voided atomically, restoring stock and shift totals to baseline.
- Checkout RPC privilege hardening is recorded in PR #10 with an Auth-guarded browser wrapper and no direct browser access to mutation helpers.

## Remaining Work: 2 Items

1. Run the CV-1 Playwright tests against real Supabase-backed data. The existing fixture suite is now explicitly labelled `simulated-local`; the separate `real-supabase-auth` test requires owner-supplied credentials. The current runner also lacks its Chromium executable, so no test pass is claimed.
2. Verify authenticated second-device reads using an approved device/session. An independent browser reached the clean production sign-in screen, but no credential was available for the cloud-data check; no password was guessed, reset, or changed.

## Current Decision

BETA / UNDER DEVELOPMENT. NOT READY FOR REAL CLINIC DATA until backup/recovery, second-device verification, and real CV-1 coverage are complete.

## Deployability Assessment

**65% controlled-beta deployable.** This is a weighted engineering readiness score,
not a safety certification: hosting/release 18/20, authentication and authorization
15/20, core clinical/financial workflow coverage 12/25, recovery 12/20, and QA/
operations 8/15.

The system remains **NO-GO as an unrestricted clinical system of record**. The
controlled export and merge restore works, but Supabase Free has no certified
provider-managed backups or PITR, live second-device verification is incomplete,
and the current Playwright fixture does not exercise real Supabase Auth/RLS.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
