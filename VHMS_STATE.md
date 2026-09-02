# VHMS Migration State

## Migration Status

- Current phase: Phase 11 Tenant Staff RBAC and Clinic Entitlements implemented; production database migration applied; frontend deployed and smoke-verified
- Backup phase: skipped; code and SQL backups are already secured locally
- Last completed phase: Phase 11 Tenant Staff RBAC and Clinic Entitlements
- Next pending step: Complete the remaining controlled-beta gates: independent recovery rehearsal, approved boarding rates, credential rotation, synthetic-data quarantine approval, and the owner/manager Settings positive-path smoke test.

## Current Database Structure

- Supabase project: Kandy-Pets-Animals-Hospital
- Scope: `public` application schema
- Tables: 29
- Columns: 485 total, including 447 original columns, 27 new nullable `clinic_id` columns, 5 `public.clinics` columns, `public.users.is_superadmin`, and 5 `public.clinic_settings` columns
- Constraints: 73 total, including 29 primary keys, 36 foreign keys, 6 checks, and 2 unique constraints
- RLS policies: 109 total in the last catalogued production snapshot; the 2026-09-02 control-plane migration replaced all policies on `system_config`, `clinics`, and `users` with explicit read and Super Admin-only write boundaries
- RLS status: enabled on all 29 public tables; force RLS is disabled on all 29
- Clinic isolation: authenticated access to tenant-owned application data is intersected with `clinic_id = public.current_clinic_id() OR public.is_current_user_superadmin()`; the control-plane tables use dedicated Super Admin write policies and clinic-or-Super-Admin read policies
- Security helpers: `public.current_clinic_id()` and `public.is_current_user_superadmin()` exist as stable security-definer functions with execute granted to `authenticated`
- Control-plane RLS: `system_config`, `users`, and `clinics` legacy tenant-write policies were replaced by Super Admin-only insert/update policies; `users` also has owner/manager insert/update policies constrained to the actor's clinic and non-superadmin records. Active staff retain only the reads required for application operation. `clinic_settings` remains readable by the assigned clinic or Super Admin and writable only by Super Admin.
- Control-plane migration: `supabase/migrations/20260902_superadmin_control_plane.sql` was applied to production on 2026-09-02 after a live schema preflight found no missing required columns or functions. The migration returned success with 0 rows and changed policies/grants only; no application rows were deleted.
- Control-plane verification: `tests/sql/step33_superadmin_control_plane.test.sql` was executed in the production SQL Editor and returned success with 0 rows, confirming the helper, Super Admin-only writes, closed destructive grants, and removal of legacy tenant write policies.
- Frontend auth state: root React `currentUser` now includes mapped `clinicId`, `isSuperadmin`, and clinic-local `clinicSettings` with panel entitlements; values are held in memory only and are not persisted to browser storage
- Sequences: none in `public`
- Existing `clinic_id` columns: present on all 27 original public application tables; all are nullable and reference `public.clinics(id)`
- Existing `public.clinics` table: present with `id uuid primary key default gen_random_uuid()`, `name text not null`, nullable `address text`, nullable `phone text`, and `created_at timestamptz not null default now()`
- Existing `public.clinic_settings` table: present with `clinic_id uuid primary key` referencing `public.clinics(id)` with cascade delete; `tax_enabled`, `grooming_enabled`, and `boarding_enabled` are non-null booleans defaulting to `true`; `enabled_panels jsonb` is non-null with the 15-panel default
- Existing data backfill: one `Kandy Pets Animals Hospital` clinic was inserted; three users were assigned to it; `ramzadasher0542@gmail.com` was marked as the single active superadmin and intentionally remains clinic-less
- Recovery reset function: `public.purge_application_data_auth()` is `SECURITY DEFINER`, executable by `authenticated` users only, provider-only, and deletes only rows with the assigned clinic_id; `public.users` and `public.clinics` rows are preserved.
- Recovery reset grants: `authenticated` can select `public.users(clinic_id, is_superadmin)` and `public.clinics`; production `/superadmin` auth hydration was verified after these grants.

## Public Tables

`appointments`, `auth_audit`, `boarding_records`, `cash_adjustments`, `clients`, `clinic_queue`, `clinic_settings`, `deletion_audit`, `grooming_logs`, `inventory`, `inventory_batches`, `inventory_categories`, `invoices`, `lab_results`, `medical_records`, `notifications`, `payslips`, `pets`, `schedule_entries`, `shift_reconciliations`, `shifts`, `staff_profiles`, `suppliers`, `system_alerts`, `system_config`, `time_entries`, `users`, `vaccinations`

