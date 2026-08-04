RULES: STEP 10 ONLY

Use this file with prompt-step-10-reports-cloud-reads.md only.



Mission

Move the supported financial/report reads in ReportsManager from IndexedDB to

fail-closed Supabase helpers. Do not pretend payroll, shift reconciliation or

deletion-audit data is cloud-backed when no verified cloud helper exists.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-10-reports-cloud-reads.md

and ../outputs/prompt-step-10-reports-cloud-reads.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current src/components/ReportsManager.tsx and the named helper

implementations before editing.

Only edit these files:

src/lib/db.ts

src/components/ReportsManager.tsx

Grep the whole repository for every fetchCashAdjustments call before changing

its signature or behavior.

fetchInvoices, fetchAppointments and fetchClients are existing cloud reads.

Do not weaken their fail-closed behavior or add local fallbacks.

Make the existing cash-adjustment read fail-closed: missing Supabase and query

errors must throw, never become an empty financial report.

Preserve existing fetchCashAdjustments(shiftId) behavior for current callers;

any all-adjustments mode must be an explicit, backwards-safe choice.

If a cloud read fails while loading supported report data, preserve the existing

state and show an existing error toast. Do not render a cloud failure as zero data.

Do not migrate or alter payslips, shift reconciliations or deletion-audit reads in

this task. They have no verified cloud helper/live contract and are frozen or deferred.

Do not change report calculations, date ranges, formatting, UI, auth, tests,

src/lib/localDb.ts, schema, RLS, RPCs or live data.

Do not add local storage, IndexedDB, caching, sync queues or compatibility code.

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

Remaining IndexedDB, auth, frozen payroll, deferred deletion-audit/shift data,

test-fixture and unrelated findings.





