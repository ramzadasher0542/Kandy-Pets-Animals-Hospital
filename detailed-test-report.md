# CeylonPets VHMS Detailed Test Report

## Test Charter

**Test date:** 2026-08-20 UTC  
**Environment:** Production Vercel deployment backed by Supabase Free  
**Application:** `https://kpah-aps.vercel.app/`  
**Repository:** `ramzadasher0542/Kandy-Pets-Animals-Hospital`  
**Test mode:** Synthetic QA data only. No real client, patient, financial, or staff data is to be introduced.

This is an operational acceptance test, not a superficial click-through. Each
scenario is judged from the perspective of the person doing the work, the
database transaction that must persist it, the next role that consumes it, and
the report or reconciliation that must explain it later.

Passwords are deliberately omitted. The supplied test identities are used only
in the live browser session and are not written to this report or repository.

## Roles Under Test

| Role | Test identity | Primary responsibilities |
|---|---|---|
| Administrator | `ramzadasher0542@gmail.com` | System access, configuration, oversight, recovery controls |
| Owner | `info@airportcars.lk` | Business oversight, approvals, reports, financial review |
| Cashier | `ashersajahan01@gmail.com` | Reception, appointments, shift, POS, payment, discharge |
| Veterinarian | `gamingasher0542@gmail.com` | Examination, diagnosis, treatment, laboratory, clinical sign-off |
| Groomer | Role to verify | Grooming queue, consent, service execution, billing |
| Boarding operator | Boarding workflow to verify | Intake, kennel care, feeding, medication, discharge |

The application currently has a grooming role but no separately named
`boarder` role. Boarding must therefore be tested as a workflow capability and
its actual role access must be recorded rather than assumed.

## Severity Model

- **P0 Blocker:** data loss, incorrect money, unsafe clinical state, or cannot open/close the hospital day.
- **P1 Critical:** a core workflow fails, persists the wrong state, or creates a material front-end/backend mismatch.
- **P2 Major:** workflow can continue only with a workaround, or reporting/permissions are materially misleading.
- **P3 Moderate:** usability, validation, accessibility, or operational friction that does not corrupt state.
- **P4 Minor:** copy, layout, or non-blocking polish.

## Scenario Matrix

### A. Opening the Hospital

- A01: Clean load shows the login screen when no valid session exists.
- A02: Administrator sign-in succeeds and cloud sync is visibly active.
- A03: Invalid password is rejected without exposing whether the email exists.
- A04: Authenticated session survives reload and maps to the correct role.
- A05: Administrator can open all intended operational panels and Settings.
- A06: Owner can sign in and sees only the intended owner surface.
- A07: Cashier can sign in and sees POS/Shift but not admin-only controls.
- A08: Veterinarian can sign in and sees clinical work but not financial administration.
- A09: Groomer access is either available with an explicit role or clearly blocked with an owner-action explanation.
- A10: Unlinked or deactivated staff cannot enter the application.

### B. Opening a Shift and Front Desk

- B01: Cashier opens a shift with a non-zero starting float.
- B02: A second open attempt is blocked when a shift already exists.
- B03: A second browser/device sees the same open shift.
- B04: Cash adjustment OUT requires amount, category, reason, and authorization.
- B05: Cash adjustment IN persists and changes expected drawer cash.
- B06: Customer record can be created with required contact data.
- B07: Pet record can be created and remains linked to the customer after reload.
- B08: Duplicate/near-duplicate customer handling is understandable and safe.
- B09: Appointment can be booked for OPD, vaccination, grooming, and boarding.
- B10: Appointment edits preserve identity and date/time correctly.
- B11: Cancellation and no-show states are explicit and do not create a billable visit.
- B12: Emergency intake can be created without silently losing the queue item.
- B13: Check-in changes the appointment and creates one active queue item.
- B14: Reload does not duplicate the queue item or lose the appointment.

### C. Veterinary Clinical Workflow

- C01: Veterinarian opens the correct patient from the queue.
- C02: Vitals and history persist with the visit.
- C03: Physical examination and normal/abnormal findings persist.
- C04: Assessment, diagnosis, prognosis, and treatment notes persist.
- C05: Prescribed medication references a real inventory item and quantity.
- C06: Inpatient log supports route, frequency, notes, and attending clinician.
- C07: Lab order can be created and is visible to the laboratory workflow.
- C08: Lab result can be finalized and remains visible in patient history.
- C09: Vaccination can be recorded with next due date and billing state.
- C10: Clinical save failure is visible and does not show a false success state.
- C11: Vet cannot perform cashier-only or owner-only financial actions.

### D. Grooming Workflow

