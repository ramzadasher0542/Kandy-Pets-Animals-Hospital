# Step 31 Prompt: Run The Production Acceptance Gate

Read `STEP_31_RULES.md` first. Execute exactly that checklist against the current repository and live deployment.

Do not brainstorm. Do not redesign. Do not invent missing credentials, tables, policies, or test results. Do not use real clinic data. Do not run purge, wipe, truncate, or bulk delete operations.

Start by printing:

- current branch and commit
- clean or dirty working tree
- live URL and deployed commit
- available verification tools

Then run the required typecheck, build, focused Playwright checks, live RLS/RPC/grant inspection, backup/PITR inspection, Keerthi permission verification, and export verification in the exact order in `STEP_31_RULES.md`.

Run the disposable pilot only if you can isolate it from all real data and an existing open shift. Use a unique `KPAH_TEST_<UTC>` marker. Verify every expected effect, then prove zero rows with that marker remain. If isolation is not safe, mark the pilot `BLOCKED` and stop.

Make no code change unless a concrete acceptance failure requires it. If a change is required, edit only the named file, run the checks again, and report the commit and deployment.

End with the exact final report format from `STEP_31_RULES.md`. The result must be brutally honest: `READY`, `NOT READY`, or `BLOCKED`.

