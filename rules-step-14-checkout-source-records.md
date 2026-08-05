RULES: STEP 14 ONLY

Use this file with prompt-step-14-checkout-source-records.md only.



Mission

Remove the four active checkout source-record reads from IndexedDB. When checkout

marks vaccinations, grooming logs, lab results or boarding records as billed, it

must locate those records in Supabase rather than an empty local mirror.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-14-checkout-source-records.md

and ../outputs/prompt-step-14-checkout-source-records.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current handleAtomicCheckout, its imports, sourceRefs shape and all

four existing cloud fetch/upsert helper implementations before editing.

Only edit src/App.tsx.

Use the existing fail-closed helpers fetchVaccinations, fetchGroomingLogs,

fetchLabResults and fetchBoardingRecords. Do not add helpers, tables or schema.

Preserve the existing source-reference type/id matching and billed: true payload.

Do not use IndexedDB for source-record lookup. Remove only these targeted calls:

db.vaccinations.getItem, db.groomingLogs.getItem, db.labResults.getItem and

db.boardingRecords.getItem.

Keep the already-committed invoice, stock, shift, visit-close and client-value flow

unchanged. Do not change the separate db.inventory.getItem stock-recovery fallback

in this task.

A source-record read failure must not turn a committed sale into a fake checkout

failure. Preserve the existing non-fatal warning behavior, but surface a generic

retry warning through the existing toast mechanism if needed.

Attempt independent source types without letting one failed fetch prevent available

records of another type from being marked billed. Do not add local fallback data.

Do not change auth, UI, tests, schema, RLS, RPCs, live data or localDb definitions.

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

Remaining IndexedDB, local stock-recovery, auth, transactionality and unrelated findings.





