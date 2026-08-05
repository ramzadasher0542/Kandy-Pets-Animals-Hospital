RULES: STEP 15 ONLY

Use this file with prompt-step-15-checkout-source-failure.md only.



Mission

Make checkout source-record failures truthful and visible. A missing or failed cloud

record lookup must not be silently treated as success or reported as locally saved.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-15-checkout-source-failure.md

and ../outputs/prompt-step-15-checkout-source-failure.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current handleAtomicCheckout, CLOUD\_RETRY\_TOAST and source-record

block before editing.

Only edit src/App.tsx.

Do not change cloud helpers, invoice/stock/shift/visit/client-value operations,

auth, UI outside the existing toast path, tests, schema, RLS, RPCs or live data.

Keep the existing non-fatal checkout behavior: the sale remains committed and

source-record failures do not trigger rollback.

Track source-record billing failures separately from unrelated checkout cloud

failures. Do not use the generic “Saved locally. Cloud sync will retry.” message

for a source-record failure because no local source save or sync queue exists.

If a referenced source ID is absent from its successfully fetched cloud map, treat

it as a source-record failure and continue processing other references.

If a source collection read or source upsert fails, mark source billing as failed,

continue independent source types/references, and show one accurate generic warning

that the sale was saved but one or more linked service records were not billed in

the cloud.

Preserve the exact ID matching and billed: true plus updated\_at payload.

Keep the existing generic retry warning for unrelated checkout cloud failures.

If both categories fail, do not hide the source-specific warning.

Do not add local fallback data, retries, rollback or transactionality.

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

Remaining local stock-recovery, transactionality, auth, tests and unrelated findings.





