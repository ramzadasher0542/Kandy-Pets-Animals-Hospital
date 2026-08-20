# Ceylon Pets VHMS Manual Check Guide

Use this guide exactly as written. It is deliberately repetitive.

## Before You Start

- Open `https://kpah-aps.vercel.app/`.
- Use test names only: `Manual QA YYYY-MM-DD`, `Manual Pet YYYY-MM-DD`.
- Do not enter real patient, client, payment-card, or medical data.
- Keep the supplied Administrator password in your password manager. Do not
  write it in this file, screenshots, tickets, or chat.
- If a step fails, stop that scenario and record the exact message and time.
- Never click reset, purge, delete, or restore on production without owner approval.

## What Counts As Pass

A scenario passes only when all three are true:

1. The screen shows the expected result.
2. The result is still present after a browser refresh.
3. The next screen that uses the result shows the same information.

If any one of the three is false, mark the scenario `FAIL`.

## 1. Administrator Login

- [ ] Open the site in a private/incognito window.
- [ ] Confirm the sign-in screen appears.
- [ ] Enter the Administrator email and password.
- [ ] Click `Sign In`.
- [ ] Confirm `CLOUD SYNC ACTIVE` is visible.
- [ ] Confirm `Settings`, `Invoices`, `Shift & Drawer`, `Reports`, `Boarding/Hotel`, and `Grooming Salon` are visible.
- [ ] Refresh the page.
- [ ] Confirm the app stays signed in and the same panels remain visible.

Expected result: login works and cloud data is visible. A blank screen, local-only data, or a database-corruption warning is a failure.

## 2. Settings And Safe Test Setup

- [ ] Open `Settings`.
- [ ] Open the boarding-rate section.
- [ ] Set a positive dog rate, for example `Rs. 4,000` per day.
- [ ] Set the default deposit to `Rs. 15,000`.
- [ ] Save the settings.
- [ ] Refresh the page and confirm both values remain.
- [ ] Open `Inventory`.
- [ ] Confirm a food item exists with stock above zero.
- [ ] Confirm at least one service item exists.
- [ ] Do not delete existing synthetic QA items unless the owner approves cleanup.

Expected result: rates and inventory survive refresh. A zero or `NaN` boarding rate is a failure.

## 3. Open A Shift

- [ ] Open `Shift & Drawer`.
- [ ] If a shift is already open, do not open another one.
- [ ] If closed, enter starting float `Rs. 10,000`.
- [ ] Click `OPEN REGISTER & START SHIFT`.
- [ ] Confirm `ACTIVE SESSION` and `OPENING FLOAT Rs. 10,000` appear.
- [ ] Open `POS`.
- [ ] Confirm the register is usable.
- [ ] Sign out or refresh in a second browser tab if available.
- [ ] Confirm the same shift is still open.

Expected result: only one active shift exists. POS must be locked when no shift is open.

## 4. Create A Test Client, Pet, And Appointment

- [ ] Open `Customers`.
- [ ] Add `Manual QA YYYY-MM-DD` with a test phone number.
- [ ] Save and refresh.
- [ ] Confirm the client remains.
- [ ] Open `Pets`.
- [ ] Add `Manual Pet YYYY-MM-DD` linked to that client.
- [ ] Save and refresh.
- [ ] Confirm the pet still shows the correct owner.
- [ ] Open `Appointments`.
- [ ] Book an OPD appointment for the test pet.
- [ ] Check the pet in once.
- [ ] Confirm one active queue item appears.
- [ ] Refresh.
- [ ] Confirm the queue item was not duplicated.

Expected result: client, pet, appointment, and queue identity stay linked after refresh.

## 5. Clinical Visit

- [ ] Open the test pet from the clinical queue.
- [ ] Enter vitals.
- [ ] Mark the physical examination normal, then add one short note.
- [ ] Enter an assessment, diagnosis, and treatment plan.
- [ ] Save.
- [ ] Refresh the page.
- [ ] Reopen the same patient.
- [ ] Confirm vitals, examination, assessment, and treatment plan remain.
- [ ] Lock/sign the chart.
- [ ] Discharge the patient.

Expected result: saved clinical information survives refresh. A success toast without persisted data is a failure.

## 6. Grooming And POS Handoff

