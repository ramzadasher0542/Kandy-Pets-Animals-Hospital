# Go-Live Progress

Last verified: 2026-08-09 UTC

Enterprise cleanup merged through PR #8.
Live deployment: https://kpah-aps.vercel.app/

## Completed

- Fixed the false CRITICAL DATABASE CORRUPTION DETECTED screen. Unauthenticated RLS failures no longer masquerade as local IndexedDB corruption.
- Supabase Auth email/password login is live and protected cloud reads wait for an authenticated session.
- Production cjpmsjjluqlfcyzuspni has 22/22 tables under RLS, 63 policies, anonymous reads denied, and destructive RPC execution denied.
- The administrator account is linked to the existing active staff row with role admin. No clinical rows were changed.
- A second Auth account is linked to a new cashier staff row for role testing.
- Fresh live administrator login verified: all clinic panels, all six Settings tabs, action matrix, and panel access matrix are visible.
- Fresh live cashier login verified: only POS and Shift & Drawer are visible; Settings and all other panels are hidden.
- Vercel production serves the merged build. Lint and production build passed previously; the Vercel preview for PR #4 passed.
- Browser-initiated cloud erase remains disabled. Data export is available; Supabase restore remains provider-managed.
- The retired deployment integration was revoked and verified absent from the installed-apps list.
- Production bundle scan found no browser write-authorizing secret or shared header.
- Controlled checkout test passed with a Rs. 1,000 test item; the invoice was voided atomically, restoring stock and shift totals to baseline.
- Checkout RPC privilege hardening is recorded in PR #10 with an Auth-guarded browser wrapper and no direct browser access to mutation helpers.

## Remaining Work: 4 Items

1. Run the CV-1 Playwright tests against real Supabase-backed data. The current fixture still stubs Supabase empty for data-dependent cases.
2. Verify second-device reads using an approved device/session.
3. Establish and verify a real backup/export recovery procedure. Supabase free tier does not provide certified scheduled backups or PITR.
4. Review the 7 npm audit vulnerabilities: 1 low, 1 moderate, 5 high.

## Minor Owner Decision

The administrator session currently displays the existing staff name Keerthi because that was the only original staff row. Rename it only after the owner confirms the preferred display name.

## Current Decision

NOT READY FOR REAL CLINIC DATA until backup/recovery and controlled checkout verification are complete.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
