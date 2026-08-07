# Step 31 Rules: Production Acceptance Gate

## Mission

Prove whether Ceylon Pets is safe for real clinic data. Do not redesign the product. Do not start another feature task.

## Source Of Truth

- Work from the current `main` checkout.
- Confirm the working tree is clean before starting.
- Confirm the live deployment is `https://kpah-aps.vercel.app/`.
- Read the real current source and live state before making any claim.

## Safety Rules

- Never wipe, truncate, purge, or bulk-delete existing clinic data.
- Never use a real client, pet, appointment, invoice, or staff record as a test fixture.
- Do not run a disposable pilot if it cannot be isolated from an existing open shift or live clinic records.
- If temporary rows are created, use a unique `KPAH_TEST_<UTC>` marker and prove every temporary row is gone before reporting success.
- Do not click close, void, checkout, erase, or restore controls during a read-only audit.
- Do not claim a test passed without command output, live evidence, or a returned SQL result.
- If access, database inspection, or credentials are missing, report `BLOCKED` and stop. Do not guess.

## Exact Sequence

1. Verify repository head, clean status, deployed commit, and current production asset.
2. Run `npx tsc --noEmit`, `npm run build`, and the focused Playwright checks. Record exact results.
3. Inspect live RLS, RPC definitions, execute grants, and backup/PITR status. Compare them with the checked-in SQL.
4. Confirm the real Keerthi role and whether Keerthi can perform only the intended checkout, void, adjustment, and close actions.
5. Verify the full backup export contains the expected collections. Do not call the disabled restore path.
6. Only if an isolated fixture is safe, run one disposable pilot covering client, pet, appointment, invoice, stock, void, shift reconciliation, reload, and second-device read.
7. Clean up the fixture and query for the unique marker. Zero residue is required.
8. Produce the acceptance matrix below and stop. Do not start unrelated fixes.

## Required Acceptance Matrix

- Checkout retry is idempotent: PASS / FAIL / BLOCKED
- Invoice void restores stock and reverses revenue exactly once: PASS / FAIL / BLOCKED
- Shift close blocks incomplete cloud loads: PASS / FAIL / BLOCKED
- Keerthi role and permissions are correct: PASS / FAIL / BLOCKED
- Backup export and provider recovery path are usable: PASS / FAIL / BLOCKED
- Disposable pilot leaves zero residue: PASS / FAIL / BLOCKED

## Change Rule

Only make a code change when a concrete acceptance failure requires it. Make the smallest change, rerun all required checks, and report the commit. Do not rewrite the application or the database schema during this gate.

## Final Report Format

- Overall status: READY / NOT READY / BLOCKED
- Progress: accepted items / total items
- Evidence: exact commands, commit, deployment, and live observations
- Findings: highest-risk failures first
- Data mutation: none, or exact disposable marker and cleanup proof
- One next action: one sentence only

