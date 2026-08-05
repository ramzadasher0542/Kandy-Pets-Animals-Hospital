Step 18 Rules: Atomic Checkout Invoice + Inventory
Mission
Make the checkout invoice write and its inventory decrements one database-atomic operation. Keep the scope narrow. Shift revenue, client lifetime totals, visit closing, source billing and other post-checkout effects remain separate and must not be described as part of this transaction.

Required Access
Supabase MCP is required.
Inspect the intended live project before editing SQL or code.
Apply the migration to the intended live project only: cjpmsjjluqlfcyzuspni.
Do not touch kpah-dev.
Do not perform a live mutating checkout with real or existing business data.
Required Behavior
Add a PostgreSQL RPC named commit_checkout_invoice_and_stock.
The RPC must accept the invoice payload and the inventory items/quantities needed by checkout.
It must persist the invoice and decrement every requested stock item in one statement-level transaction.
Any invoice or stock failure must roll back the complete invoice-plus-stock operation.
Use the existing atomic_stock_decrement semantics or a reviewed equivalent; preserve FEFO/batch behavior, insufficient-stock errors and updated_at handling.
Make retries idempotent using the checkout invoice ID. A retry after a committed response loss must not decrement inventory a second time. Return the existing invoice ID and current relevant stock values for an already-committed invoice.
Reject malformed payloads, missing IDs and non-positive quantities before changing data.
Preserve the current invoice column mapping, date representation, appointment status behavior and existing checkout semantics. Do not silently rename fields or change money calculations.
Return a small, typed JSON result containing the invoice ID, whether it was already committed, and remaining stock keyed by inventory item ID.
Use least-privilege function grants consistent with the existing application role. Do not grant execution to PUBLIC.
Do not weaken or broaden RLS as a workaround. If the live policies prevent the intended app call, report the exact conflict instead of adding a broad policy.
Application Changes
Add one focused Supabase client helper in src/lib/db.ts for the new RPC.
Update handleAtomicCheckout in src/App.tsx to call the new helper instead of separately calling upsertInvoice and looping over atomicStockDecrement.
Update invoice and inventory React state only after the RPC succeeds.
Remove any checkout-local inventory fallback or local persistence path.
Keep the existing post-commit side effects explicit. If one fails after the RPC succeeds, surface a warning that does not claim invoice/stock rollback.
Keep the existing generic invoice and stock helpers if they are used elsewhere.
Do not refactor authentication, backup/restore, deletion, staff/payroll or unrelated RLS in this step.
Verification
Inspect the live function signature, definition, grants and relevant table policies through Supabase MCP.
Validate the migration SQL against the live schema before applying it.
Do not run a live mutating checkout test. Verify failure paths through SQL review and non-mutating checks where possible.
Run npx tsc --noEmit.
Run npm run build.
Run npx playwright test tests/example.spec.ts.
Report the known baseline status of tests/f2-emergency-intake.spec.ts and tests/f3-safe-deletion.spec.ts; do not expand this step to repair them.
Inspect git diff, git status and the final commit. Commit and push all intended changes.
Stop Conditions
Stop before applying SQL or changing checkout code if any of these are unclear:

The live invoice or inventory schema does not match the repository assumptions.
The current invoice ID is not stable across a retry.
The current cart-to-inventory ID mapping cannot be proven.
The existing RPC cannot preserve required FEFO or stock error behavior.
RLS requires a policy change outside this narrow step.
In a stop condition, report the finding and the smallest decision needed. Do not guess.

