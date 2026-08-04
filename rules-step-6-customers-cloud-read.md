RULES: STEP 6 ONLY

Use this file with prompt-step-6-customers-cloud-read.md only.



Mission

Move the customer-history safety reads away from IndexedDB only when the Supabase read

path is proven fail-safe. A cloud error must never look like "no history" before a delete.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current target and helper implementations before editing.

Only edit src/components/CustomersManager.tsx. If another file is needed, stop and

report the blocker; do not edit it.

Never invent tables, columns, APIs, error behavior or fallback data.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, API keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL, credentials or Supabase MCP for this code-only task.

Do not change authentication, staff/payroll, deletion callbacks, SQL, tests,

src/lib/db.ts, src/lib/localDb.ts or src/App.tsx.

Do not replace a local read with a cloud function that can silently return \[] or

null on error. If the needed helper is not fail-safe, stop with Changed: None.

Do not add a cache, local fallback, sync queue or compatibility layer.

If the real code differs from the prompt, stop and report the actual difference.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the most relevant

existing customer/deletion test if one exists. Report failures honestly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers, especially non-fail-safe cloud helpers.



Noticed, not fixed

Remaining IndexedDB, auth, schema and frozen-feature findings only.





