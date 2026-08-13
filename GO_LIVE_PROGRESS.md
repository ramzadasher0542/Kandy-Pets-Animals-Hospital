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
- The retired deployment integration was revoked and verified absent from the installed-apps list.
- Production bundle scan found no browser write-authorizing secret or shared header.
- Controlled checkout test passed with a Rs. 1,000 test item; the invoice was voided atomically, restoring stock and shift totals to baseline.
- Checkout RPC privilege hardening is recorded in PR #10 with an Auth-guarded browser wrapper and no direct browser access to mutation helpers.

## Remaining Work: 4 Items

1. Run the CV-1 Playwright tests against real Supabase-backed data. The current fixture still stubs Supabase empty for data-dependent cases.
2. Verify second-device reads using an approved device/session.
3. Verify the beta export/merge-restore workflow with a controlled recovery test. Supabase free tier does not provide certified scheduled backups or PITR.
4. Review the 6 npm audit vulnerabilities: 1 low and 5 high.

## Current Decision

BETA / UNDER DEVELOPMENT. NOT READY FOR REAL CLINIC DATA until backup/recovery, second-device verification, and real CV-1 coverage are complete.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
