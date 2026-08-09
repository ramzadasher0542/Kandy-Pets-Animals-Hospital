# Go-Live Progress

Last verified: 2026-08-09 UTC

Latest production code: 8b2c59f (PR #4 merged)
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

## Remaining Work: 6 Items

1. Merge and deploy the browser sync-secret removal, then confirm the production bundle contains no write-authorizing browser secret. The Vercel `VITE_SUPABASE_SYNC_SECRET` variable has been deleted.
2. Run one controlled appointment and checkout smoke test without altering real clinic data unexpectedly.
3. Run the CV-1 Playwright tests against real Supabase-backed data. The current fixture still stubs Supabase empty for data-dependent cases.
4. Verify second-device reads using an approved device/session.
5. Establish and verify a real backup/export recovery procedure. Supabase free tier does not provide certified scheduled backups or PITR.
6. Review the 7 npm audit vulnerabilities: 1 low, 1 moderate, 5 high.

## Minor Owner Decision

The administrator session currently displays the existing staff name Keerthi because that was the only original staff row. Rename it only after the owner confirms the preferred display name.

## Current Decision

NOT READY FOR REAL CLINIC DATA until backup/recovery and controlled checkout verification are complete.

## Vercel-Only Deployment

Vercel is the only production target. The retired deployment integration has been removed from the repository and GitHub account.
