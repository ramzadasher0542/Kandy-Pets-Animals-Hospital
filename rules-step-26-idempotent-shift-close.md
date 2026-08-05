Step 26 Rules: Idempotent Shift Close

Mission

Make the atomic shift-close RPC safe to retry. If the first request commits but the response is lost, a second click must not insert a duplicate reconciliation or rewrite the already-closed shift as a new close.



Required Access

Supabase MCP is required.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Do not close a real shift or insert live test rows.

Required Behavior

Update public.close\_shift\_and\_reconcile to be idempotent by p\_shift\_id.

A first call for an open shift must update the shift and insert exactly one reconciliation in the same transaction.

A concurrent or retried call after the shift is already closed must not insert another reconciliation and must return an explicit already\_closed: true result.

A call for a missing shift must still raise SHIFT\_NOT\_FOUND.

Use row locking/conditional update so two concurrent calls cannot both insert a reconciliation.

Preserve all current close values, cash conversions, timestamps, notes and RLS/grants.

Do not add a broad policy or a fake service account.

Application Changes

Update the RPC client result type to include already\_closed.

On a normal successful close, preserve the current success/discrepancy UI.

On already\_closed, clear stale active-shift UI state without claiming the newly constructed reconciliation was saved. Show a clear informational/warning message that no duplicate was created and the original close should be checked in the report.

Do not retry automatically with a new reconciliation ID.

Do not add IndexedDB fallback or create a reconciliation-to-shift schema column in this step unless the existing schema makes idempotency impossible. Prefer conditional update by shift ID.

Leave the existing atomic boundary intact; this is an idempotency correction, not a redesign.

Verification

Inspect the live function and shifts/shift\_reconciliations schemas through Supabase MCP.

Print and apply the migration only to cjpmsjjluqlfcyzuspni.

Do not perform a real close or insert a test row.

Verify by SQL review that the conditional update/row lock prevents duplicate inserts and that the already-closed path performs no insert.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the known F2/F3 baseline without repairing it.

Review the diff, commit only intended files and push to main.

State clearly that runtime retry behavior was inferred, not executed, if no safe test database exists.

Stop Conditions

Stop before applying SQL if an already-closed shift cannot be distinguished safely, if old close semantics would be changed unexpectedly, or if the live RLS/grants block the function. Report the exact mismatch instead of adding a new trust boundary.





