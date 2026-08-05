Step 28 Rules: Atomic Shift Accounting

Mission

Make shift accounting reliable across multiple clinic devices. A paid sale must belong to the shift stamped on its invoice, revenue counters must update atomically, voids must reverse revenue, and reconciliation must include the complete shift rather than only today's invoices.



Confirmed State

Repository: https://github.com/ramzadasher0542/Kandy-Pets-Animals-Hospital.git

Branch: main

Step 27 code commit: fd1b825

Latest main tip: ae49026 (rules-only commit)

Current deployment: https://kpah-aps.vercel.app/ loads the Ceylon Pets sign-in screen.

addRevenueToActiveShift() uses a read-modify-write protected only by a browser-local mutex.

Checkout commits the invoice before attaching revenue and then discovers the newest open shift again.

The shifts schema has no database protection against multiple open shifts.

Voiding restores stock and marks the invoice void, but does not reverse shift counters.

Reconciliation calculates from today's in-memory invoice list.

Active-shift cloud errors collapse into “no active shift.”

Required Work

Inspect every call site for revenue updates, checkout, voiding, active-shift lookup, and reconciliation.

Use the invoice's existing shiftId for revenue attribution. Never discover a new “latest open shift” after checkout.

Replace read-modify-write revenue updates with a reviewed database RPC that locks the target shift and applies validated integer-cent deltas.

Add the smallest safe database protection against concurrent open shifts. Inspect live data first; never silently merge or delete existing shifts.

Reverse paid-invoice revenue exactly once when an invoice is voided.

Reconcile using all paid invoices for the selected shift, including shifts crossing midnight.

Distinguish cloud unavailable from a legitimate empty result. Block unsafe register state changes when cloud state cannot be confirmed.

Constraints

One task only: shift accounting.

Do not touch auth, staff/payroll, deletion auditing, backup/restore, general sync migration, Cloudflare, or unrelated UI.

Inspect live Supabase schema, RPCs, policies, and rows before proposing SQL.

Print SQL before running it. Never delete, truncate, merge, or rewrite existing shift data without approval.

Do not invent tables or columns.

Preserve the idempotent close RPC unless a minimal compatible change is proven necessary.

The current Vercel target is https://kpah-aps.vercel.app/.

Verification

Run npx tsc --noEmit.

Run npm run build.

Run relevant Playwright tests and report every result.

Test: two-device revenue race, invoice shift attribution, paid-invoice void reversal, cross-midnight reconciliation, duplicate open-shift rejection, cloud lookup failure, and retry idempotency.

Review the diff and report exact files changed.

Stop Conditions

Stop before SQL if live schema/data differs from assumptions.

Stop if multiple existing open shifts are found and no safe resolution policy is approved.

Stop if cloud lookup still cannot distinguish unavailable from empty.

Noticed, Not Fixed Here

users versus staff\_users schema/code mismatch.

Offline-first sync and local-only payroll/deletion records.



