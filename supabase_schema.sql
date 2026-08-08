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
CREATE POLICY "Allow anon write access on inventory"
  ON inventory FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

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
CREATE POLICY "Allow anon write access on appointments"
  ON appointments FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

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
CREATE POLICY "Allow anon write access on medical_records"
  ON medical_records FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

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
CREATE POLICY "Allow anon write access on invoices"
  ON invoices FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 5. CLIENTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clients CASCADE;
CREATE TABLE clients (
  "client_id"                TEXT PRIMARY KEY,
  "primary_phone"            TEXT NOT NULL DEFAULT '',
  "petIds"                   JSONB DEFAULT '[]'::jsonb,
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
CREATE POLICY "Allow anon write access on system_alerts"
  ON system_alerts FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

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
CREATE POLICY "Allow anon write access on notifications"
  ON notifications FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 9. CLINIC QUEUE
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS clinic_queue CASCADE;
CREATE TABLE clinic_queue (
  "id"              TEXT PRIMARY KEY,
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
CREATE POLICY "Allow anon write access on clinic_queue"
  ON clinic_queue FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

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
CREATE POLICY "Allow anon write access on staff_users"
  ON staff_users FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 11. PETS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS pets CASCADE;
CREATE TABLE pets (
  "id"              TEXT PRIMARY KEY,
  "clientId"        TEXT NOT NULL DEFAULT '',
  "name"            TEXT NOT NULL DEFAULT '',
  "petType"         TEXT NOT NULL DEFAULT 'Canine',
  "breed"           TEXT NOT NULL DEFAULT '',
  "weight"          NUMERIC NOT NULL DEFAULT 0,
  "sex"             TEXT NOT NULL DEFAULT 'Unknown',
  "age"             TEXT NOT NULL DEFAULT '',
  "recordIds"       JSONB DEFAULT '[]'::jsonb,
  "vaccineIds"      JSONB DEFAULT '[]'::jsonb,
  "labIds"          JSONB DEFAULT '[]'::jsonb,
  "groomingIds"     JSONB DEFAULT '[]'::jsonb,
  "boardingIds"     JSONB DEFAULT '[]'::jsonb,
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_pets_updated_at ON pets ("updated_at");
ALTER TABLE pets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on pets" ON pets;
DROP POLICY IF EXISTS "Allow anon read access on pets" ON pets;
DROP POLICY IF EXISTS "Allow anon write access on pets" ON pets;
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
DROP POLICY IF EXISTS "Allow anon full access on vaccinations" ON vaccinations;
DROP POLICY IF EXISTS "Allow anon read access on vaccinations" ON vaccinations;
DROP POLICY IF EXISTS "Allow anon write access on vaccinations" ON vaccinations;
CREATE POLICY "Allow anon write access on vaccinations"
  ON vaccinations FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 13. LAB RESULTS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS lab_results CASCADE;
CREATE TABLE lab_results (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"            TEXT NOT NULL DEFAULT '',
  "testName"         TEXT NOT NULL DEFAULT '',
  "requestDate"      TEXT NOT NULL DEFAULT '',
  "resultDate"       TEXT DEFAULT '',
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "value"            TEXT DEFAULT '',
  "referenceRange"   TEXT DEFAULT '',
  "notes"            TEXT DEFAULT '',
  "billingItems"     JSONB DEFAULT '[]'::jsonb,
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_lab_results_updated_at ON lab_results ("updated_at");
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on lab_results" ON lab_results;
DROP POLICY IF EXISTS "Allow anon read access on lab_results" ON lab_results;
DROP POLICY IF EXISTS "Allow anon write access on lab_results" ON lab_results;
CREATE POLICY "Allow anon write access on lab_results"
  ON lab_results FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 14. GROOMING LOGS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS grooming_logs CASCADE;
CREATE TABLE grooming_logs (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"            TEXT NOT NULL DEFAULT '',
  "date"             TEXT NOT NULL DEFAULT '',
  "services"         JSONB DEFAULT '[]'::jsonb,
  "totalBilled"      NUMERIC NOT NULL DEFAULT 0,
  "status"           TEXT NOT NULL DEFAULT 'pending',
  "billingItems"     JSONB DEFAULT '[]'::jsonb,
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_grooming_logs_updated_at ON grooming_logs ("updated_at");
ALTER TABLE grooming_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on grooming_logs" ON grooming_logs;
DROP POLICY IF EXISTS "Allow anon read access on grooming_logs" ON grooming_logs;
DROP POLICY IF EXISTS "Allow anon write access on grooming_logs" ON grooming_logs;
CREATE POLICY "Allow anon write access on grooming_logs"
  ON grooming_logs FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 15. BOARDING RECORDS
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS boarding_records CASCADE;
CREATE TABLE boarding_records (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "petId"            TEXT NOT NULL DEFAULT '',
  "cageNumber"       TEXT NOT NULL DEFAULT '',
  "checkInDate"      TEXT NOT NULL DEFAULT '',
  "expectedCheckOut" TEXT NOT NULL DEFAULT '',
  "status"           TEXT NOT NULL DEFAULT 'active',
  "foodType"         TEXT NOT NULL DEFAULT 'without_food',
  "medicalBoarding"  BOOLEAN NOT NULL DEFAULT false,
  "depositPaid"      BOOLEAN NOT NULL DEFAULT false,
  "billingItems"     JSONB DEFAULT '[]'::jsonb,
  "created_at"       TIMESTAMPTZ DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"       BOOLEAN NOT NULL DEFAULT false,
  "_dirty"           BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_boarding_records_updated_at ON boarding_records ("updated_at");
ALTER TABLE boarding_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon full access on boarding_records" ON boarding_records;
DROP POLICY IF EXISTS "Allow anon read access on boarding_records" ON boarding_records;
DROP POLICY IF EXISTS "Allow anon write access on boarding_records" ON boarding_records;
CREATE POLICY "Allow anon write access on boarding_records"
  ON boarding_records FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
  
-- Migration: Add expiry and lot tracking to inventory  
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS "expiryDate" TEXT DEFAULT NULL;  
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS "lotNumber" TEXT DEFAULT NULL; 

-- ---------------------------------------------------------------------------  
-- 16. CASH ADJUSTMENTS  
-- ---------------------------------------------------------------------------  
CREATE TABLE IF NOT EXISTS cash_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  category TEXT NOT NULL,
  reason TEXT NOT NULL,
  date TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "shiftId" TEXT,
  updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  _dirty BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE cash_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access on cash_adjustments" ON cash_adjustments;  
DROP POLICY IF EXISTS "Allow anon read access on cash_adjustments" ON cash_adjustments;  
DROP POLICY IF EXISTS "Allow anon write access on cash_adjustments" ON cash_adjustments;  
CREATE POLICY "Allow anon write access on cash_adjustments"  
  ON cash_adjustments FOR ALL TO anon  
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')  
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------  
-- 17. SHIFT RECONCILIATIONS  
-- ---------------------------------------------------------------------------  
CREATE TABLE IF NOT EXISTS shift_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "openingFloat" NUMERIC NOT NULL,
  "cashSales" NUMERIC NOT NULL,
  "expectedClosing" NUMERIC NOT NULL,
  "actualClosing" NUMERIC NOT NULL,
  discrepancy NUMERIC NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  _dirty BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE shift_reconciliations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon full access on shift_reconciliations" ON shift_reconciliations;  
DROP POLICY IF EXISTS "Allow anon read access on shift_reconciliations" ON shift_reconciliations;  
DROP POLICY IF EXISTS "Allow anon write access on shift_reconciliations" ON shift_reconciliations;  
CREATE POLICY "Allow anon write access on shift_reconciliations"  
  ON shift_reconciliations FOR ALL TO anon  
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')  
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');
  
-- Migration: Add billed flag to EHR logs
ALTER TABLE grooming_logs ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;
ALTER TABLE lab_results ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;

-- =============================================================================
-- PAYROLL MODULE — Staff Profiles, Time Entries, Scheduling, and Payslips
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 18. STAFF PROFILES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_profiles (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"          TEXT DEFAULT NULL,
  "fullName"        TEXT NOT NULL DEFAULT '',
  "position"        TEXT DEFAULT '',
  "department"      TEXT DEFAULT '',
  "employmentType"  TEXT NOT NULL DEFAULT 'monthly',
  "hourlyRate"      INTEGER DEFAULT NULL,
  "monthlySalary"   INTEGER DEFAULT NULL,
  "hireDate"        TEXT DEFAULT '',
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"      BOOLEAN NOT NULL DEFAULT false,
  "_dirty"          BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_updated_at ON staff_profiles ("updated_at");
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access on staff_profiles" ON staff_profiles;
DROP POLICY IF EXISTS "Allow anon write access on staff_profiles" ON staff_profiles;
CREATE POLICY "Allow anon write access on staff_profiles"
  ON staff_profiles FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 19. TIME ENTRIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
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
DROP POLICY IF EXISTS "Allow anon read access on time_entries" ON time_entries;
DROP POLICY IF EXISTS "Allow anon write access on time_entries" ON time_entries;
CREATE POLICY "Allow anon write access on time_entries"
  ON time_entries FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 20. SCHEDULE ENTRIES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_entries (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staffId"      TEXT NOT NULL DEFAULT '',
  "shiftStart"   TEXT NOT NULL DEFAULT '',
  "shiftEnd"     TEXT NOT NULL DEFAULT '',
  "role"         TEXT DEFAULT '',
  "notes"        TEXT DEFAULT NULL,
  "created_at"   TIMESTAMPTZ DEFAULT now(),
  "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"   BOOLEAN NOT NULL DEFAULT false,
  "_dirty"       BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_schedule_entries_updated_at ON schedule_entries ("updated_at");
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access on schedule_entries" ON schedule_entries;
DROP POLICY IF EXISTS "Allow anon write access on schedule_entries" ON schedule_entries;
CREATE POLICY "Allow anon write access on schedule_entries"
  ON schedule_entries FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- ---------------------------------------------------------------------------
-- 21. PAYSLIPS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payslips (
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
DROP POLICY IF EXISTS "Allow anon read access on payslips" ON payslips;
DROP POLICY IF EXISTS "Allow anon write access on payslips" ON payslips;
CREATE POLICY "Allow anon write access on payslips"
  ON payslips FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__'); 


-- =============================================================
-- BM-2: Feeding plan on boarding records (added 2026-07-10)
-- =============================================================
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS feeding_plan JSONB DEFAULT NULL;

-- Chunk K-2 Grooming Instructions and Consent
ALTER TABLE grooming_logs ADD COLUMN IF NOT EXISTS grooming_instructions JSONB DEFAULT NULL;
ALTER TABLE grooming_logs ADD COLUMN IF NOT EXISTS consent_signature TEXT DEFAULT NULL;
ALTER TABLE grooming_logs ADD COLUMN IF NOT EXISTS consent_timestamp TEXT DEFAULT NULL;
ALTER TABLE grooming_logs ADD COLUMN IF NOT EXISTS consent_owner_name TEXT DEFAULT NULL;


-- =============================================================
-- K-3: Admission vs Boarding billing intelligence (added 2026-07-11)
-- =============================================================
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS estimated_stay_days INTEGER DEFAULT 1;
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS deposit_amount_cents INTEGER DEFAULT 0;
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS cage_fee_per_day_cents INTEGER DEFAULT 0;
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS cleaning_fee_per_day_cents INTEGER DEFAULT 0;
ALTER TABLE boarding_records ADD COLUMN IF NOT EXISTS doctor_fee_per_visit_cents INTEGER DEFAULT 0;


-- =============================================================
-- F-3: Deletion audit trail for soft-deleted clients and pets
-- =============================================================
CREATE TABLE IF NOT EXISTS deletion_audit (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "entity_type"        TEXT NOT NULL,     -- 'client' | 'pet'
  "entity_id"          TEXT NOT NULL,
  "entity_name"        TEXT DEFAULT '',
  "deleted_by"         TEXT NOT NULL,     -- User.name
  "deleted_at"         TEXT NOT NULL,
  "had_history"        BOOLEAN DEFAULT false,   -- did it have linked records?
  "history_summary"    TEXT DEFAULT '',         -- e.g. "3 invoices, 2 medical records"
  "override_confirmed" BOOLEAN DEFAULT false,
  "created_at"         TIMESTAMPTZ DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"         BOOLEAN NOT NULL DEFAULT false,
  "_dirty"             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_deletion_audit_updated_at ON deletion_audit ("updated_at");
ALTER TABLE deletion_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access on deletion_audit" ON deletion_audit;
DROP POLICY IF EXISTS "Allow anon write access on deletion_audit" ON deletion_audit;
-- Step 20A: SAFE NO-READ posture. RLS is enabled with NO anon/authenticated
-- policy, so deletion-audit history is denied to the app roles by default
-- (service_role bypasses RLS for admin/backup). The legacy x-sync-secret
-- placeholder policy is intentionally NOT recreated. A read policy is deferred
-- until the ReportsManager Supabase auth model is decided.

-- =============================================================
-- F-4: Inventory Batch Tracking with FEFO
-- =============================================================
CREATE TABLE IF NOT EXISTS inventory_batches (
  "id"                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "inventoryItemId"    UUID NOT NULL,
  "lotNumber"          TEXT NOT NULL,
  "expiryDate"         TEXT NOT NULL,
  "quantityReceived"   INTEGER NOT NULL,
  "quantityRemaining"  INTEGER NOT NULL,
  "receivedDate"       TEXT NOT NULL,
  "supplier"           TEXT DEFAULT NULL,
  "costPerUnit"        INTEGER DEFAULT NULL,
  "created_at"         TIMESTAMPTZ DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "is_deleted"         BOOLEAN NOT NULL DEFAULT false,
  "_dirty"             BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_updated_at ON inventory_batches ("updated_at");
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access on inventory_batches" ON inventory_batches;
DROP POLICY IF EXISTS "Allow anon write access on inventory_batches" ON inventory_batches;
CREATE POLICY "Allow anon write access on inventory_batches"
  ON inventory_batches FOR ALL TO anon
  USING (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__')
  WITH CHECK (current_setting('request.headers', true)::json->>'x-sync-secret' = '__SYNC_SECRET_PLACEHOLDER__');

-- =============================================================================
-- STEP 31 SECURITY HARDENING FOOTER — DO NOT REMOVE
-- =============================================================================
-- The per-table "Allow anon write access" policies above are legacy and rely on
-- a shared `x-sync-secret` header that ships in the browser bundle — i.e. a
-- public secret, not a real security boundary. Until a genuine Supabase Auth
-- model exists (and RLS policies scope on auth.uid() + verified server roles),
-- a freshly-provisioned database must NOT expose the anon/authenticated roles.
-- This footer closes that surface deny-by-default. Running it leaves the tables
-- reachable only by service_role / postgres (RLS enabled, no anon policy).
--
-- To re-open safely later: add auth.uid()-scoped policies AND grant the minimum
-- privileges to the intended role — never restore blanket anon grants.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
DO $$ BEGIN
  IF to_regprocedure('public.wipe_all_tables()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.wipe_all_tables() FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.auto_cancel_expired_bookings()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.auto_cancel_expired_bookings() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS  FROM anon, authenticated;
-- =============================================================================
