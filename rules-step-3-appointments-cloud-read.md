RULES: STEP 3 ONLY

Use this file with prompt-step-3-appointments-cloud-read.md only.



Mission

Remove the remaining direct IndexedDB reads from AppointmentsManager by using the

existing Supabase fetchClients() function. This is one small cloud-read change, not

the whole IndexedDB migration.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current target file before editing. Do not trust old line numbers.

Only edit the file named by the prompt unless a compile error proves another file is

required. If another file is required, stop and report it first.

Never invent a function, table, column, API, environment variable or fallback.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, API keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL or credentials for this task. Existing test fixtures only.

Do not change authentication, role permissions, staff/payroll, checkout, SQL, tests,

src/lib/db.ts, src/lib/localDb.ts or src/App.tsx.

Do not add caching, local storage, IndexedDB, sync queues or compatibility code.

If the current code differs from the prompt, stop and report the actual difference.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the most relevant

existing appointment smoke test available. If a test cannot run, state why.

Do not claim a test passed unless the command actually passed.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands and actual pass/fail results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining IndexedDB uses and unrelated findings only.