## Phase List

1. Phase 1: Database Foundation. Create `clinics` with UUID primary key, name, address, phone, and created_at; add `clinic_id` UUID foreign keys to every existing public application table.
2. Phase 2: Security and Isolation. Enable RLS on all tables and apply strict authenticated-user clinic isolation policies.
3. Phase 3: Frontend Auth and State. Fetch the authenticated user's clinic assignment and store it in global application state.
4. Phase 4: Write Operations Refactor. Add the stored clinic_id to all frontend create and insert payloads.
5. Phase 4.5: Data Migration and Superadmin DB Override. Create the legacy clinic, assign orphaned users, add the superadmin flag/helper, and extend clinic RLS policies with a secure superadmin escape hatch.
6. Phase 5: Customization Toggles. Create `clinic_settings` and conditionally render modules from its settings.
7. Phase 6: RBAC/UI Refactor. Restrict navigation, make the dashboard operational-only, separate executive report tabs, and keep drawer reconciliation in Shift & Drawer.
8. Phase 7: Production clinic onboarding and hydration hardening. Complete the legacy clinic backfill, preserve the clinic-less superadmin, and keep client hydration read-only.
9. Phase 8: Synthetic Data Quarantine. Remove synthetic clinical, inventory, financial, operational, and audit records before client handoff.
10. Phase 9: Performance Indexes. Add targeted indexes for clinic-scoped access and common operational queries.
11. Phase 10: Auth Bootstrap and Super Admin Control Plane. Resolve the Supabase session before mounting React, eliminate duplicate startup session ownership, and enforce global configuration/tenant registry writes at the database boundary.
12. Phase 11: Tenant Staff RBAC and Clinic Entitlements. Keep tenant staff writes clinic-scoped, move business identity and product entitlements into the Super Admin control plane, and gate tenant navigation from persisted clinic settings.

## Change Log

