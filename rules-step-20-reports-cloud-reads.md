Step 20 Rules: Reports Cloud Reads

Mission

Remove ReportsManager's remaining IndexedDB reads for deletion audits, payslips and shift reconciliations. Read these existing Supabase tables directly so reports do not appear empty on a fresh cloud-only device. This is a read-only migration; staff/payroll writers remain frozen.



Required Access

Supabase MCP is required to inspect the live tables, columns, RLS and current grants.

Intended live project: cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare entirely.

Do not mutate live data.

Scope

Add focused read helpers in src/lib/db.ts for:

deletion\_audit

payslips

shift\_reconciliations

Update src/components/ReportsManager.tsx to use those helpers instead of db.deletionAudit, db.payslips and db.shiftReconciliations.

Preserve the existing report filters, sorting, calculations and UI.

Do not modify staff/payroll write paths or StaffManager.tsx.

Do not remove localDb.ts yet; other modules still depend on it.

Do not change authentication, boot persistence, RLS policies, schema or deployment settings in this step.

Data Rules

Inspect the live column names and types before writing queries.

Exclude soft-deleted rows using the live is\_deleted column where applicable.

Preserve the existing TypeScript shapes; map fields only if the live names require it.

Cloud read errors must not silently become an empty successful report. Preserve or add a clear error state/warning while keeping the rest of the ReportsManager usable.

Do not fall back to IndexedDB for these three report collections.

Keep the helpers fail-closed and consistent with the existing cloud fetch conventions.

Verification

Inspect the live table definitions and policies through Supabase MCP.

Do not run mutating SQL or write test rows.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the existing F2/F3 IndexedDB-fixture baseline without repairing it here.

Review git diff, git status, commit only intended files and push to main.

Confirm the Vercel target remains unchanged. Do not investigate Cloudflare.

Stop Conditions

Stop before editing if any table is absent, the live columns differ materially from the repository types, or RLS prevents the intended authenticated/anon read. Report the exact mismatch instead of adding a broad policy or local fallback.





