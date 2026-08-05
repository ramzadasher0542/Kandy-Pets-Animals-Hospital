-- =============================================================================
-- CeylonPets VHMS — BOOTSTRAP SCHEMA (single-shot, for a NEW hospital)
-- =============================================================================
-- SPDX-License-Identifier: Apache-2.0
--
-- Run this ONCE against a brand-new, EMPTY Supabase project.
-- It is the consolidated FINAL shape of all 23 tables — not the incremental
-- ALTER history in supabase_schema.sql (which stays as the historical record
-- for the original Kandy Pets installation and must NOT be run for new sites).
--
-- ⚠️  DESTRUCTIVE: every table starts with DROP TABLE IF EXISTS ... CASCADE.
--     NEVER run this against a project that holds real data.
--
-- CONVENTION (enforced, not aspirational):
--   Every column is QUOTED camelCase matching the TypeScript interfaces in
--   src/types.ts EXACTLY. The sync engine performs NO field-name translation —
--   it pushes/pulls raw objects. Any snake_case column here would silently
--   break sync for that field forever (PostgREST rejects the unknown column,
--   syncEngine logs and swallows the error, the row never leaves the till).
--   Snake_case is used ONLY where the TS interface itself uses it
--   (e.g. clients.client_id, sales_total, created_at, updated_at, is_deleted).
--
-- BEFORE RUNNING: replace every __SYNC_SECRET_PLACEHOLDER__ with this
-- deployment's unique sync secret (openssl rand -hex 32). See ONBOARDING.md.
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
  "expiryDate"     TEXT DEFAULT NULL,
  "lotNumber"      TEXT DEFAULT NULL,
  "created_at"     TIMESTAMPTZ DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"     BOOLEAN NOT NULL DEFAULT false,
  "_dirty"         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory ("updated_at");
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on inventory"
  ON inventory FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 2. APPOINTMENTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS appointments CASCADE;
