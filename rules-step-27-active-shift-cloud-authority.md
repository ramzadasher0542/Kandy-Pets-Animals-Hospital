Step 27 Rules: Active Shift Cloud Authority

Mission

Stop App boot from trusting a stale local active\_shift mirror when Supabase is configured. The cloud shifts table must be authoritative for whether a register is open, especially after another device closes the shift.



Access

Code-only change using existing helpers.

Supabase MCP is not required; do not alter live schema or policies.

Vercel remains the deployment target. Ignore Cloudflare.

Required Behavior

Inspect all active\_shift, ceylon\_active\_shift\_id, db.system active-shift and fetchActiveShiftDetails call sites before editing.

When Supabase is configured, App boot must obtain active-shift state from the existing cloud helper and must not let a local mirror override it.

When Supabase is not configured, preserve the existing offline/test behavior only if it is necessary for the repository's established offline mode.

Remove the App-level db.system.setItem/removeItem('active\_shift') mirror if it is no longer needed after the source-of-truth change.

Preserve the existing cloud writes for opening and closing shifts, active-shift UI behavior, invoice shiftId assignment and cash-adjustment lookups.

Do not redesign the atomic close RPC or idempotency behavior.

Do not remove unrelated system configuration storage or other localDb stores.

Do not touch deletion auditing, payslips, staff/payroll, authentication, RLS or Cloudflare.

Cache Rules

Do not treat localStorage or IndexedDB as authoritative when a configured Supabase client is available.

Remove redundant active-shift cache writes only after proving repo-wide that no code reads them.

Do not delete existing browser data.

Verification

Search the whole repository for every active-shift key and confirm no stale local value can override cloud state online.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the known F2/F3 baseline without repairing unrelated failures.

Review the diff, commit only intended files and push to main.

Confirm Vercel remains the deployment target. Do not investigate Cloudflare.

Stop Conditions

Stop if the existing helper cannot distinguish cloud-unavailable from no-open-shift, or if removing the local mirror breaks the established offline/test mode. Report the exact ambiguity instead of silently changing fallback behavior.





