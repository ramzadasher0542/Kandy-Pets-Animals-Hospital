Step 23 Rules: Shift Reconciliation Cloud Write

Mission

Complete the shift-reconciliation migration started in Step 22. ReportsManager reads shift\_reconciliations from Supabase, so ShiftManager must write new reconciliation rows to the same table. Do not leave the application with split read/write storage.



Required Access

Use Supabase MCP to inspect the live table, columns, RLS and grants.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Do not create test rows or perform a real shift close.

Required Changes

Add a focused upsertShiftReconciliation helper in src/lib/db.ts.

Preserve the existing ShiftReconciliation payload and quoted camelCase column names.

Fail closed when Supabase is unavailable or the write fails. Do not write the reconciliation to IndexedDB as a fallback.

Change the App-level onSaveShift handler to call the cloud helper and update React state only after success.

Change the ShiftManager callback type to return Promise<void> and await it.

If the reconciliation write fails after the existing shift-close write succeeds, show a clear error and do not show reconciliation success. Do not claim the close-and-reconciliation pair is one database transaction; it is not in this step.

Preserve the current shift-close calculations, drawer discrepancy warnings and active-shift behavior.

Remove the shift-reconciliation writer's use of db.shiftReconciliations. Do not remove other localDb usage.

Do not migrate deletion audits, payslips, staff/payroll, authentication, RLS policies or App boot state.

Data Rules

Inspect live nullability, defaults and RLS before writing the helper.

The live table currently has zero rows. No historical local rows are being migrated.

Do not silently merge local and cloud rows.

Do not add a new RLS policy if existing INSERT/UPDATE access already permits the intended app role.

Verification

Verify live table metadata and grants through Supabase MCP.

Do not insert test rows or close a real shift.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the known F2/F3 IndexedDB-fixture baseline without repairing it.

Review the diff, commit only intended files and push to main.

Confirm the Vercel target remains unchanged. Do not investigate Cloudflare.

Explicitly report that runtime cloud-write success and close/write atomicity were not tested if no safe test environment exists.

Stop Conditions

Stop before editing if the live table's INSERT/UPDATE policy does not permit the current app role, the payload shape differs, or making the callback awaitable requires unrelated ShiftManager behavior changes. Report the exact mismatch instead of adding a local fallback or broad policy.





