RULES: STEP 8 ONLY

Use this file with prompt-step-8-customers-cloud-read.md only.



Mission

Move CustomersManager history and pet/appointment lookup reads from IndexedDB to the

existing fail-closed Supabase helpers. A cloud read failure must block the delete flow,

not look like a customer with no history.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current target file and helper implementations before editing.

Only edit src/components/CustomersManager.tsx. If another file is required, stop

and report it before editing.

Use only existing functions. Never invent tables, columns, APIs or fallback data.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, API keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL, credentials or Supabase MCP for this code-only task.

Do not change authentication, staff/payroll, deletion callbacks, SQL, tests,

src/lib/db.ts, src/lib/localDb.ts or src/App.tsx.

Do not add local storage, IndexedDB, caching, sync queues or compatibility code.

If the real code differs from the prompt, stop and report the actual difference.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the closest existing

customer/deletion test. Report failures honestly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining IndexedDB, auth, frozen-feature and unrelated findings.