CREATE TABLE appointments (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "aptNumber"                 TEXT DEFAULT '',
  "petName"                   TEXT NOT NULL DEFAULT '',
  "petType"                   TEXT NOT NULL DEFAULT 'Canine',
  "breed"                     TEXT NOT NULL DEFAULT '',
  "weight"                    NUMERIC DEFAULT 0,
  "sex"                       TEXT DEFAULT 'Unknown',
  "age"                       TEXT DEFAULT '',
  "ownerName"                 TEXT NOT NULL DEFAULT '',
  "ownerPhone"                TEXT NOT NULL DEFAULT '',
  "alternatePhone"            TEXT DEFAULT '',
  "ownerEmail"                TEXT DEFAULT '',
  "address"                   TEXT DEFAULT '',
  "date"                      TEXT NOT NULL DEFAULT '',
  "time"                      TEXT NOT NULL DEFAULT '',
  "veterinarian"              TEXT NOT NULL DEFAULT '',
  "reason"                    TEXT NOT NULL DEFAULT '',
  "status"                    TEXT NOT NULL DEFAULT 'booked',
  "urgency"                   TEXT DEFAULT 'routine',
  "emergencyBackfillRequired" BOOLEAN DEFAULT false,
  "admissionType"             TEXT DEFAULT 'OPD',
  "assignedVet"               TEXT DEFAULT '',
  "surgeryChecklist"          JSONB DEFAULT NULL,
  "created_at"                TIMESTAMPTZ DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"                BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_appointments_updated_at ON appointments ("updated_at");
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on appointments"
  ON appointments FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 3. MEDICAL RECORDS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS medical_records CASCADE;
CREATE TABLE medical_records (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "patientId"         TEXT NOT NULL DEFAULT '',
  "petName"           TEXT NOT NULL DEFAULT '',
  "petType"           TEXT NOT NULL DEFAULT 'Canine',
  "breed"             TEXT NOT NULL DEFAULT '',
  "age"               TEXT NOT NULL DEFAULT '',
  "weight"            NUMERIC NOT NULL DEFAULT 0,
  "sex"               TEXT DEFAULT 'Unknown',
  "ownerName"         TEXT NOT NULL DEFAULT '',
  "ownerPhone"        TEXT NOT NULL DEFAULT '',
  "ownerEmail"        TEXT DEFAULT '',
  "visitDate"         TEXT NOT NULL DEFAULT '',
  "vitals"            JSONB DEFAULT '{}'::jsonb,
  "patientHistory"    JSONB DEFAULT '{}'::jsonb,
  "physicalExam"      JSONB DEFAULT '{}'::jsonb,
  "assessment"        JSONB DEFAULT '{}'::jsonb,
  "diagnosticPlan"    JSONB DEFAULT '[]'::jsonb,
  "monitoringPlan"    JSONB DEFAULT '[]'::jsonb,
  "subjectiveTags"    JSONB DEFAULT '[]'::jsonb,
  "symptoms"          TEXT DEFAULT '',
  "objectiveFindings" JSONB DEFAULT '{}'::jsonb,
  "diagnosis"         TEXT DEFAULT '',
  "treatmentNotes"    TEXT DEFAULT '',
  "prescribedMeds"    JSONB DEFAULT '[]'::jsonb,
  "vaccinations"      JSONB DEFAULT '[]'::jsonb,
  "labResults"        JSONB DEFAULT '[]'::jsonb,
  "inpatientLogs"     JSONB DEFAULT '[]'::jsonb,
  "groomingRecords"   JSONB DEFAULT '[]'::jsonb,
  "boardingInfo"      JSONB DEFAULT NULL,
  "createdDate"       TEXT DEFAULT '',
  "attendingVet"      TEXT DEFAULT '',
  "appointmentId"     TEXT DEFAULT '',
  "followUpDate"      TEXT DEFAULT '',
  "created_at"        TIMESTAMPTZ DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"        BOOLEAN NOT NULL DEFAULT false,
  "_dirty"            BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_medical_records_updated_at ON medical_records ("updated_at");
ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on medical_records"
  ON medical_records FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 4. INVOICES
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS invoices CASCADE;
CREATE TABLE invoices (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "appointmentId" TEXT DEFAULT '',
  "patientId"     TEXT NOT NULL DEFAULT '',
  "petName"       TEXT NOT NULL DEFAULT '',
  "ownerName"     TEXT NOT NULL DEFAULT '',
  "ownerPhone"    TEXT NOT NULL DEFAULT '',
  "date"          TEXT NOT NULL DEFAULT '',
  "items"         JSONB DEFAULT '[]'::jsonb,
  "subtotal"      NUMERIC NOT NULL DEFAULT 0,
  "tax"           NUMERIC NOT NULL DEFAULT 0,
  "discount"      NUMERIC NOT NULL DEFAULT 0,
  "sales_total"   NUMERIC NOT NULL DEFAULT 0,
  "cogs"          NUMERIC DEFAULT 0,
  "profit"        NUMERIC DEFAULT 0,
  "paymentMethod" TEXT DEFAULT 'cash',
  "splitPayments" JSONB DEFAULT '[]'::jsonb,
  "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
  "depositHeld"   NUMERIC DEFAULT 0,
  "createdBy"     TEXT NOT NULL DEFAULT '',
  "shiftId"       TEXT DEFAULT '',
  "notes"         TEXT DEFAULT '',
  "created_at"    TIMESTAMPTZ DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"    BOOLEAN NOT NULL DEFAULT false,
  "_dirty"        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices ("updated_at");
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on invoices"
  ON invoices FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 5. CLIENTS  (client_id / snake_case fields are camelCase-exact to the TS type)
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
  "petIds"                   JSONB DEFAULT '[]'::jsonb,
  "created_at"               TIMESTAMPTZ DEFAULT now(),
  "updated_at"               TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"               BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients ("updated_at");
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on clients"
  ON clients FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 6. SHIFTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS shifts CASCADE;
CREATE TABLE shifts (
  "id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "openedBy"                   TEXT NOT NULL DEFAULT '',
  "startTime"                  TEXT NOT NULL DEFAULT '',
  "endTime"                    TEXT DEFAULT NULL,
  "openingFloatCents"          INTEGER NOT NULL DEFAULT 0,
  "cashCollectedCents"         INTEGER NOT NULL DEFAULT 0,
  "cardCollectedCents"         INTEGER NOT NULL DEFAULT 0,
  "bankTransferCollectedCents" INTEGER NOT NULL DEFAULT 0,
  "expectedCashCents"          INTEGER DEFAULT 0,
  "actualCashCents"            INTEGER DEFAULT NULL,
  "discrepancyCents"           INTEGER DEFAULT NULL,
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
CREATE POLICY "Allow anon write access on shifts"
  ON shifts FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 7. SYSTEM ALERTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS system_alerts CASCADE;
CREATE TABLE system_alerts (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "severity"   TEXT NOT NULL DEFAULT 'info',
  "category"   TEXT NOT NULL DEFAULT 'system',
  "message"    TEXT NOT NULL DEFAULT '',
  "timestamp"  TEXT NOT NULL DEFAULT '',
  "read"       BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "_dirty"     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_system_alerts_updated_at ON system_alerts ("updated_at");
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on system_alerts"
  ON system_alerts FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 8. NOTIFICATIONS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS notifications CASCADE;
CREATE TABLE notifications (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petName"       TEXT NOT NULL DEFAULT '',
  "ownerName"     TEXT NOT NULL DEFAULT '',
  "recipient"     TEXT NOT NULL DEFAULT '',
  "type"          TEXT NOT NULL DEFAULT 'appointment_reminder',
  "channel"       TEXT NOT NULL DEFAULT 'sms',
  "message"       TEXT NOT NULL DEFAULT '',
  "scheduledTime" TEXT NOT NULL DEFAULT '',
  "status"        TEXT NOT NULL DEFAULT 'queued',
  "created_at"    TIMESTAMPTZ DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"    BOOLEAN NOT NULL DEFAULT false,
  "_dirty"        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON notifications ("updated_at");
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on notifications"
  ON notifications FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 9. CLINIC QUEUE
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clinic_queue CASCADE;
CREATE TABLE clinic_queue (
  "id"                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"                     TEXT NOT NULL DEFAULT '',
  "petName"                   TEXT NOT NULL DEFAULT '',
  "ownerName"                 TEXT NOT NULL DEFAULT '',
  "ownerPhone"                TEXT NOT NULL DEFAULT '',
  "appointmentId"             TEXT NOT NULL DEFAULT '',
  "serviceType"               TEXT NOT NULL DEFAULT 'Examination',
  "checkInTime"               TEXT NOT NULL DEFAULT '',
  "status"                    TEXT NOT NULL DEFAULT 'active',
  "priority"                  INTEGER DEFAULT 2,
  "assignedVet"               TEXT DEFAULT '',
  "prescribedMeds"            JSONB DEFAULT '[]'::jsonb,
  "urgency"                   TEXT DEFAULT 'routine',
  "emergencyBackfillRequired" BOOLEAN DEFAULT false,
  "created_at"                TIMESTAMPTZ DEFAULT now(),
  "updated_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"                BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                    BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_clinic_queue_updated_at ON clinic_queue ("updated_at");
ALTER TABLE clinic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on clinic_queue"
  ON clinic_queue FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 10. STAFF USERS  (login accounts; "pin" holds a bcrypt hash, never plaintext)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS staff_users CASCADE;
CREATE TABLE staff_users (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"            TEXT NOT NULL DEFAULT '',
  "username"        TEXT NOT NULL DEFAULT '',
  "role"            TEXT NOT NULL DEFAULT 'veterinarian',
  "avatarColor"     TEXT NOT NULL DEFAULT '',
  "pin"             TEXT DEFAULT '',
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "rolePermissions" JSONB DEFAULT '{}'::jsonb,
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_staff_users_updated_at ON staff_users ("updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_users_username ON staff_users ("username");
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on staff_users"
  ON staff_users FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 11. PETS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS pets CASCADE;
CREATE TABLE pets (
  "id"          TEXT PRIMARY KEY,
  "clientId"    TEXT NOT NULL DEFAULT '',
  "name"        TEXT NOT NULL DEFAULT '',
  "petType"     TEXT NOT NULL DEFAULT 'Canine',
  "breed"       TEXT NOT NULL DEFAULT '',
  "weight"      NUMERIC NOT NULL DEFAULT 0,
  "sex"         TEXT NOT NULL DEFAULT 'Unknown',
  "age"         TEXT NOT NULL DEFAULT '',
  "recordIds"   JSONB DEFAULT '[]'::jsonb,
  "vaccineIds"  JSONB DEFAULT '[]'::jsonb,
  "labIds"      JSONB DEFAULT '[]'::jsonb,
  "groomingIds" JSONB DEFAULT '[]'::jsonb,
  "boardingIds" JSONB DEFAULT '[]'::jsonb,
  "created_at"  TIMESTAMPTZ DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"  BOOLEAN NOT NULL DEFAULT false,
  "_dirty"      BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_pets_updated_at ON pets ("updated_at");
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on pets"
  ON pets FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 12. VACCINATIONS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS vaccinations CASCADE;
CREATE TABLE vaccinations (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"            TEXT NOT NULL DEFAULT '',
  "itemId"           TEXT NOT NULL DEFAULT '',
  "name"             TEXT NOT NULL DEFAULT '',
  "price"            NUMERIC NOT NULL DEFAULT 0,
  "billed"           BOOLEAN NOT NULL DEFAULT false,
  "dateAdministered" TEXT NOT NULL DEFAULT '',
  "nextDueDate"      TEXT NOT NULL DEFAULT '',
  "status"           TEXT NOT NULL DEFAULT 'active',
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_vaccinations_updated_at ON vaccinations ("updated_at");
ALTER TABLE vaccinations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on vaccinations"
  ON vaccinations FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 13. LAB RESULTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS lab_results CASCADE;
CREATE TABLE lab_results (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"          TEXT NOT NULL DEFAULT '',
  "testName"       TEXT NOT NULL DEFAULT '',
  "requestDate"    TEXT NOT NULL DEFAULT '',
  "resultDate"     TEXT DEFAULT '',
  "status"         TEXT NOT NULL DEFAULT 'pending',
  "value"          TEXT DEFAULT '',
  "referenceRange" TEXT DEFAULT '',
  "notes"          TEXT DEFAULT '',
  "billingItems"   JSONB DEFAULT '[]'::jsonb,
  "billed"         BOOLEAN DEFAULT false,
  "created_at"     TIMESTAMPTZ DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"     BOOLEAN NOT NULL DEFAULT false,
  "_dirty"         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_lab_results_updated_at ON lab_results ("updated_at");
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on lab_results"
  ON lab_results FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 14. GROOMING LOGS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS grooming_logs CASCADE;
CREATE TABLE grooming_logs (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"                TEXT NOT NULL DEFAULT '',
  "date"                 TEXT NOT NULL DEFAULT '',
  "services"             JSONB DEFAULT '[]'::jsonb,
  "totalBilled"          NUMERIC NOT NULL DEFAULT 0,
  "status"               TEXT NOT NULL DEFAULT 'pending',
  "billingItems"         JSONB DEFAULT '[]'::jsonb,
  "billed"               BOOLEAN DEFAULT false,
  "groomingInstructions" JSONB DEFAULT NULL,
  "consentSignature"     TEXT DEFAULT NULL,
  "consentTimestamp"     TEXT DEFAULT NULL,
  "consentOwnerName"     TEXT DEFAULT NULL,
  "created_at"           TIMESTAMPTZ DEFAULT now(),
  "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"           BOOLEAN NOT NULL DEFAULT false,
  "_dirty"               BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_grooming_logs_updated_at ON grooming_logs ("updated_at");
ALTER TABLE grooming_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on grooming_logs"
  ON grooming_logs FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 15. BOARDING RECORDS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS boarding_records CASCADE;
CREATE TABLE boarding_records (
  "id"                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"                  TEXT NOT NULL DEFAULT '',
  "cageNumber"             TEXT NOT NULL DEFAULT '',
  "checkInDate"            TEXT NOT NULL DEFAULT '',
  "expectedCheckOut"       TEXT NOT NULL DEFAULT '',
  "status"                 TEXT NOT NULL DEFAULT 'active',
  "foodType"               TEXT NOT NULL DEFAULT 'without_food',
  "medicalBoarding"        BOOLEAN NOT NULL DEFAULT false,
  "depositPaid"            BOOLEAN NOT NULL DEFAULT false,
  "hospitalProvidesLitter" BOOLEAN DEFAULT false,
  "billingItems"           JSONB DEFAULT '[]'::jsonb,
  "billed"                 BOOLEAN DEFAULT false,
  "feedingPlan"            JSONB DEFAULT NULL,
  "estimatedStayDays"      INTEGER DEFAULT 1,
  "depositAmountCents"     INTEGER DEFAULT 0,
  "totalChargesCents"      INTEGER DEFAULT 0,
  "cageFeePerDayCents"     INTEGER DEFAULT 0,
  "cleaningFeePerDayCents" INTEGER DEFAULT 0,
  "doctorFeePerVisitCents" INTEGER DEFAULT 0,
  "created_at"             TIMESTAMPTZ DEFAULT now(),
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"             BOOLEAN NOT NULL DEFAULT false,
  "_dirty"                 BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_boarding_records_updated_at ON boarding_records ("updated_at");
ALTER TABLE boarding_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on boarding_records"
  ON boarding_records FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 16. CASH ADJUSTMENTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS cash_adjustments CASCADE;
CREATE TABLE cash_adjustments (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "type"       TEXT NOT NULL DEFAULT 'OUT',
  "amount"     NUMERIC NOT NULL DEFAULT 0,
  "category"   TEXT NOT NULL DEFAULT 'Other',
  "reason"     TEXT NOT NULL DEFAULT '',
  "date"       TEXT NOT NULL DEFAULT '',
  "createdBy"  TEXT NOT NULL DEFAULT '',
  "shiftId"    TEXT DEFAULT '',
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "_dirty"     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_cash_adjustments_updated_at ON cash_adjustments ("updated_at");
ALTER TABLE cash_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on cash_adjustments"
  ON cash_adjustments FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 17. SHIFT RECONCILIATIONS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS shift_reconciliations CASCADE;
CREATE TABLE shift_reconciliations (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "timestamp"       TEXT NOT NULL DEFAULT '',
  "userId"          TEXT NOT NULL DEFAULT '',
  "userName"        TEXT NOT NULL DEFAULT '',
  "openingFloat"    NUMERIC NOT NULL DEFAULT 0,
  "cashSales"       NUMERIC NOT NULL DEFAULT 0,
  "expectedClosing" NUMERIC NOT NULL DEFAULT 0,
  "actualClosing"   NUMERIC NOT NULL DEFAULT 0,
  "discrepancy"     NUMERIC NOT NULL DEFAULT 0,
  "status"          TEXT NOT NULL DEFAULT 'balanced',
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_shift_reconciliations_updated_at ON shift_reconciliations ("updated_at");
ALTER TABLE shift_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on shift_reconciliations"
  ON shift_reconciliations FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 18. STAFF PROFILES
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS staff_profiles CASCADE;
CREATE TABLE staff_profiles (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"         TEXT DEFAULT NULL,
  "fullName"       TEXT NOT NULL DEFAULT '',
  "position"       TEXT DEFAULT '',
  "department"     TEXT DEFAULT '',
  "employmentType" TEXT NOT NULL DEFAULT 'monthly',
  "hourlyRate"     INTEGER DEFAULT NULL,
  "monthlySalary"  INTEGER DEFAULT NULL,
  "hireDate"       TEXT DEFAULT '',
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "created_at"     TIMESTAMPTZ DEFAULT now(),
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"     BOOLEAN NOT NULL DEFAULT false,
  "_dirty"         BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_updated_at ON staff_profiles ("updated_at");
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on staff_profiles"
  ON staff_profiles FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 19. TIME ENTRIES
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS time_entries CASCADE;
CREATE TABLE time_entries (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId"         TEXT NOT NULL DEFAULT '',
  "date"            TEXT NOT NULL DEFAULT '',
  "clockIn"         TEXT NOT NULL DEFAULT '',
  "clockOut"        TEXT DEFAULT NULL,
  "durationMinutes" INTEGER DEFAULT NULL,
  "enteredBy"       TEXT DEFAULT '',
  "source"          TEXT DEFAULT 'self',
  "notes"           TEXT DEFAULT NULL,
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_time_entries_updated_at ON time_entries ("updated_at");
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on time_entries"
  ON time_entries FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 20. SCHEDULE ENTRIES
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS schedule_entries CASCADE;
CREATE TABLE schedule_entries (
  "id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId"    TEXT NOT NULL DEFAULT '',
  "shiftStart" TEXT NOT NULL DEFAULT '',
  "shiftEnd"   TEXT NOT NULL DEFAULT '',
  "role"       TEXT DEFAULT '',
  "notes"      TEXT DEFAULT NULL,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted" BOOLEAN NOT NULL DEFAULT false,
  "_dirty"     BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_updated_at ON schedule_entries ("updated_at");
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on schedule_entries"
  ON schedule_entries FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 21. PAYSLIPS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS payslips CASCADE;
CREATE TABLE payslips (
  "id"            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId"       TEXT NOT NULL DEFAULT '',
  "periodStart"   TEXT DEFAULT '',
  "periodEnd"     TEXT DEFAULT '',
  "grossPayCents" INTEGER DEFAULT 0,
  "deductions"    JSONB DEFAULT '[]'::jsonb,
  "netPayCents"   INTEGER DEFAULT 0,
  "status"        TEXT NOT NULL DEFAULT 'draft',
  "generatedBy"   TEXT DEFAULT '',
  "generatedAt"   TEXT DEFAULT '',
  "paidAt"        TEXT DEFAULT NULL,
  "created_at"    TIMESTAMPTZ DEFAULT now(),
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"    BOOLEAN NOT NULL DEFAULT false,
  "_dirty"        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_payslips_updated_at ON payslips ("updated_at");
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on payslips"
  ON payslips FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 22. DELETION AUDIT
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS deletion_audit CASCADE;
CREATE TABLE deletion_audit (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type"        TEXT NOT NULL DEFAULT 'client',
  "entity_id"          TEXT NOT NULL DEFAULT '',
  "entity_name"        TEXT DEFAULT '',
  "deleted_by"         TEXT NOT NULL DEFAULT '',
  "deleted_at"         TEXT NOT NULL DEFAULT '',
  "had_history"        BOOLEAN DEFAULT false,
  "history_summary"    TEXT DEFAULT '',
  "override_confirmed" BOOLEAN DEFAULT false,
  "created_at"         TIMESTAMPTZ DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"         BOOLEAN NOT NULL DEFAULT false,
  "_dirty"             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_updated_at ON deletion_audit ("updated_at");
ALTER TABLE deletion_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on deletion_audit"
  ON deletion_audit FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 23. INVENTORY BATCHES (FEFO)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS inventory_batches CASCADE;
CREATE TABLE inventory_batches (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "inventoryItemId"   UUID NOT NULL,
  "lotNumber"         TEXT NOT NULL DEFAULT '',
  "expiryDate"        TEXT NOT NULL DEFAULT '',
  "quantityReceived"  INTEGER NOT NULL DEFAULT 0,
  "quantityRemaining" INTEGER NOT NULL DEFAULT 0,
  "receivedDate"      TEXT NOT NULL DEFAULT '',
  "supplier"          TEXT DEFAULT NULL,
  "costPerUnit"       INTEGER DEFAULT NULL,
  "created_at"        TIMESTAMPTZ DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"        BOOLEAN NOT NULL DEFAULT false,
  "_dirty"            BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_updated_at ON inventory_batches ("updated_at");
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon write access on inventory_batches"
  ON inventory_batches FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- =============================================================================
-- END OF BOOTSTRAP — 23 tables, 23 RLS policies.
--
-- NOTE: auth_audit (AUTH-3) is intentionally absent. It is a LOCAL-ONLY store
-- (not in syncEngine's STORE_MAPPINGS) — authorization records deliberately
-- never leave the till. Do not add it here without a conscious decision.
-- =============================================================================
