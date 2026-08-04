RULES: STEP 11 ONLY

Use this file with prompt-step-11-reports-failure-isolation.md only.



Mission

Correct the Step 10 ReportsManager load sequencing so a failed cloud report read

does not prevent the untouched deferred local report sections from loading. A cloud

failure must preserve supported cloud state and must never become zero financial data.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-11-reports-failure-isolation.md

and ../outputs/prompt-step-11-reports-failure-isolation.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/components/ReportsManager.tsx before editing.

Only edit src/components/ReportsManager.tsx.

Do not change src/lib/db.ts, any cloud helper, report formulas, date ranges,

filters, sorting, UI, auth, tests, schema, RLS, RPCs or live data.

Keep the four Step 10 cloud reads fail-closed and keep their existing error toast.

If a cloud read fails, do not call setters for supported cloud state or metrics.

Preserve their previous state.

Regardless of cloud success or failure, still attempt the untouched local reads for

deletion audit, payslips and shift reconciliations. Their existing filters, sorting

and state updates must remain unchanged.

Isolate deferred local-read failures so one failed local section does not prevent

the other two local sections from being attempted.

If a deferred local read fails, preserve its previous state; do not fabricate an

empty result. Do not add new fallback storage or compatibility code.

Keep localDb because the deferred reads still require it.

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

Remaining IndexedDB, auth, frozen/deferred data, test coverage and unrelated findings.







