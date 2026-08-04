RULES: STEP 12 ONLY

Use this file with prompt-step-12-app-customer-updates.md only.



Mission

Remove the remaining direct IndexedDB history scans from the two App-level customer

and pet identity propagation handlers. These updates must find cloud history, not

only local mirrors.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-12-app-customer-updates.md

and ../outputs/prompt-step-12-app-customer-updates.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/App.tsx, src/lib/db.ts and every named helper before editing.

Only edit these files:

src/App.tsx

src/lib/db.ts only if the existing appointment helper needs a minimal opt-in.

Grep the whole repository for every fetchAppointments( call before changing its

signature or behavior.

Preserve the default behavior of every existing helper caller.

Use fail-closed cloud reads. If a required read throws, show an existing error toast

and return before attempting the propagation writes.

Preserve the existing phone normalization and matching predicates exactly.

Preserve the existing !is\_deleted medical-record predicate. Customer propagation

must retain the previous treatment of appointment and invoice rows, including old

rows that are soft-deleted if the original scan included them.

Do not change propagation write behavior, callback contracts, auth, UI, boot hydration,

checkout, tests, schema, RLS, RPCs, live data, src/lib/localDb.ts or localStorage.

Do not add caching, sync queues, compatibility fallbacks or IndexedDB reads.

Do not use Supabase MCP, SQL, a Vercel URL or credentials. This is code-only.

After every logical edit, run npx tsc --noEmit. Fix only errors caused by this task.

Before finishing, run npx tsc --noEmit, npm run build, and the closest existing

smoke test. Report every failure exactly.

Do not commit, push, reset, stash or change git history.

Required final report

Changed

Exact files changed and concise summary.



Verified

Exact commands, test names and actual results.



Blockers

Concrete blockers only.



Noticed, not fixed

Remaining IndexedDB, auth, frozen/deferred data, write-error handling and unrelated findings.