- D01: Grooming appointment appears in the grooming work queue.
- D02: Groomer can record requested services and consent.
- D03: Groomer can mark the service complete without prematurely marking it paid.
- D04: Grooming service appears once in POS with a source reference.
- D05: Checkout marks the source grooming row billed exactly once.
- D06: Voiding the invoice releases the grooming row for rebilling.
- D07: Groomer cannot alter unrelated inventory, clinical records, or financial controls.

### E. Boarding Workflow

- E01: Boarding appointment or admission identifies the correct pet and owner.
- E02: Empty kennel selection opens an intake form with required checkout date.
- E03: Missing or zero boarding rate blocks admission with an actionable message.
- E04: Deposit guard shows the exact configured deposit before locking the kennel.
- E05: Standard boarding intake persists and locks one kennel.
- E06: Medical boarding captures doctor and cleaning fees.
- E07: Food/litter options persist and are reflected in the care plan.
- E08: Feeding plan can be set and feeding deducts the correct inventory quantity.
- E09: Medication log deducts stock atomically and records a billable source line.
- E10: Doctor round adds the configured fee once per round.
- E11: Discharge calculates refund or additional amount correctly.
- E12: Discharge frees the kennel and creates one follow-up/billing queue item.
- E13: Boarding source is billed once and is released by invoice void.
- E14: A duplicate click or reload does not create duplicate admission or charges.

### F. Inventory and Suppliers

- F01: Supplier can be added and remains available after reload.
- F02: Inventory item validates category, SKU, price, cost, and stock.
- F03: Duplicate SKU is blocked.
- F04: Batch receipt stores lot, expiry, quantity, and cost.
- F05: FEFO consumes the earliest expiring batch first.
- F06: Stock cannot go negative.
- F07: Clinical consumption, feeding, and POS decrement the same stock truth.
- F08: Void/reversal restores the exact stock and batch state.
- F09: Low-stock alert is generated only after a successful cloud write.

### G. POS, Payments, and Invoices

- G01: Register remains locked until a shift is open.
- G02: Retail/service cart calculates subtotal, tax, discount, and total consistently.
- G03: Cash checkout creates one paid invoice and decrements stock atomically.
- G04: Card checkout does not increase physical cash.
- G05: Bank transfer checkout does not increase physical cash.
- G06: Split payment totals must equal the invoice total before checkout.
- G07: Over-threshold discount requires the intended approval path.
- G08: Clinical, grooming, laboratory, vaccination, and boarding sources are billed exactly once.
- G09: Appointment closes only after the intended successful checkout path.
- G10: Duplicate submit/retry is idempotent.
- G11: Void is authorized, atomic, idempotent, restores stock, reverses shift revenue, and releases sources.
- G12: Invoice history shows paid and void invoices with correct totals.
- G13: Receipt values match the persisted invoice, not stale React state.

### H. Reports and Performance

- H01: Today/week/month/custom ranges use correct local dates.
- H02: Revenue, COGS, gross profit, and margin reconcile to paid invoices.
- H03: Payment-method totals reconcile to invoice totals, including split payments.
- H04: Appointments, completed visits, cancellations, and emergency counts reconcile.
- H05: Vet productivity counts completed appointments by clinician.
- H06: Cash vault equals paid cash plus adjustments less cash out.
- H07: Z-report agrees with shift reconciliation history.
- H08: Voided invoices are excluded from revenue but visible in void counts.
- H09: CSV export contains the same values shown on screen.
- H10: Email/print controls fail clearly when not configured.
- H11: Payroll is visibly deferred and not presented as net profit.

### I. Closing the Hospital

- I01: Cashier counts the actual drawer and sees balanced/short/over status.
- I02: Close is blocked if cloud sales or adjustments did not load completely.
- I03: Balanced close writes one closed shift and one reconciliation.
- I04: Discrepancy close records the exact signed discrepancy and notes.
- I05: Duplicate close/retry does not create a second reconciliation.
- I06: Daily backup becomes downloadable before the Z-report can be dismissed.
- I07: Backup file is complete and can be restored without deleting live rows.
- I08: Closed shift is visible in reports from another authenticated session.

### J. Security and Resilience

- J01: Anonymous access cannot read application tables.
- J02: Authenticated but unlinked users cannot read or write operational data.
- J03: Cashier cannot call owner/admin mutations through the UI or direct RPC.
- J04: Clinical role cannot perform cash adjustments or voids without authorization.
- J05: Staff PIN/password material is not exposed in browser reads or bundles.
- J06: Refresh/reconnect does not fabricate empty financial or clinical data.
- J07: Destructive actions are soft delete or protected RPC only.
- J08: Error messages identify the next safe action and do not claim success on failure.

