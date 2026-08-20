# VHMS Test and Fix Progress

This file is the running checklist for the owner-requested operational test.
Passwords are not stored here. All testing uses synthetic data and the owner-
provided test identities in the live browser session only.

## Status Legend

- `NOT STARTED` — not yet exercised.
- `IN PROGRESS` — currently being tested or fixed.
- `BLOCKED` — requires owner configuration, missing role, or an unsafe action approval.
- `PASS` — workflow and persisted downstream state agree.
- `FAIL` — reproducible defect recorded in `detailed-test-report.md`.
- `FIXED / RETEST PENDING` — code change made; production retest still required.

## Work Order

1. `PASS / IN PROGRESS` Baseline live deployment, schema, role mapping, and current synthetic data.
2. `PARTIAL` Authentication and role-boundary tests; cashier/vet panel corrections applied, groomer identity unavailable.
3. `PASS / PARTIAL` Opening hospital, shift, front desk, customers, pets, and appointments.
4. `PASS / PARTIAL` Veterinarian clinical workflow; medication/lab/vaccination paths remain.
5. `PASS / FIXED / RETEST PENDING` Grooming workflow; direct standalone POS source card added.
6. `PASS / FAIL` Boarding/operator workflow; deposit/refund cash ledger remains a P0 blocker.
7. `PASS / PARTIAL` Inventory, suppliers, batches, FEFO, and low-stock behavior.
8. `PASS / PARTIAL` POS, payments, source billing, voids, and idempotency.
9. `PASS / PARTIAL` Reports, KPIs, CSV, Z-report, and performance reconciliation.
10. `PASS / PARTIAL` Closing shift, backup download, restore rehearsal, and second-session visibility.
11. `PARTIAL` Frontend/backend mismatch review and security/resilience checks.
12. `IN PROGRESS` Fix P0/P1 defects in dependency order.
13. `IN PROGRESS` Retest changed paths and publish final decision.

## Findings Index

- `F-001` P0 — Boarding deposit/refund bypasses cash ledger; owner accounting decision required.
- `F-002` P1 — Standalone completed grooming had no POS handoff; source fix added, production retest pending.
- `F-003` P1 — Cashier/veterinarian/owner panel permissions were too narrow; live matrix and defaults corrected, retest pending.
- `F-004` P1 — POS patient identity could be a name/phone composite instead of pet UUID; source fix added, production retest pending.

## Release Gate

- No P0/P1 defect remains open.
- Every financial mutation has a persisted, reloadable result.
- Every clinical source can be billed once and voided/released once.
- Role visibility and Supabase RLS agree.
- Opening and closing a shift reconcile to the same values in POS, Z-report, and Reports.
- Owner has reviewed synthetic-data cleanup and the final go/no-go decision.

## Last Update

2026-08-20 UTC — Live clinical, grooming, boarding, inventory, POS, reporting, and shift-close paths exercised. P0/P1 findings recorded; source fixes and live permission corrections applied, production retest pending.

