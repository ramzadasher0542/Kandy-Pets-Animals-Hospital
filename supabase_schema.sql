-- =============================================================================
-- CeylonPets VHMS — Supabase PostgreSQL Schema
-- =============================================================================
-- SPDX-License-Identifier: Apache-2.0
--
-- All column names use QUOTED camelCase to exactly match TypeScript interfaces.
-- This eliminates any need for field-name transformation in the sync engine.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. INVENTORY
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS inventory CASCADE;
CREATE TABLE inventory (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku"            TEXT NOT NULL DEFAULT '',
  "name"           TEXT NOT NULL DEFAULT '',
  "category"       TEXT NOT NULL DEFAULT 'retail',
  "price"          NUMERIC NOT NULL DEFAULT 0,
  "cost"           NUMERIC NOT NULL DEFAULT 0,
  "stock"          NUMERIC NOT NULL DEFAULT 0,
  "minStock"       NUMERIC NOT NULL DEFAULT 0,
  "unit"           TEXT NOT NULL DEFAULT 'unit',
  "location"       TEXT DEFAULT '',
  "labParameters"  JSONB DEFAULT '[]'::jsonb,
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"     BOOLEAN NOT NULL DEFAULT false,
  "_dirty"         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory ("updated_at");
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on inventory" ON inventory;
DROP POLICY IF EXISTS "Allow anon read access on inventory" ON inventory;
DROP POLICY IF EXISTS "Allow anon write access on inventory" ON inventory;
CREATE POLICY "Allow anon read access on inventory"
  ON inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on inventory"
  ON inventory FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 2. APPOINTMENTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS appointments CASCADE;
CREATE TABLE appointments (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "aptNumber"       TEXT DEFAULT '',
  "petName"         TEXT NOT NULL DEFAULT '',
  "petType"         TEXT NOT NULL DEFAULT 'Canine',
  "breed"           TEXT NOT NULL DEFAULT '',
  "weight"          NUMERIC DEFAULT 0,
  "sex"             TEXT DEFAULT 'Unknown',
  "ownerName"       TEXT NOT NULL DEFAULT '',
  "ownerPhone"      TEXT NOT NULL DEFAULT '',
  "alternatePhone"  TEXT DEFAULT '',
  "ownerEmail"      TEXT DEFAULT '',
  "address"         TEXT DEFAULT '',
  "date"            TEXT NOT NULL DEFAULT '',
  "time"            TEXT NOT NULL DEFAULT '',
  "veterinarian"    TEXT NOT NULL DEFAULT '',
  "reason"          TEXT NOT NULL DEFAULT '',
  "status"          TEXT NOT NULL DEFAULT 'booked',
  "admissionType"   TEXT DEFAULT 'OPD',
  "assignedVet"     TEXT DEFAULT '',
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_appointments_updated_at ON appointments ("updated_at");
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on appointments" ON appointments;
DROP POLICY IF EXISTS "Allow anon read access on appointments" ON appointments;
DROP POLICY IF EXISTS "Allow anon write access on appointments" ON appointments;
CREATE POLICY "Allow anon read access on appointments"
  ON appointments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on appointments"
  ON appointments FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 3. MEDICAL RECORDS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS medical_records CASCADE;
CREATE TABLE medical_records (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId"        TEXT NOT NULL DEFAULT '',
  "petName"          TEXT NOT NULL DEFAULT '',
  "petType"          TEXT NOT NULL DEFAULT 'Canine',
  "breed"            TEXT NOT NULL DEFAULT '',
  "age"              TEXT NOT NULL DEFAULT '',
  "weight"           NUMERIC NOT NULL DEFAULT 0,
  "sex"              TEXT DEFAULT 'Unknown',
  "ownerName"        TEXT NOT NULL DEFAULT '',
  "ownerPhone"       TEXT NOT NULL DEFAULT '',
  "ownerEmail"       TEXT DEFAULT '',
  "visitDate"        TEXT NOT NULL DEFAULT '',
  "vitals"           JSONB DEFAULT '{}'::jsonb,
  "patientHistory"   JSONB DEFAULT '{}'::jsonb,
  "physicalExam"     JSONB DEFAULT '{}'::jsonb,
  "assessment"       JSONB DEFAULT '{}'::jsonb,
  "diagnosticPlan"   JSONB DEFAULT '[]'::jsonb,
  "monitoringPlan"   JSONB DEFAULT '[]'::jsonb,
  "subjectiveTags"   JSONB DEFAULT '[]'::jsonb,
  "symptoms"         TEXT DEFAULT '',
  "objectiveFindings" JSONB DEFAULT '{}'::jsonb,
  "diagnosis"        TEXT DEFAULT '',
  "treatmentNotes"   TEXT DEFAULT '',
  "prescribedMeds"   JSONB DEFAULT '[]'::jsonb,
  "vaccinations"     JSONB DEFAULT '[]'::jsonb,
  "labResults"       JSONB DEFAULT '[]'::jsonb,
  "inpatientLogs"    JSONB DEFAULT '[]'::jsonb,
  "groomingRecords"  JSONB DEFAULT '[]'::jsonb,
  "boardingInfo"     JSONB DEFAULT NULL,
  "createdDate"      TEXT DEFAULT '',
  "attendingVet"     TEXT DEFAULT '',
  "appointmentId"    TEXT DEFAULT '',
  "followUpDate"     TEXT DEFAULT '',
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_medical_records_updated_at ON medical_records ("updated_at");
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on medical_records" ON medical_records;
DROP POLICY IF EXISTS "Allow anon read access on medical_records" ON medical_records;
DROP POLICY IF EXISTS "Allow anon write access on medical_records" ON medical_records;
CREATE POLICY "Allow anon read access on medical_records"
  ON medical_records FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on medical_records"
  ON medical_records FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 4. INVOICES
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS invoices CASCADE;
CREATE TABLE invoices (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "appointmentId"   TEXT DEFAULT '',
  "patientId"       TEXT NOT NULL DEFAULT '',
  "petName"         TEXT NOT NULL DEFAULT '',
  "ownerName"       TEXT NOT NULL DEFAULT '',
  "ownerPhone"      TEXT NOT NULL DEFAULT '',
  "date"            TEXT NOT NULL DEFAULT '',
  "items"           JSONB DEFAULT '[]'::jsonb,
  "subtotal"        NUMERIC NOT NULL DEFAULT 0,
  "tax"             NUMERIC NOT NULL DEFAULT 0,
  "discount"        NUMERIC NOT NULL DEFAULT 0,
  "sales_total"     NUMERIC NOT NULL DEFAULT 0,
  "cogs"            NUMERIC DEFAULT 0,
  "profit"          NUMERIC DEFAULT 0,
  "paymentMethod"   TEXT DEFAULT 'cash',
  "splitPayments"   JSONB DEFAULT '[]'::jsonb,
  "paymentStatus"   TEXT NOT NULL DEFAULT 'unpaid',
  "depositHeld"     NUMERIC DEFAULT 0,
  "createdBy"       TEXT NOT NULL DEFAULT '',
  "shiftId"         TEXT DEFAULT '',
  "notes"           TEXT DEFAULT '',
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices ("updated_at");
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anon read access on invoices" ON invoices;
DROP POLICY IF EXISTS "Allow anon write access on invoices" ON invoices;
CREATE POLICY "Allow anon read access on invoices"
  ON invoices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on invoices"
  ON invoices FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 5. CLIENTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clients CASCADE;
CREATE TABLE clients (
  "client_id"                TEXT PRIMARY KEY,
  "primary_phone"            TEXT NOT NULL DEFAULT '',
  "alternate_phone"          TEXT DEFAULT '',
  "full_name"                TEXT NOT NULL DEFAULT '',
  "email_address"            TEXT DEFAULT '',
  "physical_address"         TEXT DEFAULT '',
  "communication_preference" TEXT DEFAULT 'sms',
  "account_balance"          NUMERIC NOT NULL DEFAULT 0,
  "lifetime_value"           NUMERIC NOT NULL DEFAULT 0,
  "client_status"            TEXT NOT NULL DEFAULT 'active',
  "administrative_notes"     TEXT DEFAULT '',
  "created_at"               TIMESTAMPTZ DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"               BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients ("updated_at");
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on clients" ON clients;
DROP POLICY IF EXISTS "Allow anon read access on clients" ON clients;
DROP POLICY IF EXISTS "Allow anon write access on clients" ON clients;
CREATE POLICY "Allow anon read access on clients"
  ON clients FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on clients"
  ON clients FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 6. SHIFTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS shifts CASCADE;
CREATE TABLE shifts (
  "id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "openedBy"                   TEXT NOT NULL DEFAULT '',
  "startTime"                  TEXT NOT NULL DEFAULT '',
  "endTime"                    TEXT DEFAULT '',
  "openingFloatCents"          NUMERIC NOT NULL DEFAULT 0,
  "cashCollectedCents"         NUMERIC NOT NULL DEFAULT 0,
  "cardCollectedCents"         NUMERIC NOT NULL DEFAULT 0,
  "bankTransferCollectedCents" NUMERIC NOT NULL DEFAULT 0,
  "expectedCashCents"          NUMERIC DEFAULT 0,
  "actualCashCents"            NUMERIC DEFAULT 0,
  "discrepancyCents"           NUMERIC DEFAULT 0,
  "notes"                      TEXT DEFAULT '',
  "isOpen"                     BOOLEAN NOT NULL DEFAULT true,
  "opening_float"              NUMERIC NOT NULL DEFAULT 0,
  "actual_cash"                NUMERIC DEFAULT NULL,
  "discrepancy_reason"         TEXT DEFAULT '',
  "created_at"                 TIMESTAMPTZ DEFAULT now(),
  "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"                 BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_shifts_updated_at ON shifts ("updated_at");
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on shifts" ON shifts;
DROP POLICY IF EXISTS "Allow anon read access on shifts" ON shifts;
DROP POLICY IF EXISTS "Allow anon write access on shifts" ON shifts;
CREATE POLICY "Allow anon read access on shifts"
  ON shifts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on shifts"
  ON shifts FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 7. SYSTEM ALERTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS system_alerts CASCADE;
CREATE TABLE system_alerts (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "severity"   TEXT NOT NULL DEFAULT 'info',
  "category"   TEXT NOT NULL DEFAULT 'system',
  "message"    TEXT NOT NULL DEFAULT '',
  "timestamp"  TEXT DEFAULT '',
  "read"       BOOLEAN NOT NULL DEFAULT false,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "_dirty"     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_system_alerts_updated_at ON system_alerts ("updated_at");
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on system_alerts" ON system_alerts;
DROP POLICY IF EXISTS "Allow anon read access on system_alerts" ON system_alerts;
DROP POLICY IF EXISTS "Allow anon write access on system_alerts" ON system_alerts;
CREATE POLICY "Allow anon read access on system_alerts"
  ON system_alerts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on system_alerts"
  ON system_alerts FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 8. NOTIFICATIONS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petName"        TEXT DEFAULT '',
  "ownerName"      TEXT DEFAULT '',
  "recipient"      TEXT DEFAULT '',
  "type"           TEXT NOT NULL DEFAULT 'appointment_reminder',
  "channel"        TEXT NOT NULL DEFAULT 'sms',
  "message"        TEXT DEFAULT '',
  "scheduledTime"  TEXT DEFAULT '',
  "status"         TEXT NOT NULL DEFAULT 'queued',
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"     BOOLEAN NOT NULL DEFAULT false,
  "_dirty"         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON notifications ("updated_at");
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow anon read access on notifications" ON notifications;
DROP POLICY IF EXISTS "Allow anon write access on notifications" ON notifications;
CREATE POLICY "Allow anon read access on notifications"
  ON notifications FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on notifications"
  ON notifications FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 9. CLINIC QUEUE
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clinic_queue CASCADE;
CREATE TABLE clinic_queue (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"           TEXT NOT NULL DEFAULT '',
  "petName"         TEXT NOT NULL DEFAULT '',
  "ownerName"       TEXT NOT NULL DEFAULT '',
  "ownerPhone"      TEXT NOT NULL DEFAULT '',
  "appointmentId"   TEXT NOT NULL DEFAULT '',
  "serviceType"     TEXT NOT NULL DEFAULT '',
  "checkInTime"     TEXT NOT NULL DEFAULT '',
  "status"          TEXT NOT NULL DEFAULT 'active',
  "assignedVet"     TEXT DEFAULT '',
  "prescribedMeds"  JSONB DEFAULT '[]'::jsonb,
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_clinic_queue_updated_at ON clinic_queue ("updated_at");
ALTER TABLE clinic_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on clinic_queue" ON clinic_queue;
DROP POLICY IF EXISTS "Allow anon read access on clinic_queue" ON clinic_queue;
DROP POLICY IF EXISTS "Allow anon write access on clinic_queue" ON clinic_queue;
CREATE POLICY "Allow anon read access on clinic_queue"
  ON clinic_queue FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on clinic_queue"
  ON clinic_queue FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- ---------------------------------------------------------------------------
-- 10. STAFF USERS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS staff_users CASCADE;
CREATE TABLE staff_users (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"             TEXT NOT NULL DEFAULT '',
  "username"         TEXT NOT NULL DEFAULT '',
  "role"             TEXT NOT NULL DEFAULT 'veterinarian',
  "avatarColor"      TEXT NOT NULL DEFAULT '',
  "pin"              TEXT DEFAULT '',
  "rolePermissions"  JSONB DEFAULT '{}'::jsonb,
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_staff_users_updated_at ON staff_users ("updated_at");
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on staff_users" ON staff_users;
DROP POLICY IF EXISTS "Allow anon read access on staff_users" ON staff_users;
DROP POLICY IF EXISTS "Allow anon write access on staff_users" ON staff_users;
CREATE POLICY "Allow anon read access on staff_users"
  ON staff_users FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon write access on staff_users"
  ON staff_users FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = 'cpets_sync_7f3a9b2e1d4c5f8e0a6b3d7c9e1f4a2b');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
