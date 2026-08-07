Step 30 Rules: Go-Live Data-Safety Gate
Mission
Make the current build safe enough for Keerthi to begin real clinic use. Do not attempt to finish the entire product. Fix only the remaining data-loss, money, permission, recovery, and acceptance blockers.

Required Work
Make duplicate checkout retries skip all later client effects when the atomic checkout RPC returns already_committed.
Make shift reconciliation fail closed: if paid invoices or cash adjustments cannot be loaded, block close instead of saving incomplete totals.
Verify Keerthi's actual login role, RLS permissions, and void/close permissions in the live deployment.
Verify a usable backup and recovery path before real data entry. Do not destroy live data during the test.
Confirm production does not silently seed fake demo records.
Run one disposable-data pilot covering client, pet, appointment, invoice, stock, void, shift close, reload, and a second-device read.
Do Not Do
Do not redesign the UI.
Do not start offline-sync migration.
Do not refactor the monolith.
Do not repair every report, notification, payroll, or schema issue in this task.
Do not use real clinic data for a test fixture.
Required Model And Tool Gate
Model: Claude Opus 4.8 for any code or SQL changes.
Supabase MCP: ON for live inspection and migration work.
If MCP is unavailable, stop at read-only review.
Acceptance
Keerthi may begin real use only if all six required work items pass and the disposable pilot leaves no unexpected rows or balance changes.

