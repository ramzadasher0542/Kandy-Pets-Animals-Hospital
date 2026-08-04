RULES: STEP 5 ONLY

Use this file with prompt-step-5-remove-obsolete-boot.md only.



Mission

Remove obsolete IndexedDB migration code and the dead sync-queue state from the app boot

path. This is cleanup, not the final IndexedDB removal.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/App.tsx before editing. Do not trust old line numbers.

Only edit src/App.tsx. If another file is required, stop and report it first.

Never invent a function, table, column, API, environment variable or fallback.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, API keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL or credentials for this task.

Do not change authentication, Supabase queries, active clinic writes, staff/payroll,

checkout, tests, src/lib/db.ts or src/lib/localDb.ts.

Do not delete localDb, localforage, db.system, active-shift persistence or

config persistence in this task.

If the real code differs from the prompt, stop and report the difference.

Before removing a state variable or import, grep the whole file for every use.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and an existing boot smoke

test. Report any failure honestly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining active IndexedDB usage, authentication gaps and unrelated findings.





