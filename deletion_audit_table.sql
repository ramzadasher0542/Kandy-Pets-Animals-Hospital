-- Step 20A: create the missing public.deletion_audit table in the live project.
--
-- Schema-and-access reconciliation ONLY. ReportsManager is NOT changed here and
-- still reads deletion audits from IndexedDB; payslips are deliberately not
-- created (staff/payroll frozen).
--
-- ACCESS POSTURE — SAFE NO-READ:
-- The app reads its entire data plane through the anon key (every other table,
-- including users/clients/medical_records, is `SELECT ... TO anon USING (true)`).
-- Deletion-audit history is sensitive, so this table is created with RLS ENABLED
-- and NO anon/authenticated policy: by default that denies all row access to the
-- app roles (service_role bypasses RLS for admin/backup). The legacy
-- x-sync-secret='__SYNC_SECRET_PLACEHOLDER__' policy from the repo schema is
-- intentionally NOT applied. A read policy is deferred to a later step, once the
-- Supabase auth model for ReportsManager reads is decided (authenticated-only
-- read vs. accepting anon exposure). No DROP/DELETE/TRUNCATE, no PUBLIC grant.

CREATE TABLE IF NOT EXISTS public.deletion_audit (
  "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type"        text NOT NULL,
  "entity_id"          text NOT NULL,
  "entity_name"        text DEFAULT '',
  "deleted_by"         text NOT NULL,
  "deleted_at"         text NOT NULL,
  "had_history"        boolean DEFAULT false,
  "history_summary"    text DEFAULT '',
  "override_confirmed" boolean DEFAULT false,
  "created_at"         timestamptz DEFAULT now(),
  "updated_at"         timestamptz NOT NULL DEFAULT now(),
  "is_deleted"         boolean NOT NULL DEFAULT false,
  "_dirty"             boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_deletion_audit_updated_at
  ON public.deletion_audit ("updated_at");

ALTER TABLE public.deletion_audit ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no anon/authenticated policy is created (safe no-read).
-- Never expose to PUBLIC.
REVOKE ALL ON TABLE public.deletion_audit FROM PUBLIC;
