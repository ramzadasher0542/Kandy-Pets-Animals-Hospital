RULES: STEP 7 ONLY

Use this file with prompt-step-7-harden-read-helpers.md only.



Mission

Make the eight shared Supabase read helpers fail closed so a cloud outage cannot look

like an empty database. This is required before moving customer deletion checks off

IndexedDB.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read every target helper and every source call site before editing.

Only edit src/lib/db.ts. If a caller must change, stop and report it; do not edit it.

Never invent tables, columns, APIs, error behavior or fallback data.

Do not run SQL or mutate Supabase schema/data.

Do not print secrets, API keys, passwords, tokens, personal data or medical data.

Do not use a Vercel URL, credentials or Supabase MCP for this code-only task.

Do not change authentication, localDb, IndexedDB, staff/payroll, checkout, SQL, tests,

CustomersManager.tsx or AppointmentsManager.tsx.

Do not change fetchClients(); it was hardened in the previous task.

Do not add caches, retries, local fallbacks, sync queues or compatibility code.

If any reachable caller cannot safely handle a thrown fetch error, stop with

Changed: None rather than changing callers outside the allowed file.

If the real code differs from the prompt, stop and report the actual difference.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the most relevant

existing read/deletion test available. Report failures honestly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed, or None.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Other error-swallowing helpers, walk-in side effects, IndexedDB and auth findings.





