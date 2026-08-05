RULES: STEP 17 ONLY

Use this file with prompt-step-17-atomic-stock-rpc.md only.



Mission

Replace the client-side read/modify/write implementation of atomicStockDecrement

with one PostgreSQL RPC transaction. Stock changes must be serialized by the database,

not only by a mutex in one browser.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-17-atomic-stock-rpc.md

and ../outputs/prompt-step-17-atomic-stock-rpc.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not implement the full checkout transaction yet.

Read the real current atomicStockDecrement, its callers, types.ts, the canonical

SQL schema and the live Supabase table/function metadata before writing SQL.

Only edit these files:

src/lib/db.ts

atomic\_stock\_decrement\_rpc.sql

Supabase MCP is required for this task. Use it only to inspect the live schema,

apply the non-destructive function/grant SQL, and verify the function exists.

Print the exact SQL before executing it through MCP. Never run DROP, DELETE, TRUNCATE

or test calls that mutate real inventory without explicit user approval.

Do not change RLS, table columns, existing data, auth, checkout ordering, invoice

behavior, source billing, tests or unrelated helpers.

Preserve the existing atomicStockDecrement(itemId, qtyDelta): Promise<number> API

and all caller semantics for positive and negative deltas.

The database function must preserve verified current behavior: row-level locking,

non-deleted batch filtering, FEFO consumption for negative deltas, newest-batch

return handling for positive deltas, manual-stock handling when no batches exist,

stock recomputation and numeric resulting-stock return.

The client helper must stop performing the inventory/batch read-modify-write itself.

It may retain the existing in-browser mutex, but the RPC is the source of atomicity.

Do not silently broaden function execution privileges. Grant only the verified

existing application roles if execution is not already granted; report any security

mismatch instead of weakening RLS.

If live columns, types or constraints differ from the repository assumptions, stop

and report the difference before editing or applying SQL.

After every logical code edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the closest existing

smoke test. Report every failure exactly.

Do not commit, push, reset or change git history.

Required final report

Changed

Exact files changed and exact SQL applied.



Verified

MCP inspection/application results, commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Full checkout transaction, RLS/security, local auth, remaining IndexedDB and unrelated findings.





