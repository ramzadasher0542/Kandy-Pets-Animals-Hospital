# Go-Live Progress

Last verified: 2026-08-07

Guidance state: synced to the latest GitHub `main` checkout.

Last deployed application-code commit: `c2507f7`

Live deployment: `https://kpah-aps.vercel.app/`

## Agent Gate

- Required code/SQL model: **Claude Opus 4.8**.
- Required live database tool: **Supabase MCP ON**.
- Current coordinator: **GPT-5.6-luna**.
- Current worker status: **Supabase MCP unavailable**, so live SQL/RLS/PITR proof remains blocked.

## Accepted

- [x] Workspace synced to GitHub `main`.
- [x] Checkout retry protection is present.
- [x] Reconciliation blocks failed cloud invoice and adjustment loads.
- [x] Restore is honestly marked unavailable instead of reporting false success.
- [x] Latest Vercel deployment completed successfully.
- [x] Live root login and shift screen were read-only verified.

## Not Accepted Yet

- [ ] Independent local typecheck and build run.
- [ ] Live RLS and RPC permission proof.
- [ ] Keerthi login and action-permission proof.
- [ ] Supabase backup/PITR recovery proof.
- [ ] Isolated disposable end-to-end pilot.
- [ ] Zero-residue proof after the pilot.

## Current Decision

`NOT READY FOR REAL CLINIC DATA`

The code safety fixes are deployed. The remaining blockers are operational proof, especially recovery and the disposable pilot. Do not enter real clinic data until the Step 31 acceptance matrix is complete.

## One Next Action

Run `STEP_31_PROMPT.md` with live database inspection access and stop at the first blocked acceptance item.
