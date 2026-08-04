RULES: STEP 4 ONLY

Use this file with prompt-step-4-client-fetch-safety.md only.



Mission

Make the existing Supabase client fetch fail closed instead of silently returning an

empty list when Supabase is unavailable or returns an error. This protects the new cloud

lookup path from treating an outage as "no client".



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current files and all fetchClients() call sites before editing.

Only edit src/lib/db.ts. If another file is required, stop and report it first.

Never invent a table, column, API, environment variable or error contract without

deriving it from the current code and the task below.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL or credentials for this task.

Do not change authentication, localDb, IndexedDB, staff/payroll, checkout, RLS,

SQL, tests, or any fetch function other than fetchClients().

Do not add a cache, fallback list, demo client, retry loop or compatibility layer.

Preserve the successful result shape, filtering and existing walk-in behavior unless

the prompt explicitly says otherwise.

If the current code differs from the prompt, stop and report the actual difference.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the most relevant

existing appointment test available. Report failures honestly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

The existing walk-in side effect and other unrelated error-swallowing fetch functions

must be listed if still present. Do not fix them in this task.