## Execution Results

Results, evidence, and defects are appended below during the run. `PASS` means
the user-facing operation, persisted backend state, and downstream consumer all
agree. A click that appears to work but does not survive reload is a failure.

| Scenario range | Status | Notes |
|---|---|---|
| A. Opening/authentication | PARTIAL | Admin, owner, cashier, and veterinarian sign-in succeeded. Cashier/veterinarian panel coverage was too narrow before the role-matrix correction; groomer credential unavailable. |
| B. Front desk/shift start | PASS / PARTIAL | Synthetic client, pet, shift, OPD appointment, check-in, and clinical queue path passed. Cashier front-desk access required correction. |
| C. Veterinary clinical | PASS / PARTIAL | Appointment, queue, vitals, normal exam, assessment, treatment plan, chart lock, and discharge persisted. Medication, laboratory, and vaccination billing paths remain untested. |
| D. Grooming | PASS / FAIL | Consent validation and signed session persistence passed. Standalone completed grooming was not visible in POS before the source-card fix; production retest pending. |
| E. Boarding | PASS / FIXED / LIVE RETEST PASSED | Production test admitted synthetic `QA Luna` with a Rs. 15,000 deposit, discharged the kennel, refunded Rs. 15,000, and confirmed the boarding row plus matching cash movements in Supabase. |
| F. Inventory | PASS / PARTIAL | Supplier, service records, food item, batch receipt, expiry, and stock decrement passed. Duplicate SKU, FEFO, void reversal, and negative-stock boundaries remain untested. |
| G. POS/payments | PASS / PARTIAL | Cash checkout, tax, stock decrement, receipt, clinical billing, and grooming billing through an active queue passed. Card, bank transfer, split payment, discount approval, and void retest remain. |
| H. Reports | PASS / PARTIAL | Revenue, COGS, payment method, productivity, and Z-report values reconciled to recorded paid invoices. The fresh boarding ledger readback now confirms the deposit/refund movements; broader report and payment coverage remains. |
| I. Closing/recovery | PASS / PARTIAL | The earlier Rs. 14,872 synthetic Z-report predates the boarding ledger fix. The fresh boarding test wrote matching cash-in/cash-out movements. Backup/restore and duplicate-close tests remain. |
| J. Security/resilience | PARTIAL | Role matrix and visible panel boundaries were reviewed. Anonymous/RLS, direct RPC authorization, reconnect, and PIN exposure tests remain. |

## Findings

Findings are added only after reproduction. Each finding must include severity,
role, exact steps, expected result, actual result, frontend evidence, backend
evidence, impact, fix, and retest result.

### F-001 — P0 — Boarding deposit and refund bypassed the cash ledger

- **Role:** Administrator performing boarding admission; cashier responsible for the drawer.
- **Steps:** Configure a positive dog rate, admit synthetic pet `QA Luna` to Kennel 1, accept the Rs. 15,000 mandatory deposit, log one Rs. 800 food consumption, and discharge.
- **Expected:** The deposit is recorded as a cash/deposit transaction, the Rs. 800 charge is billable exactly once, and the Rs. 14,200 refund is represented as a cash-out/refund before the shift can be reconciled.
- **Actual:** The boarding screen displayed `Deposit held: Rs. 15,000`, `Charges to date: Rs. 800`, and `Refund: Rs. 14,200`, but Shift counted only the two POS invoices totaling Rs. 4,872 and expected drawer cash remained Rs. 14,872. No boarding deposit invoice or refund cash movement appeared in Invoices or Shift.
- **Frontend evidence:** Boarding showed a successful `Patient booked into Kennel 1` and `Discharged. Refund: Rs. 14,200`; Shift showed only Rs. 4,872 cash sales; Invoices showed no boarding deposit/refund transaction.
- **Backend/source evidence:** `BoardingManager.tsx` creates an `admission_deposit` billing item and sets `depositPaid: true` without a POS/shift mutation (`handleConfirmBooking`, lines 331-357). Discharge calculates and reports the refund but only updates the boarding row and requeues the patient (`handleDischargeSettle`, lines 237-292).
- **Impact:** Physical cash, customer liability, invoice history, and Z-report can disagree. This is a go-live blocker.
- **Fix:** Implemented the explicit cash-ledger model. Step 38 adds the Auth-guarded `commit_boarding_cash_ledger_auth` RPC. Admission records a `Boarding Deposit` cash-in movement. Discharge creates one settlement invoice for the actual boarding charges and records either a `Boarding Deposit Refund` cash-out or `Boarding Additional Charge` cash-in movement. Boarding, invoice, and movement commit together, with stable IDs for retries.
- **Retest:** Passed after production deployment. The first attempt correctly failed before writing because the RPC used unquoted `isOpen`; after applying the quoted predicate, `QA Luna` was admitted to Kennel 1, discharged, and refunded Rs. 15,000. Supabase readback showed one `IN 15000` and one `OUT 15000` boarding movement in the same shift, with no duplicate boarding row.

