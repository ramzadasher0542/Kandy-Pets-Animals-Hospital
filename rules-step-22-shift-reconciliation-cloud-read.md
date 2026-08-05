Step 22 Rules: Shift Reconciliation Cloud Read

Mission

Migrate only ReportsManager's shift\_reconciliations read from IndexedDB to the existing Supabase table. This is a bounded read-only change that does not depend on the deferred staff authentication decision.



Required Access

Supabase MCP is required to inspect the live table, columns, RLS and grants.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Do not mutate live data.

Scope

Add one focused read helper in src/lib/db.ts for shift\_reconciliations.

Update src/components/ReportsManager.tsx to use that helper instead of db.shiftReconciliations.iterate.

Preserve the existing ShiftReconciliation shape, report calculations, filters, sorting and UI.

Exclude soft-deleted rows if the live table has is\_deleted.

Do not migrate deletion\_audit or payslips.

Do not touch StaffManager, payroll writers, authentication, RLS policies, localDb removal or deletion-audit behavior.

Data And Error Rules

Inspect the live column names and types before writing the query. The repository uses quoted camelCase fields such as userId, userName, openingFloat and cashSales.

Confirm the current live RLS permits the intended read; do not add or broaden a policy.

Do not fall back to IndexedDB if the cloud read fails.

Do not silently convert a cloud read failure into an empty successful report. Preserve or add a clear report error state/warning while keeping unrelated report sections usable.

The live table currently has no known rows. Do not claim historical report data was migrated.

Verification

Inspect the live table metadata, policies and grants through Supabase MCP.

Do not insert test rows.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the known F2/F3 IndexedDB-fixture baseline without repairing it.

Review the diff, commit only intended files and push to main.

Confirm Vercel remains the deployment target. Do not investigate Cloudflare.

Stop Conditions

Stop before editing if the live table is absent, its columns do not match the application type, or its RLS prevents the current app read. Report the mismatch instead of adding a policy or local fallback.





