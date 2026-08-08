Step 31 Rules: Security and Production Acceptance
Agent Gate
Code/SQL agent: Claude Opus 4.8 only.
Live database tool: Supabase MCP ON and connected to cjpmsjjluqlfcyzuspni.
Browser: authenticated production browser, read-only unless explicitly required for a dashboard setting.
GitHub: authenticated checkout of ramzadasher0542/Kandy-Pets-Animals-Hospital, branch main.
If the model or MCP requirement is missing, status is BLOCKED. Stop.
Mission
Make an evidence-based go-live decision for Ceylon Pets. The application is currently a deployed demo, not a safe clinic-data system.

Known Production Findings
GitHub head verified: 862b2c9.
Vercel deployment is successful.
Supabase plan is FREE; no scheduled backups; PITR requires Pro.
Live audit: 63 permissive public policies.
Live audit: anon has all seven table privileges on all 22 public tables.
Live audit: wipe_all_tables() is executable by PUBLIC, anon, and authenticated.
src/lib/db.ts:915-922 calls the destructive RPC from browser code.
src/lib/requireAuth.ts:246+ is UI authorization, not database authorization.
Repository schema and live schema are drifted; repository policy blocks are at supabase_schema.sql:35-756 and bootstrap_schema.sql:52-706.
Hard Safety Rules
Never wipe, purge, truncate, bulk-delete, or bulk-update data.
Never test with real clinic records.
Never use a browser PIN, custom header, local role, or UI prompt as the database security boundary.
Never grant anon access to clinic tables or privileged RPCs.
Never leave wipe_all_tables() callable by PUBLIC, anon, or authenticated.
Never claim RLS is fixed without returned live pg_policies evidence.
Never claim recovery is ready without a successful restore-to-new-project test.
Never pilot against production while an existing open shift or real clinic state exists.
If a required fact is unknown, report BLOCKED; do not infer it.
Required File Changes
Create supabase/migrations/20260807_security_hardening.sql.
Modify supabase_schema.sql:35-756 and bootstrap_schema.sql:52-706 to remove anonymous policy blocks and add verified auth-scoped policies.
Modify shift_accounting_rpc.sql:304-308 to remove anonymous execution grants and enforce the actor server-side.
Modify src/lib/db.ts:915-922 to remove the browser-callable cloud wipe.
Modify src/components/SystemSettings.tsx:1035-1077 to remove or disable Erase Cloud + Local.
Review src/lib/requireAuth.ts:52-63, 246+ and src/App.tsx; retain UI checks only as secondary controls and connect data access to real Supabase Auth.
Create tests/sql/step31_security_boundary.test.sql.
Fix or explicitly report the existing tests/cv1-close-visit.spec.ts Test A failure; do not weaken it.
Update GO_LIVE_PROGRESS.md only with evidence-backed results.
Do not add prompts or rules to the repository. They are delivered only under outputs/.
Required Order
Verify commit, working tree, deployment, typecheck, and build.
Run read-only live audits of RLS, table grants, function grants, SECURITY DEFINER functions, auth/staff schema, and backups.
Record the live baseline.
Apply permission containment. A temporary offline data plane is safer than public writes.
Implement real Auth/RLS/RPC enforcement.
Run negative security SQL tests and application tests.
Enable and verify recovery.
Synchronize kpah-dev and run the synthetic isolated pilot.
Re-run all acceptance checks and report.
Acceptance Matrix
Public anon data access removed: PASS / FAIL / BLOCKED
Destructive RPC inaccessible to anon/authenticated: PASS / FAIL / BLOCKED
Auth-scoped RLS verified live: PASS / FAIL / BLOCKED
Accounting RPC actor enforcement verified: PASS / FAIL / BLOCKED
Checkout retry idempotent: PASS / FAIL / BLOCKED
Invoice void reverses stock/revenue once: PASS / FAIL / BLOCKED
Close guard blocks incomplete cloud loads: PASS / FAIL / BLOCKED
Keerthi role and permissions verified: PASS / FAIL / BLOCKED
Recovery restore verified: PASS / FAIL / BLOCKED
Isolated staging pilot leaves zero residue: PASS / FAIL / BLOCKED
Focused Playwright Test A: PASS / FAIL / BLOCKED
Focused Playwright Test B: PASS / FAIL / BLOCKED
Final Status Rules
READY requires every acceptance item to be PASS.
Any security, recovery, staging, or data-integrity failure means NOT READY.
Missing MCP, missing access, unknown schema, or missing evidence means BLOCKED.
Final report must include exact commands, commit, deployment, SQL results, tests, changed files, and data-mutation statement.