- [ ] Create a grooming appointment for a fresh test pet.
- [ ] Open `Grooming Salon`.
- [ ] Select the test pet.
- [ ] Select two configured services.
- [ ] Capture the owner's consent/signature.
- [ ] Save the session.
- [ ] Mark the service completed.
- [ ] Refresh the page.
- [ ] Confirm the session is `COMPLETED` and consent remains signed.
- [ ] Open `POS`.
- [ ] Under `Seen Today - Not Yet Billed`, find the grooming card.
- [ ] Confirm it shows the real pet and owner, not `Unknown Owner`.
- [ ] Click `Import Grooming Charges` once.
- [ ] Confirm exactly the two selected services enter the cart.
- [ ] Process a cash payment.
- [ ] Confirm one paid invoice is created.
- [ ] Return to the POS source list.
- [ ] Confirm the grooming card is gone or marked billed.

Expected result: a completed grooming session is billable without another clinic queue item and cannot be billed twice.

## 7. Boarding Deposit, Charge, And Refund

Use a fresh test pet and an empty kennel.

- [ ] Confirm a shift is open before starting.
- [ ] Open `Boarding/Hotel`.
- [ ] Select an empty kennel.
- [ ] Select the test pet.
- [ ] Choose an expected checkout date.
- [ ] Choose `With Food` only if an in-stock food item is available.
- [ ] Click `Initiate Booking Process`.
- [ ] Confirm the deposit amount is exactly `Rs. 15,000`.
- [ ] Click `Collect & Lock Cage` once.
- [ ] Confirm the kennel is occupied and locked.
- [ ] Open `Shift & Drawer`.
- [ ] Confirm cash-in adjustments include `Boarding Deposit Rs. 15,000`.
- [ ] Return to `Boarding/Hotel`.
- [ ] Set a feeding plan if food was selected.
- [ ] Log one feed.
- [ ] Confirm food stock decreases by the exact quantity used.
- [ ] Discharge and settle the boarding account.
- [ ] Confirm the kennel becomes empty.
- [ ] If charges are less than the deposit, confirm a `Boarding Deposit Refund` cash-out adjustment.
- [ ] If charges exceed the deposit, confirm a `Boarding Additional Charge` cash-in adjustment.
- [ ] Open `Invoices`.
- [ ] Confirm exactly one boarding settlement invoice exists for the actual charges.
- [ ] Confirm the invoice identifies the correct pet and owner.
- [ ] Open `Shift & Drawer` again.
- [ ] Confirm the expected cash includes the deposit and refund/additional movement.
- [ ] Refresh and repeat the invoice/shift checks.

For the normal test with one `Rs. 800` food charge:

- Deposit cash-in: `Rs. 15,000`.
- Settlement invoice revenue: `Rs. 800`.
- Refund cash-out: `Rs. 14,200`.
- Drawer effect of deposit/refund: `+Rs. 800` net.
- Starting float `Rs. 10,000` plus that net effect should be `Rs. 10,800` before any other sales.

Expected result: boarding, invoice, and cash movement all agree. A boarding screen that shows a refund but Shift does not show it is a failure.

## 8. POS Payment Methods

Use a low-value synthetic inventory item for each test.

### Cash

- [ ] Add one item to the cart.
- [ ] Select `CASH`.
- [ ] Process the transaction.
- [ ] Confirm one paid invoice and one stock decrement.
- [ ] Confirm cash sales increase by the invoice total.

### Card

- [ ] Add one item to the cart.
- [ ] Select `CARD`.
- [ ] Process the transaction.
- [ ] Confirm the invoice is paid.
- [ ] Confirm physical cash does not increase.

### Bank Transfer

- [ ] Add one item to the cart.
- [ ] Select `BANK TRANSFER`.
- [ ] Process the transaction.
- [ ] Confirm the invoice is paid.
- [ ] Confirm physical cash does not increase.

### Split Payment

- [ ] Select `SPLIT PAYMENT`.
- [ ] Enter cash, card, and bank amounts whose total exactly equals the invoice total.
- [ ] Confirm `Balanced` appears.
- [ ] Process the transaction.
- [ ] Confirm the invoice records the three payment portions.
- [ ] Repeat with a deliberately wrong total.
- [ ] Confirm the process button is disabled.

Expected result: payment totals must equal the invoice total. No overpayment or underpayment may be accepted.

## 9. Discounts And Voids

- [ ] Add an item to the cart.
- [ ] Enter a discount below 10 percent.
- [ ] Confirm checkout works.
- [ ] Start another test sale.
- [ ] Enter a discount above 10 percent.
- [ ] Confirm an authorization prompt appears.
- [ ] Cancel or deny it and confirm no invoice is created.
- [ ] Complete an approved test sale.
- [ ] Open `Invoices`.
- [ ] Inspect the test invoice.
- [ ] Click `Void Invoice`.
- [ ] Confirm the authorization prompt.
- [ ] Confirm the invoice changes to `void`.
- [ ] Confirm stock returns to its previous value.
- [ ] Confirm revenue and shift totals reverse.
- [ ] For a clinical, grooming, vaccination, laboratory, or boarding invoice, confirm the source becomes billable again.
- [ ] Click void again if the UI allows it.
- [ ] Confirm no second reversal occurs.

