Step 19 Rules: Reject Insufficient Stock

Mission

Change inventory consumption from silent clamping to strict rejection. If a checkout requests more stock than is available, the database must raise an error before changing inventory. Because the checkout RPC already writes the invoice and calls the stock RPC in one transaction, that error must roll back the invoice too.



Required Access

Supabase MCP is required for live function inspection and migration.

The intended live project is cjpmsjjluqlfcyzuspni.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare and do not modify Cloudflare settings.

Do not perform a real customer checkout or leave test rows in the live database.

Required Database Behavior

Update public.atomic\_stock\_decrement(uuid, integer).

Preserve the existing row locking, FEFO batch ordering, soft-delete filtering, batch recomputation, newest-batch return behavior and updated\_at updates.

For a negative delta, calculate available stock before changing any batch or inventory row.

For batch-tracked items, available stock is the sum of non-deleted batch quantityRemaining values.

For manual-stock items without batches, available stock is inventory.stock.

If requested quantity is greater than available stock, raise a stable error such as INSUFFICIENT\_STOCK containing the item ID, requested quantity and available quantity.

Do not clamp an insufficient negative delta to zero and do not partially consume batches.

Positive deltas for returns/voids keep the existing behavior.

commit\_checkout\_invoice\_and\_stock must remain unchanged in its transaction boundary unless a small compatibility edit is necessary. It should inherit the strict error and roll back its invoice automatically.

Keep SECURITY INVOKER and least-privilege grants. Do not broaden RLS or grant execution to PUBLIC.

Repository Schema Alignment

Update the repository schema sources so inventory\_batches."inventoryItemId" is UUID, matching the verified live database:

supabase\_schema.sql

bootstrap\_schema.sql

Do not change the TypeScript representation; UUID values remain strings in the client.

Do not invent a destructive live type migration. The live column is already UUID; this is source-schema alignment.

Application Behavior

Do not reintroduce client-side stock reads or read-modify-write logic.

Keep the existing checkout RPC and its idempotency behavior.

Ensure an INSUFFICIENT\_STOCK RPC error reaches the POS as a failed checkout, not a success or local-save warning.

If a user-facing message is changed, keep it narrow and clearly say that stock was insufficient.

Do not refactor authentication, localDb removal, post-commit side effects, RLS, staff/payroll or unrelated screens.

Verification

Inspect the live definitions of both stock functions and the live inventory\_batches."inventoryItemId" type before editing.

Print the SQL before applying it through Supabase MCP.

Do not run a mutating checkout against real business data.

Verify by SQL review that the insufficient-stock check occurs before the first batch/inventory update and that an exception propagates through the checkout RPC.

Run npx tsc --noEmit.

Run npm run build.

Run npx playwright test tests/example.spec.ts.

Report the existing baseline status of the F2/F3 tests without repairing them here.

Inspect the final diff and status. Commit and push only intended files to main.

Confirm the Vercel deployment target remains unchanged. Do not investigate or modify Cloudflare.

Stop Conditions

Stop before applying SQL if:



The live batch column is not UUID.

The current stock RPC has semantics or callers not covered by this rule.

The function cannot calculate availability without changing rows first.

The checkout RPC does not roll back when the stock function raises.

Report the exact mismatch instead of guessing.





