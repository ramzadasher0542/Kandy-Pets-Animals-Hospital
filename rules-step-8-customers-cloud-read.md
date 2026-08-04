RULES: STEP 9 ONLY

Use this file with prompt-step-9-delete-history-soft-deleted.md only.



Mission

Restore the original deletion-safety behavior for client history: a client delete

preflight must include both active and soft-deleted pets when collecting pet IDs.

Normal application pet reads must continue excluding soft-deleted pets.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/lib/db.ts and src/components/CustomersManager.tsx before editing.

Only edit these files:

src/lib/db.ts

src/components/CustomersManager.tsx

Before changing fetchPets's signature, grep the whole repository for every call site.

Preserve the existing default behavior of fetchPets(): it must return only non-deleted pets.

Add the smallest explicit opt-in needed for the deletion preflight to receive soft-deleted pets.

Do not silently change any other caller's behavior.

Use that opt-in only in openDeleteClient in CustomersManager.tsx.

Preserve the existing client ID and client.petIds matching rules and all existing

!is\_deleted history-record filters.

Do not change computeHistory, openDeletePet, deletion callbacks, auth, UI, tests,

src/lib/localDb.ts, schema, RLS, RPCs or live data.

Do not add local storage, IndexedDB, caching, sync queues or fallback data.

Do not use Supabase MCP, SQL, a Vercel URL or credentials. This is a code-only task.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the closest existing

deletion test. Report every failure exactly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed and concise summary.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining IndexedDB, auth, frozen-feature, test-fixture and unrelated findings.





