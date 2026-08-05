Step 25 Rules: Atomic Shift Close + Reconciliation

Mission

Make closing a shift and recording its reconciliation one database-atomic operation. The current code updates shifts first and then inserts shift\_reconciliations; a failure between those calls loses the reconciliation. Replace that pair with one focused Supabase RPC.



Required Access

Supabase MCP is required.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Do not close a real shift or insert live test rows.

Required Database Behavior

Add a focused public.close\_shift\_and\_reconcile RPC, or an equally narrow name justified by the live schema.

The RPC must update the target shifts row with the existing close values and insert the matching shift\_reconciliations row in one statement-level transaction.

If either operation fails, neither change may persist.

Preserve the existing cash-unit conversions, notes, timestamps, isOpen behavior and reconciliation payload.

Validate the shift ID and reconciliation ID/payload before mutation.

Fail if the target shift does not exist. Avoid silently reporting success for zero updated rows.

Keep SECURITY INVOKER and existing least-privilege grants. Do not add broad RLS policies or grant PUBLIC.

Preserve the existing quoted camelCase column names and defaults.

Do not change unrelated shift revenue, active-shift, reports, deletion-audit, payslip, auth or staff/payroll behavior.

Application Changes

Inspect all closeShift call sites before changing its signature. There is currently one known caller in ShiftManager.tsx.

Add one focused client helper in src/lib/db.ts for the RPC.

Update ShiftManager.tsx to call the single helper instead of calling closeShift and onSaveShift separately.

Preserve the current success/error UI and active-shift cleanup, but only clear the active shift after the atomic RPC succeeds.

Do not keep a second reconciliation write after the RPC.

Do not add an IndexedDB fallback.

Leave upsertShiftReconciliation only if another caller actually needs it; otherwise remove dead code after a repo-wide call-site check.

Verification

Inspect live shifts and shift\_reconciliations schemas, RLS policies, grants and current function state through Supabase MCP.

Print SQL before applying it.

Do not execute a real close or insert a test row.

Verify by SQL review that both table operations are inside the same function and that errors propagate.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the known F2/F3 baseline without repairing it.

Review the diff, commit only intended files and push to main.

Explicitly state that runtime rollback was inferred from SQL, not executed, if no safe test database exists.

Stop Conditions

Stop before applying SQL if the live columns differ, current RLS blocks one of the two writes, or the existing close semantics cannot be preserved without changing unrelated behavior. Report the mismatch instead of adding a policy workaround.