- Initialized this state file before starting the migration.
- Phase 1 applied in Supabase: created `public.clinics` and added nullable `clinic_id uuid` plus a named foreign key to each original public application table.
- Phase 1 verified from `information_schema` and `pg_catalog`: one clinics table, 27 clinic_id columns, and 27 clinic_id foreign keys.
- Phase 2 applied in Supabase: created `public.current_clinic_id()`, enabled RLS on all 28 public tables, and added strict authenticated clinic-isolation policies without changing the existing role-based policies.
- Phase 2 verified from `pg_catalog` and `pg_policies`: 0 public tables without RLS, 27 restrictive clinic-isolation policies, 1 clinics access policy, 107 total policies, and 0 forced-RLS tables.
- Phase 3 applied in `src/lib/auth.ts`, `src/types.ts`, and `src/App.tsx`: authenticated staff lookup now selects and maps `clinic_id`; root React auth state retains `currentUser.clinicId`; session restore and sign-in reject staff without a clinic assignment and sign out fail-closed.
- Phase 3 verification by source inspection passed for the clinic_id select, mapping, root state, session restore, auth-event, and login guards.
- Phase 4 applied in `src/lib/db.ts`, `src/App.tsx`, and `src/components/ShiftManager.tsx`: the authenticated clinic is held in an in-memory write context; every frontend insert/upsert payload, restore payload, and create-capable JSON RPC payload receives the current `clinic_id`; the direct shift insert now uses the shared write helper.
- Phase 4 verification by source inspection passed: all 30 frontend `.insert()` / `.upsert()` call sites use `withCurrentClinicId`; checkout, boarding-ledger, and shift-reconciliation RPC creation payloads include the clinic scope; no direct frontend insert remains outside `src/lib/db.ts`.
- Phase 4 database support applied in `close_shift_and_reconcile_rpc.sql` and Supabase: `public.close_shift_and_reconcile` now validates the JSON clinic scope and inserts `clinic_id` on `shift_reconciliations`; live definition was re-queried successfully.
- `npx tsc --noEmit` could not run because this worker has no Node, npm, or npx executable.
- No database structure or data backfill was changed in Phase 4.
- Phase 4.5 applied in Supabase: added `public.users.is_superadmin`, created the security-definer `public.is_current_user_superadmin()` helper, inserted the legacy Kandy clinic, assigned the three non-superadmin users to it, marked `ramzadasher0542@gmail.com` as the single superadmin, and replaced the 27 clinic-isolation policies plus the clinics policy with clinic-or-superadmin rules.
- Phase 4.5 verification passed: 1 Kandy clinic, 1 superadmin, 3 users in Kandy, 1 intentionally clinic-less user, 1 superadmin helper, 27 isolation policies with the override, and 1 clinics policy with the override.
- Phase 5 frontend work applied locally: `is_superadmin` is mapped into auth state; clinic-less superadmins route to an isolated `/superadmin` control plane; tenant feature flags gate grooming, boarding, and tax; standard settings were reduced to profile, inventory, and staff; boarding and grooming rates were moved into their feature modules.
- Phase 5 applied in Supabase from `supabase/migrations/20260824_clinic_settings.sql`: created `public.clinic_settings`, enabled RLS, added clinic-or-superadmin read access, added superadmin-only writes, granted authenticated table privileges, and seeded one settings row per existing clinic.
- Phase 5 live verification passed: `public.clinic_settings` has exactly 4 expected columns (`clinic_id uuid`, plus three non-null boolean flags defaulting to `true`) and exactly 2 expected policies (`clinic_settings_read` and `clinic_settings_superadmin_write`).
- Phase 5 frontend and database work is now recorded as complete. `npx tsc --noEmit` remains unavailable because this worker has no Node, npm, or npx executable.
- Phase 6 Step 1 applied in `src/App.tsx`: Reports and Settings are explicitly denied to veterinarians, receptionists (`cashier`), and grooming staff; owners and managers retain Settings access; application roots retain access.
- Phase 6 Step 2 applied in `src/components/DashboardAnalytics.tsx` and `src/App.tsx`: the dashboard is now operational-only, showing floor traffic, appointments, alerts, staff schedule, and live queue; revenue, cash-drawer, and weekly-finance widgets and their data reads were removed.
- Phase 6 Step 3 applied in `src/components/ReportsManager.tsx` and `src/App.tsx`: Reports now has Financials, Clinical Volume, and Audit & Compliance tabs; it retains only invoice, appointment, client, and deletion-audit reads, with financial metrics kept out of clinical volume.
- Phase 6 Step 4 applied in `src/components/ReportsManager.tsx` and `src/App.tsx`: duplicate vault, cash-adjustment, shift-reconciliation, and Z-Report surfaces were removed from Reports; ShiftManager remains the single Shift & Drawer owner, and veterinarians/groomers cannot access that view.
- Phase 6 verification fix applied in `src/App.tsx`: Shift & Drawer is now hard-blocked and removed from default permissions for receptionists (`cashier`) as well as veterinarians and groomers, matching the final Phase 6 route policy.
- Phase 6 verification hardening applied in `src/App.tsx`: denied persisted/deep-linked views render nothing synchronously until the permitted default view is restored; the POS Shift & Drawer shortcut also checks the same guard.
- Phase 6 source verification passed by direct source inspection: Reports, Settings, and Shift & Drawer are blocked for cashier, veterinarian, and groomer roles; DashboardAnalytics contains no gross revenue/profit variables; ReportsManager contains no cash-adjustment or Z-Report components.

- Post-merge recovery Step 2 applied in Supabase: granted `authenticated` SELECT on `public.users(clinic_id, is_superadmin)` and `public.clinics`; production `/superadmin` hydration was verified.
- Post-merge recovery Step 3 applied in `supabase/migrations/20260827_tenant_scoped_purge.sql` and Supabase: replaced the unscoped public-table `TRUNCATE` with provider-authorized, clinic-scoped deletes ordered by foreign-key ancestry; no destructive reset call was run against production data.
- Post-merge recovery Step 4 applied in `src/components/SystemSettings.tsx`: reset warnings now state the signed-in provider clinic scope, preserved clinic/login records, and active-provider authorization.

