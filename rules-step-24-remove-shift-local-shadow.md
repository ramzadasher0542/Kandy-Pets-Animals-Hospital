Step 24 Rules: Remove Shift Reconciliation Local Shadow
Mission
Finish the shift-reconciliation storage cleanup. The report and writer now use Supabase, but App boot still reads an unused shiftReconciliations IndexedDB store and shiftLogs state is never consumed. Remove only this obsolete local shadow.

Access
This is a code-only cleanup.
Supabase MCP is not required.
Vercel remains the deployment target. Ignore Cloudflare.
Required Changes
Confirm every repository reference to shiftReconciliations and shiftLogs before editing.
Remove the unused App boot iteration over db.shiftReconciliations.
Remove the unused shiftLogs state and its setter updates if no consumer exists.
Remove the shiftReconciliations localForage instance from src/lib/localDb.ts only after confirming there are no remaining call sites.
Do not change the Supabase read helper, writer helper, ShiftManager close flow or live schema.
Do not remove the separate active_shift local operational state; it is a different concern.
Do not migrate or delete existing browser data. Removing the code reference is sufficient.
Do not touch deletion auditing, payslips, authentication, staff/payroll or unrelated localDb stores.
Verification
Search the whole repository for shiftReconciliations and shiftLogs after editing; only intentional historical comments, if any, may remain.
Run npx tsc --noEmit.
Run npm run build.
Run npx playwright test tests/example.spec.ts.
Report the known F2/F3 baseline without repairing it.
Review the diff, commit only intended files and push to main.
Confirm Vercel remains the deployment target. Do not investigate Cloudflare.
Residual Risk To Report
Closing a shift and writing its reconciliation remain two separate Supabase operations. Do not claim they are transactional in this step.

