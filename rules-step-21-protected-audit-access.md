Step 21 Rules: Protected Deletion Audit Access

Mission

Make the new deletion\_audit table usable without exposing sensitive audit history through the public Supabase anon key. Establish whether the app can maintain a real authenticated Supabase session, then wire protected audit reads/writes only if that access path is proven.



Required Access

Supabase MCP is required.

Intended live project: cjpmsjjluqlfcyzuspni.

Use authenticated access for audit data whenever possible.

Do not add a broad anon SELECT or INSERT policy for deletion\_audit.

Do not touch kpah-dev.

Vercel is the deployment target. Ignore Cloudflare.

Staff/payroll writers remain frozen.

First Decision: Do Not Guess

Inspect the actual login flow, signInWithPassword, Supabase auth state listeners, current user/session behavior and the roles used by normal reads.

Confirm whether a normal signed-in operator has a persistent Supabase Auth session while using ReportsManager.

Inspect live grants and RLS for deletion\_audit.

If no safe authenticated session exists, stop before changing policies or app code and report the smallest product decision needed. Do not fall back to anon access.

If Authenticated Access Is Proven

Add only the minimum authenticated policies needed for deletion-audit reads and inserts.

Keep RLS enabled and preserve the no-anon posture.

Add focused Supabase helpers in src/lib/db.ts for reading and writing deletion audit rows.

Change writeDeletionAudit in src/App.tsx to use the cloud helper instead of db.deletionAudit.

Do not add an IndexedDB fallback or a false "saved locally" warning.

Preserve the current audit payload and deletion behavior.

Do not migrate ReportsManager, payslips or shift reconciliation in this task.

If Authenticated Access Is Not Proven

Make no RLS policy change.

Make no deletion-audit writer/reader change.

Report that the table remains intentionally deny-by-default and that authentication must be resolved first.

Security Constraints

Never grant PUBLIC.

Never accept the legacy placeholder sync-secret policy.

Do not treat a local four-digit PIN as proof of a Supabase Auth session.

Do not expose audit history to anon merely because other existing tables are already over-permissive.

Do not broaden RLS across unrelated tables in this step.

Verification

Verify the live session/auth posture and policies through Supabase MCP.

Do not insert live test audit rows.

Run npx tsc --noEmit and npm run build if code changes are made.

Run npx playwright test tests/example.spec.ts if code changes are made.

Report the known F2/F3 baseline without repairing it.

Review the diff, commit only intended files and push to main.

State clearly whether protected audit access was implemented or whether the task stopped at the authentication decision.