Expected result: void is authorized, atomic, repeat-safe, and reversible.

## 10. Laboratory And Vaccination

- [ ] Create a vaccination for a test pet.
- [ ] Confirm the vaccination appears in patient history.
- [ ] Confirm its next due date is visible.
- [ ] Confirm it appears in POS as an unbilled source.
- [ ] Bill it once.
- [ ] Confirm it disappears from unbilled sources.
- [ ] Create a laboratory order.
- [ ] Finalize a result.
- [ ] Confirm the result remains after refresh.
- [ ] Bill the laboratory source once.
- [ ] Confirm it disappears from unbilled sources.

Expected result: clinical sources persist, bill once, and are released if their invoice is voided.

## 11. Reports And Reconciliation

- [ ] Open `Reports`.
- [ ] Select `Today`.
- [ ] Confirm paid revenue equals the sum of paid invoices.
- [ ] Confirm void invoices are not included in revenue.
- [ ] Confirm cash, card, bank, deposit, cash-in, and cash-out values are shown consistently.
- [ ] Confirm boarding deposit/refund movements appear in the cash sections.
- [ ] Confirm the Z-report expected cash equals the active shift calculation.
- [ ] Change the date range and confirm the values change.
- [ ] Export CSV if available.
- [ ] Open the CSV and compare one or two totals with the screen.

Expected result: reports explain the same money shown by POS and Shift.

## 12. Close Shift And Backup

- [ ] Open `Shift & Drawer`.
- [ ] Wait until sales and adjustments have loaded.
- [ ] Enter the exact physical drawer count shown as expected.
- [ ] Close the shift.
- [ ] Confirm the result says `Balanced`.
- [ ] Click `Download Daily Backup` before dismissing the report.
- [ ] Confirm the backup file downloads to your computer.
- [ ] Open another browser session.
- [ ] Sign in and open `Reports`.
- [ ] Confirm the closed shift appears.
- [ ] Confirm POS is locked until a new shift is opened.

Expected result: one closed shift, one reconciliation, and one retained backup file.

## 13. Role Checks

Use each role's own approved password. Do not reuse or record the Administrator password.

- [ ] Administrator: all intended panels and Settings are visible.
- [ ] Owner: financial reports and invoices are visible; admin-only configuration is not broader than intended.
- [ ] Cashier: POS, Shift, appointments, customers, and pets are visible; direct void/admin controls are protected.
- [ ] Veterinarian: examinations, laboratory, vaccinations, pets, and customers are visible; cash adjustments and voids are denied.
- [ ] Groomer: grooming is visible; unrelated clinical, inventory, and financial administration is not visible.
- [ ] An unlinked or deactivated staff account is denied access.
- [ ] Refresh each role session and confirm its role does not change.

Expected result: visible panels and actual permissions agree. If a hidden action still works, mark `FAIL`.

## 14. Backup Restore Rehearsal

- [ ] Export a full backup from `Settings` or the shift-close backup.
- [ ] Keep the file outside Supabase.
- [ ] Do not restore into production unless the owner explicitly approves it.
- [ ] Prefer a separate safe target for restore rehearsal.
- [ ] After restore, compare counts for clients, pets, invoices, inventory, shifts, grooming, and boarding.
- [ ] Confirm no existing live rows were deleted.

Expected result: restore is tested against a safe target, not claimed based only on downloading a file.

## Failure Record

Copy this for every failed scenario:

- Date/time:
- Scenario number:
- Signed-in role:
- Test client/pet:
- Exact clicks:
- Expected result:
- Actual result:
- Error message:
- Did refresh preserve it? Yes/No
- Screenshot or invoice/shift ID:
- Severity: P0 / P1 / P2 / P3

## Honest Release Rule

Do not approve real clinic use if any of these are true:

- Boarding deposit/refund does not reconcile to Shift.
- A paid invoice can be duplicated or voided twice.
- A clinical or grooming source can be billed twice.
- A role can perform a financial action it should not perform.
- A backup cannot be downloaded and restored to a safe target.
- A source fix has not been retested on the live deployment.

The application remains a controlled beta until every item above passes and the owner approves synthetic-data cleanup and the final go/no-go decision.
