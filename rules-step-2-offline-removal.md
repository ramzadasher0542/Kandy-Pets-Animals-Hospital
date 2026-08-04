RULES: STEP 2 ONLY

Use this file with prompt-step-2-offline-removal.md. Do not use another task prompt.



Mission

Remove the dead offline orchestration and automatic fake-data behavior. Do not attempt

the entire IndexedDB removal in one run. This is the first small, testable slice of the

Supabase-only migration.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read every target file in its current state. Do not trust old line numbers.

Never invent a table, column, function, import, environment variable or API.

Do not run SQL or mutate Supabase in this task.

Do not print secrets, tokens, passwords, credential hashes or personal/medical data.

Do not change Supabase authentication, roles, permissions or future staff/payroll features.

Do not delete src/lib/localDb.ts, change src/lib/db.ts, or remove active local-data

call sites in this task. Those require separate smaller tasks after this one.

Do not add packages, tests that use fake IndexedDB, fallback sync, caching or new

compatibility code.

If the real code differs from the prompt, stop and report the difference. Do not guess.

Before deleting a file, grep the whole repository for imports and call sites. Delete

only when the search proves it is unused after the edit.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the most relevant

existing Playwright test or smoke check available. If a test cannot run, say why.

Do not claim success from reasoning. Report exact commands and actual results.

Do not commit or change git history.

Required final report

Changed

Exact files changed, deleted, or None.



Verified

Exact commands, test names and pass/fail results.



Blockers

Concrete blockers only.



Noticed, not fixed

Unrelated findings only.





