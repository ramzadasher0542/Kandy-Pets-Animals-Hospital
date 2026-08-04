RULES: STEP 13 ONLY

Use this file with prompt-step-13-identity-write-durability.md only.



Mission

Make the two App-level customer/pet identity propagation handlers report partial

Supabase write failures accurately. They must not merge failed updates into React

state or silently claim that every history row was updated.



Hard rules

Read AGENTS.md and CLAUDE.md before editing.

From the repository directory, read ../outputs/rules-step-13-identity-write-durability.md

and ../outputs/prompt-step-13-identity-write-durability.md.

Check git status --short --branch and git diff --stat before editing.

Perform exactly this task. Do not fix unrelated issues.

Read the real current handleUpdateCustomer and handleUpdatePet functions before editing.

Only edit src/App.tsx.

Do not change cloud reads, helper signatures, matching predicates, payloads, auth,

UI, callback contracts, tests, schema, RLS, RPCs, localDb or live data.

Keep Promise.allSettled or an equivalent non-aborting approach so all independent

history writes are attempted.

Capture every write result. A rejected result must not be merged into local React state.

Fulfilled results may be merged exactly as before. Failed rows must remain unchanged

in local state and must be reported through the existing showToast mechanism.

Report partial failure once per handler invocation, not once per row. Do not expose

secrets or raw medical/financial payloads in the toast or logs.

Do not claim transactionality or add rollback logic. This task only makes partial

success visible and state-accurate.

Keep the current optimistic setPets ordering unchanged unless a type error requires

otherwise; it is outside this write-result task.

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

Remaining local persistence, auth, transactionality, optimistic state and unrelated findings.





