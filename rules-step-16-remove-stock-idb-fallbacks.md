RULES: STEP 16 ONLY

Use this file with prompt-step-16-remove-stock-idb-fallbacks.md only.



Mission

Remove the three App-level IndexedDB inventory lookups used as stock-recovery

fallbacks. Stock state must come from the cloud atomic operation or fail visibly;

it must never be reconstructed from a local mirror.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-16-remove-stock-idb-fallbacks.md

and ../outputs/prompt-step-16-remove-stock-idb-fallbacks.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/App.tsx, atomicStockDecrement, isCloudSaveError and

all three stock-recovery branches before editing.

Only edit src/App.tsx.

Remove only these targeted calls:

db.inventory.getItem in handleUpdateStock;

db.inventory.getItem in handleVoidInvoice;

db.inventory.getItem in handleAtomicCheckout.

If atomicStockDecrement fails, do not update React stock from a local fallback.

Preserve the existing visible error/outer failure path appropriate to each handler.

Do not change atomicStockDecrement, invoice ordering, checkout ordering, voiding

behavior beyond removing the local fallback, source billing, shift handling, auth,

UI, tests, schema, RLS, RPCs, live data or other IndexedDB uses.

Do not change unrelated CLOUD\_RETRY\_TOAST uses. Do not add local storage, retry

queues, fake stock values or compatibility fallbacks.

Keep the cloud-success path and existing React state updates unchanged.

Do not use Supabase MCP, SQL, a Vercel URL or credentials. This is code-only.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the closest existing

smoke test. Report every failure exactly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact file changed and concise summary.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining IndexedDB, transactionality, auth, deferred data and unrelated findings.





