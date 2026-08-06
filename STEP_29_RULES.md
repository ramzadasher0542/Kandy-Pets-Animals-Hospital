Step 29 Rules: Atomic Invoice Voiding

Mission

Make paid-invoice voiding atomic across inventory, invoice status, appointment state, and shift revenue. A retry or concurrent void must never restore stock twice, reverse revenue twice, or leave a voided invoice with only half of its effects applied.



Confirmed State

Step 28 code is pushed as bb29733.

README URL correction is pushed as bae08cf.

Current deployment: https://kpah-aps.vercel.app/ reaches the Ceylon Pets sign-in screen after reload.

Checkout revenue is now applied inside commit\_checkout\_invoice\_and\_stock using the invoice's shiftId.

apply\_shift\_revenue locks the shift row and the invoice/revenue void RPC locks the invoice row.

handleVoidInvoice still restores stock item-by-item in the browser before calling void\_invoice\_and\_reverse\_revenue.

The server void RPC reverses revenue and changes invoice/appointment state, but does not restore stock.

A second concurrent void can therefore double-restock even when revenue reversal is idempotent.

A restock failure or RPC failure can leave partial inventory changes.

Paid invoices with an empty shiftId silently skip revenue application or reversal.

commit\_checkout returns already\_committed, but the App still runs post-commit client effects without using that flag.

Reconciliation can still close after cloud invoice or adjustment loading fails.

The checked-in SQL schema shows anon-only policies while the new functions are invoker-security; live authenticated-policy compatibility must be verified, not assumed.

Progress, Model, And MCP Gate

Effective progress: through Step 27 accepted; Step 28 pushed but not accepted after audit; Step 29 not started.

Step 27 cloud active-shift authority: accepted, commit fd1b825.

README deployment correction: accepted, commit bae08cf.

Step 28 atomic checkout/shift work: pushed as bb29733, acceptance blocked by the void race, missing-shift behavior, RLS proof, and test gaps listed above.

Required implementation model: Claude Opus 4.8. Do not use a lightweight model for this database transaction/RLS task.

Required MCP status: Supabase MCP ON with live SQL inspection and migration tools available.

Hard gate: if Supabase MCP is disconnected or execute\_sql / migration tools are unavailable, do not write or apply SQL and do not commit Step 29 as complete.

Browser verification is useful for the Vercel smoke check, but it is not a substitute for Supabase MCP.

Required Work

Inspect the live invoice, inventory, shifts, appointments, RLS, and existing RPC definitions before editing or running SQL.

Move stock restoration into the same server transaction as the invoice status transition and shift-revenue reversal, using the existing stock primitive where compatible.

Lock the invoice first. If it is already void, return an idempotent result without touching stock, revenue, appointment state, or client state.

For a newly voided paid invoice, require a valid shiftId; fail the transaction rather than silently losing the reversal.

Keep the client from restoring stock before the RPC. It may update local UI only after the RPC succeeds.

Preserve the appointment-to-booked behavior and exact split-payment reversal.

Prevent duplicate client lifetime-value changes by using the RPC result, not a stale pre-read.

Verify the RPC works for both anon and the authenticated role actually used by the app, under the live RLS policies.

Constraints

One task only: invoice void atomicity.

Do not redesign checkout, shift opening, reports, auth, staff/payroll, deletion auditing, backup/restore, or offline sync.

Do not delete, truncate, merge, or rewrite existing business data.

Print proposed SQL before applying it.

Do not claim atomicity if client-side stock writes remain before the transaction.

Verification

Run npx tsc --noEmit.

Run npm run build.

Run focused SQL rollback tests for: normal paid void, second retry, concurrent void, stock failure rollback, missing shiftId, unpaid void, split-payment reversal, and authenticated RLS.

Run focused Playwright tests for the UI retry/error behavior.

Report exact test commands and results. Do not use deliberate RAISE EXCEPTION as a substitute for a passing test runner.

Review the diff and push only intended files after verification.

Progress Updates

Report these checkpoints in order: preflight, live schema/RLS audit, SQL printed, migration applied, client changes, tests, push, acceptance decision.



Stop Conditions

Stop if the live schema or RLS differs from the checked-in assumptions.

Stop if existing stock semantics cannot safely restore the invoice items inside the transaction.

Stop if authenticated RPC execution is not permitted by live policies.

Noticed, Not Fixed Here

Cloud lookup ambiguity in fetchActiveShiftId used by metrics.

Split-payment omission in the report payment breakdown.

Remaining users versus staff\_users mismatch.

Offline-first sync and local-only payroll/deletion records.