### F-002 — P1 — Completed grooming can be saved but has no standalone billing handoff

- **Role:** Groomer or front desk cashier.
- **Steps:** Create a signed grooming session for `QA Luna` with `Full Grooming` and `Nail Clipping`, then open POS without another active clinic queue item.
- **Expected:** POS shows a grooming source card under `Seen Today — Not Yet Billed` and imports the two configured service lines exactly once.
- **Actual before patch:** Grooming saved successfully and displayed `Grooming session completed & pushed to POS Queue`, but POS showed `No unbilled checkouts`. The session became billable only when an unrelated active queue item existed.
- **Frontend evidence:** Grooming history showed `COMPLETED` and `CONSENT SIGNED`; POS had no grooming card until the boarding discharge queue was present.
- **Backend/source evidence:** `GroomingManager.tsx` writes the log, while `POSRegister.tsx` only rendered appointment/clinic-queue cards and swept grooming rows after a patient was selected through one of those cards.
- **Impact:** A completed grooming service can remain unbilled indefinitely without an unrelated queue item.
- **Fix:** Added a direct unbilled-grooming source card in `POSRegister.tsx`, with patient/client context and source references.
- **Retest:** Source fix exists; fresh production grooming scenario still required.

### F-003 — P1 — Default role panels did not match operational responsibilities

- **Role:** Cashier, veterinarian, owner.
- **Steps:** Sign in with the supplied role identities and compare visible navigation with the operational scenario matrix.
- **Expected:** Cashier can perform reception setup (appointments, customers, pets); veterinarian can open patient/customer context, vaccinations, examinations, and laboratory; owner can review invoices.
- **Actual before correction:** Cashier saw only POS and Shift; veterinarian lacked Pets, Customers, Vaccinations, and Laboratory; owner lacked Invoices.
- **Frontend evidence:** Role-specific navigation was captured in the live browser before correction.
- **Backend/source evidence:** Both default permission maps in `App.tsx` had the narrower lists, and the persisted Panel Access Matrix reflected them.
- **Impact:** Core work was blocked or forced through administrator access, weakening least-privilege operations.
- **Fix:** Expanded the two `App.tsx` default maps and corrected the live Panel Access Matrix for these panels.
- **Retest:** Administrator production sign-in passed; role-by-role retest remains pending and no groomer identity was available.

### F-004 — P1 — Invoice patient identity can fall back to a name/phone key

- **Role:** Cashier and owner reviewing client lifetime value/history.
- **Steps:** Complete a patient-linked checkout and inspect the invoice patient identity and downstream client-value update path.
- **Expected:** Invoice `patientId` is the persisted pet UUID so source history and lifetime value updates resolve to the correct client.
- **Actual before patch:** POS constructed a name/phone composite key unless it was handling a walk-in, while the post-checkout handler looked up `pets` by UUID. This can silently skip the client lifetime-value update and patient-linked lookup.
- **Source evidence:** `POSRegister.tsx` built `patientId` from pet name and normalized phone; `App.tsx` later searched `pets` by `invoice.patientId`.
- **Impact:** Financial history can exist while client-level totals fail to update.
- **Fix:** POS now resolves the loaded pet UUID before constructing the invoice, with the old composite only as a fallback for incomplete data.
- **Retest:** Source fix exists; fresh production invoice identity check still required.

## Final Decision

**NO-GO pending remaining matrix.** F-001 is now fixed and live-verified in
production. F-002 through F-004 have source fixes or configuration corrections;
role/payment/security/recovery coverage, approved boarding rates, backup recovery,
and synthetic-data cleanup remain incomplete.
This report is not a go-live approval.

## Noticed, Not Fixed

- No groomer login identity was provided, so groomer-specific sign-in and least-privilege tests remain blocked.
- Card, bank transfer, split payment, discount approval, invoice void/reversal, laboratory, vaccination, backup/restore, RLS, direct-RPC, and reconnect tests remain incomplete.
- Boarding deposit/refund now uses explicit cash-in/cash-out ledger movements and a settlement invoice; the owner must confirm this matches the clinic's accounting policy.
- Synthetic QA records and service/food inventory remain in production pending owner-approved cleanup.
