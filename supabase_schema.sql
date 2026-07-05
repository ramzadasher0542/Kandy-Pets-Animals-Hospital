-- =============================================================================
-- @license
-- SPDX-License-Identifier: Apache-2.0
--
-- CeylonPets Veterinary Hospital Management System
-- Supabase PostgreSQL Schema
-- =============================================================================
-- Mirrors TypeScript interfaces from src/types.ts.
-- Complex nested objects are stored as JSONB columns.
-- Every table has:  id UUID PK, updated_at TIMESTAMPTZ, is_deleted BOOLEAN
-- Row Level Security is enabled on all tables with a permissive anon policy.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. INVENTORY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'retail',     -- retail | prescription | lab_service | service | vaccine
  price       NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  min_stock   INTEGER NOT NULL DEFAULT 0,
  unit        TEXT NOT NULL DEFAULT '',
  location    TEXT,
  lab_parameters JSONB,                           -- Array<{ name, referenceRange, unit }>
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_inventory_updated_at ON inventory (updated_at);

ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on inventory"
  ON inventory FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 2. APPOINTMENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  apt_number      TEXT,
  pet_name        TEXT NOT NULL DEFAULT '',
  pet_type        TEXT NOT NULL DEFAULT 'Other',  -- PetClassification
  breed           TEXT NOT NULL DEFAULT '',
  weight          NUMERIC(8,2),
  sex             TEXT,
  owner_name      TEXT NOT NULL DEFAULT '',
  owner_phone     TEXT NOT NULL DEFAULT '',
  alternate_phone TEXT,
  owner_email     TEXT,
  address         TEXT,
  date            TEXT NOT NULL DEFAULT '',
  time            TEXT NOT NULL DEFAULT '',
  veterinarian    TEXT NOT NULL DEFAULT '',
  reason          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'booked', -- booked | in-progress | completed | cancelled
  admission_type  TEXT,                           -- OPD | Pet Boarding | Hospital Admission | Vaccination
  assigned_vet    TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_appointments_updated_at ON appointments (updated_at);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on appointments"
  ON appointments FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 3. MEDICAL RECORDS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS medical_records (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        TEXT NOT NULL DEFAULT '',
  pet_name          TEXT NOT NULL DEFAULT '',
  pet_type          TEXT NOT NULL DEFAULT 'Other',
  breed             TEXT NOT NULL DEFAULT '',
  age               TEXT NOT NULL DEFAULT '',
  weight            NUMERIC(8,2) NOT NULL DEFAULT 0,
  sex               TEXT,
  owner_name        TEXT NOT NULL DEFAULT '',
  owner_phone       TEXT NOT NULL DEFAULT '',
  owner_email       TEXT NOT NULL DEFAULT '',
  visit_date        TEXT NOT NULL DEFAULT '',

  -- Enterprise EHR JSONB columns
  vitals            JSONB,    -- Vitals
  patient_history   JSONB,    -- PatientHistory
  physical_exam     JSONB,    -- PhysicalExamination
  assessment        JSONB,    -- ClinicalAssessment
  diagnostic_plan   JSONB,    -- string[]
  monitoring_plan   JSONB,    -- string[]

  subjective_tags   JSONB,    -- string[]
  symptoms          TEXT NOT NULL DEFAULT '',
  objective_findings JSONB,   -- Record<string, { isNormal, notes }>
  diagnosis         TEXT NOT NULL DEFAULT '',
  treatment_notes   TEXT NOT NULL DEFAULT '',
  prescribed_meds   JSONB,    -- Array<{ itemId, name, dosage, quantity, ... }>
  vaccinations      JSONB,    -- Vaccination[]
  lab_results       JSONB,    -- LabResult[]
  inpatient_logs    JSONB,    -- InpatientLog[]
  grooming_records  JSONB,    -- GroomingLog[]
  boarding_info     JSONB,    -- BoardingRecord

  created_date      TEXT NOT NULL DEFAULT '',
  attending_vet     TEXT,
  appointment_id    TEXT,
  follow_up_date    TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted        BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_medical_records_updated_at ON medical_records (updated_at);

ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on medical_records"
  ON medical_records FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4. INVOICES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  TEXT,
  patient_id      TEXT NOT NULL DEFAULT '',
  pet_name        TEXT NOT NULL DEFAULT '',
  owner_name      TEXT NOT NULL DEFAULT '',
  owner_phone     TEXT NOT NULL DEFAULT '',
  date            TEXT NOT NULL DEFAULT '',
  items           JSONB NOT NULL DEFAULT '[]'::jsonb,   -- InvoiceItem[]
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax             NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  cogs            NUMERIC(12,2),
  profit          NUMERIC(12,2),
  payment_method  TEXT,                                 -- PaymentMethod
  split_payments  JSONB,                                -- Array<{ method, amount }>
  payment_status  TEXT NOT NULL DEFAULT 'unpaid',       -- unpaid | paid | void
  deposit_held    NUMERIC(12,2),
  created_by      TEXT NOT NULL DEFAULT '',
  shift_id        TEXT,
  notes           TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_invoices_updated_at ON invoices (updated_at);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on invoices"
  ON invoices FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 5. CLIENTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  client_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_phone            TEXT NOT NULL DEFAULT '',
  alternate_phone          TEXT,
  full_name                TEXT NOT NULL DEFAULT '',
  email_address            TEXT NOT NULL DEFAULT '',
  physical_address         TEXT NOT NULL DEFAULT '',
  communication_preference TEXT NOT NULL DEFAULT 'none',  -- sms | email | both | none
  account_balance          NUMERIC(12,2) NOT NULL DEFAULT 0,
  lifetime_value           NUMERIC(12,2) NOT NULL DEFAULT 0,
  client_status            TEXT NOT NULL DEFAULT 'active', -- active | inactive | flagged_bad_debt
  administrative_notes     TEXT NOT NULL DEFAULT '',
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted               BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_clients_updated_at ON clients (updated_at);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on clients"
  ON clients FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 6. SHIFTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shifts (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_by                    TEXT NOT NULL DEFAULT '',
  start_time                   TEXT NOT NULL DEFAULT '',
  end_time                     TEXT,
  opening_float_cents          INTEGER NOT NULL DEFAULT 0,
  cash_collected_cents         INTEGER NOT NULL DEFAULT 0,
  card_collected_cents         INTEGER NOT NULL DEFAULT 0,
  bank_transfer_collected_cents INTEGER NOT NULL DEFAULT 0,
  expected_cash_cents          INTEGER,
  actual_cash_cents            INTEGER,
  discrepancy_cents            INTEGER,
  notes                        TEXT,
  is_open                      BOOLEAN NOT NULL DEFAULT true,
  opening_float                NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cash                  NUMERIC(12,2),
  discrepancy_reason           TEXT NOT NULL DEFAULT '',
  created_at                   TIMESTAMPTZ DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted                   BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_shifts_updated_at ON shifts (updated_at);

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on shifts"
  ON shifts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 7. SYSTEM ALERTS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity    TEXT NOT NULL DEFAULT 'info',      -- info | warning | urgent
  category    TEXT NOT NULL DEFAULT 'system',    -- inventory | appointment | system | lab
  message     TEXT NOT NULL DEFAULT '',
  timestamp   TEXT NOT NULL DEFAULT '',
  read        BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_updated_at ON system_alerts (updated_at);

ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on system_alerts"
  ON system_alerts FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 8. NOTIFICATIONS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_name        TEXT NOT NULL DEFAULT '',
  owner_name      TEXT NOT NULL DEFAULT '',
  recipient       TEXT NOT NULL DEFAULT '',
  type            TEXT NOT NULL DEFAULT 'appointment_reminder', -- appointment_reminder | vaccine_alert | followup | lab_result
  channel         TEXT NOT NULL DEFAULT 'sms',                  -- sms | email | push
  message         TEXT NOT NULL DEFAULT '',
  scheduled_time  TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'queued',               -- queued | sent | failed
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_notifications_updated_at ON notifications (updated_at);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on notifications"
  ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 9. CLINIC QUEUE
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id          TEXT NOT NULL DEFAULT '',
  pet_name        TEXT NOT NULL DEFAULT '',
  owner_name      TEXT NOT NULL DEFAULT '',
  owner_phone     TEXT NOT NULL DEFAULT '',
  appointment_id  TEXT NOT NULL DEFAULT '',
  service_type    TEXT NOT NULL DEFAULT '',
  check_in_time   TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | active | completed
  assigned_vet    TEXT,
  prescribed_meds JSONB,                              -- Array<{ itemId, name, quantity }>
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted      BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_clinic_queue_updated_at ON clinic_queue (updated_at);

ALTER TABLE clinic_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on clinic_queue"
  ON clinic_queue FOR ALL TO anon USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 10. STAFF USERS
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS staff_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL DEFAULT '',
  username      TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'veterinarian', -- admin | veterinarian | cashier | owner | dummy_admin
  avatar_color  TEXT NOT NULL DEFAULT '',
  pin           TEXT,
  role_permissions JSONB,                             -- optional extended permissions
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_deleted    BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_staff_users_updated_at ON staff_users (updated_at);

ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Allow anon full access on staff_users"
  ON staff_users FOR ALL TO anon USING (true) WITH CHECK (true);

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