- Phase 7 fully complete in Supabase and production: the legacy Kandy clinic backfill was verified with 0 orphaned application rows and 1 intentionally clinic-less superadmin preserved.
- Phase 8 executed in Supabase: hard-deleted 5 synthetic pets, 5 clients, 7 appointments, 5 medical records, 3 lab results, 2 vaccinations, 4 grooming logs, 5 boarding records, 9 clinic-queue records, 23 invoices, 6 cash adjustments, 8 shift reconciliations, 8 shifts, 3 inventory batches, 4 inventory items, 2 suppliers, and 2 synthetic deletion-audit records.
- Phase 8 verification passed: all targeted synthetic markers returned 0 rows; clinic financial baseline is 0 invoices, 0 sales, 0 tax, 0 COGS, and 0 profit; clinical baseline is 0 appointments, pets, medical records, lab results, vaccinations, grooming logs, and boarding records, with 1 baseline client retained. Application user/access rows and clinic configuration were preserved.
- Phase 9 migration `supabase/migrations/20260828_phase9_performance_indexes.sql` is present in the repository for the clinic-scoped performance baseline, including the `system_config` clinic index.
- Phase 10 frontend authorization hardening applied locally in `src/App.tsx`, `src/lib/auth.ts`, `src/lib/db.ts`, `src/lib/requireAuth.ts`, and `src/components/SystemSettings.tsx`: the browser gate is Super Admin-only, global configuration writes require the immutable Super Admin identity, clinic-scoped writes continue to use the in-memory authenticated clinic, and stale auth/hydration requests cannot restore a signed-out session.
- Phase 10 Super Admin control plane is implemented in `src/components/SuperAdminDashboard.tsx` and `src/components/SuperAdminLayout.tsx`: the existing dashboard loads all registered clinics and their `clinic_settings`, and instantly persists Tax, Grooming Salon, and Boarding/Hotel toggles with optimistic rollback on failure. Tenant `SystemSettings.tsx` was not rebuilt or duplicated.
- Phase 10 session race correction applied in `src/main.tsx` and `src/App.tsx`: `main.tsx` awaits `getAuthSession()` before calling `createRoot`; `App` consumes the resolved `Session`, maps it through `fetchStaffForSession`, and no longer performs a competing startup `getAuthSession()` call. Later `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, and `USER_UPDATED` events remain owned by the single App auth state machine. The development `__KP_TEST_AUTH__` fixture remains supported without waiting for Supabase.
- Phase 10 source review completed without Node execution, per the worker directive. Automated `npx tsc --noEmit` remained unavailable because this worker has no Node, npm, or npx executable. The production SQL preflight, migration execution, read-only control-plane test, and pre-deployment live admin/cashier smoke checks passed.
- Phase 10 release commit was created locally as `db9e9b0` (`fix: stabilize auth bootstrap and superadmin control plane`). Direct CLI push was unavailable because this worker had no GitHub credential or `gh` executable; the same intended files were committed to the authenticated `main` branch through GitHub's web flow, with temporary transport files removed and exact case-sensitive paths verified.
- Phase 10 production deployment completed on Vercel project `kpah-aps`: the implementation revision `4850781` (`chore: remove verification transport file`) deployed successfully, and the subsequent state/documentation cleanup revisions on `main` also deployed successfully with status `Ready`; production domain remains `https://kpah-aps.vercel.app/`.
- Phase 10 post-deployment smoke passed by browser inspection: the deployed app first showed `CeylonPets Vault / Hydrating Clinical Matrices...`, then restored the Super Admin control plane; Tax, Grooming Salon, and Boarding / Hotel toggles were present and enabled without changing production values. A fresh cashier session restored POS with `CLOUD SYNC ACTIVE`, and Settings was absent.
- Phase 11 migration `supabase/migrations/20260902183121_tenant_users_rbac_and_clinic_entitlements.sql` was applied in the authenticated production SQL Editor on 2026-09-02; it returned success with 0 rows and changed the `clinic_settings.enabled_panels` schema plus the four intended `users` write policies without deleting application rows.
- Phase 11 verification returned 6 rows: `enabled_panels` is non-null JSONB with the 15-panel default; the Kandy clinic has all 15 panels enabled; and `users_superadmin_insert`, `users_superadmin_update`, `users_tenant_insert`, and `users_tenant_update` have the expected policies.
- Phase 11 frontend refactor was committed locally as `255a32b`; because direct GitHub push credentials were unavailable, equivalent authenticated GitHub web commits landed on `main` as `2984c47`, `fc7705b`, `5472774`, and `e79d0e3`.
- Phase 11 production deployment is `Ready` on Vercel commit `e79d0e3` (`db: add tenant entitlements and staff RLS`), with deployment URL `https://kpah-7t6hexeoj-asher-sajahan-s-projects.vercel.app/` and production domain `https://kpah-aps.vercel.app/`.
- Phase 11 post-deployment smoke passed by browser inspection: Super Admin loaded one clinic with Business Information, 3 feature flags, and 15/15 VHMS panels; the supplied cashier session loaded POS with `CLOUD SYNC ACTIVE`; and direct `/settings` access for cashier rendered POS without exposing Settings. The positive owner/manager Settings path remains untested because no such live test credentials were provided.

## Next Action

Keep strict `clinic_id` filtering for all database queries and preserve the deployed Phase 10 revision. Before real clinic use, complete the independent backup recovery rehearsal, configure approved boarding rates, rotate any temporary/shared administrator credential, and obtain explicit approval to remove or quarantine remaining synthetic QA rows. Keep the beta warnings from `GO_LIVE_PROGRESS.md` active.
