-- VHMS canonical tenant-aware base schema
-- Reviewed source-owned candidate for the 36-file remediation chain.
-- This migration creates only pre-remediation base tables and original prerequisite RPCs.
-- It intentionally excludes migration-created tables, final remediation RPCs, legacy PIN/email credential columns, policies, and data.

CREATE TABLE public.appointments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "aptNumber" text DEFAULT ''::text,
  "petName" text NOT NULL DEFAULT ''::text,
  "petType" text NOT NULL DEFAULT 'Canine'::text,
  breed text NOT NULL DEFAULT ''::text,
  weight numeric DEFAULT 0,
  sex text DEFAULT 'Unknown'::text,
  "ownerName" text NOT NULL DEFAULT ''::text,
  "ownerPhone" text NOT NULL DEFAULT ''::text,
  "alternatePhone" text DEFAULT ''::text,
  "ownerEmail" text DEFAULT ''::text,
  address text DEFAULT ''::text,
  date text NOT NULL DEFAULT ''::text,
  "time" text NOT NULL DEFAULT ''::text,
  veterinarian text NOT NULL DEFAULT ''::text,
  reason text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'booked'::text,
  "admissionType" text DEFAULT 'OPD'::text,
  "assignedVet" text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  age text DEFAULT ''::text,
  urgency text DEFAULT 'routine'::text,
  "emergencyBackfillRequired" boolean DEFAULT false,
  "surgeryChecklist" jsonb,
  clinic_id uuid,
  CONSTRAINT appointments_pkey PRIMARY KEY (id)
);



CREATE TABLE public.boarding_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "petId" text NOT NULL DEFAULT ''::text,
  "cageNumber" text NOT NULL DEFAULT ''::text,
  "checkInDate" text NOT NULL DEFAULT ''::text,
  "expectedCheckOut" text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'active'::text,
  "foodType" text NOT NULL DEFAULT 'without_food'::text,
  "medicalBoarding" boolean NOT NULL DEFAULT false,
  "depositPaid" boolean NOT NULL DEFAULT false,
  "billingItems" jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  billed boolean DEFAULT false,
  "feedingPlan" jsonb,
  "estimatedStayDays" integer DEFAULT 1,
  "depositAmountCents" integer DEFAULT 0,
  "cageFeePerDayCents" integer DEFAULT 0,
  "cleaningFeePerDayCents" integer DEFAULT 0,
  "doctorFeePerVisitCents" integer DEFAULT 0,
  "hospitalProvidesLitter" boolean DEFAULT false,
  "totalChargesCents" integer DEFAULT 0,
  clinic_id uuid,
  "pricingSnapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "checkedOutAt" timestamp with time zone,
  CONSTRAINT boarding_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.cash_adjustments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  amount numeric NOT NULL,
  category text NOT NULL,
  reason text NOT NULL,
  date text NOT NULL,
  "createdBy" text NOT NULL,
  "shiftId" text,
  updated_at text NOT NULL DEFAULT ((now() AT TIME ZONE 'utc'::text))::text,
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT true,
  clinic_id uuid,
  CONSTRAINT cash_adjustments_pkey PRIMARY KEY (id)
);


CREATE TABLE public.clients (
  client_id text NOT NULL,
  primary_phone text NOT NULL DEFAULT ''::text,
  alternate_phone text DEFAULT ''::text,
  full_name text NOT NULL DEFAULT ''::text,
  email_address text DEFAULT ''::text,
  physical_address text DEFAULT ''::text,
  communication_preference text DEFAULT 'sms'::text,
  account_balance numeric NOT NULL DEFAULT 0,
  lifetime_value numeric NOT NULL DEFAULT 0,
  client_status text NOT NULL DEFAULT 'active'::text,
  administrative_notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  "petIds" jsonb DEFAULT '[]'::jsonb,
  clinic_id uuid,
  CONSTRAINT clients_pkey PRIMARY KEY (client_id)
);

CREATE TABLE public.clinic_queue (
  id text NOT NULL,
  "petId" text NOT NULL DEFAULT ''::text,
  "petName" text NOT NULL DEFAULT ''::text,
  "ownerName" text NOT NULL DEFAULT ''::text,
  "ownerPhone" text NOT NULL DEFAULT ''::text,
  "appointmentId" text NOT NULL DEFAULT ''::text,
  "serviceType" text NOT NULL DEFAULT ''::text,
  "checkInTime" text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'active'::text,
  "assignedVet" text DEFAULT ''::text,
  "prescribedMeds" jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  priority integer DEFAULT 2,
  urgency text DEFAULT 'routine'::text,
  "emergencyBackfillRequired" boolean DEFAULT false,
  clinic_id uuid,
  CONSTRAINT clinic_queue_pkey PRIMARY KEY (id)
);


CREATE TABLE public.clinics (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT clinics_pkey PRIMARY KEY (id)
);


CREATE TABLE public.grooming_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "petId" text NOT NULL DEFAULT ''::text,
  date text NOT NULL DEFAULT ''::text,
  services jsonb DEFAULT '[]'::jsonb,
  "totalBilled" numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  "billingItems" jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  billed boolean DEFAULT false,
  "groomingInstructions" jsonb,
  "consentSignature" text,
  "consentTimestamp" text,
  "consentOwnerName" text,
  clinic_id uuid,
  CONSTRAINT grooming_logs_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sku text NOT NULL DEFAULT ''::text,
  name text NOT NULL DEFAULT ''::text,
  category text NOT NULL DEFAULT 'retail'::text,
  price numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  stock numeric NOT NULL DEFAULT 0,
  "minStock" numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'unit'::text,
  location text DEFAULT ''::text,
  "labParameters" jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  "expiryDate" text,
  "lotNumber" text,
  category_id uuid,
  clinic_id uuid,
  CONSTRAINT inventory_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "inventoryItemId" uuid NOT NULL,
  "lotNumber" text NOT NULL,
  "expiryDate" text NOT NULL,
  "quantityReceived" integer NOT NULL,
  "quantityRemaining" integer NOT NULL,
  "receivedDate" text NOT NULL,
  supplier text,
  "costPerUnit" integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  supplier_id uuid,
  origin text DEFAULT 'purchase'::text,
  clinic_id uuid,
  CONSTRAINT inventory_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  label text NOT NULL,
  is_service boolean DEFAULT false,
  is_lab boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  clinic_id uuid,
  CONSTRAINT inventory_categories_pkey PRIMARY KEY (id)
);

CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "appointmentId" text DEFAULT ''::text,
  "patientId" text NOT NULL DEFAULT ''::text,
  "petName" text NOT NULL DEFAULT ''::text,
  "ownerName" text NOT NULL DEFAULT ''::text,
  "ownerPhone" text NOT NULL DEFAULT ''::text,
  date text NOT NULL DEFAULT ''::text,
  items jsonb DEFAULT '[]'::jsonb,
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  sales_total numeric NOT NULL DEFAULT 0,
  cogs numeric DEFAULT 0,
  profit numeric DEFAULT 0,
  "paymentMethod" text DEFAULT 'cash'::text,
  "splitPayments" jsonb DEFAULT '[]'::jsonb,
  "paymentStatus" text NOT NULL DEFAULT 'unpaid'::text,
  "depositHeld" numeric DEFAULT 0,
  "createdBy" text NOT NULL DEFAULT ''::text,
  "shiftId" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT invoices_pkey PRIMARY KEY (id)
);

CREATE TABLE public.lab_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "petId" text NOT NULL DEFAULT ''::text,
  "testName" text NOT NULL DEFAULT ''::text,
  "requestDate" text NOT NULL DEFAULT ''::text,
  "resultDate" text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'pending'::text,
  value text DEFAULT ''::text,
  "referenceRange" text DEFAULT ''::text,
  notes text DEFAULT ''::text,
  "billingItems" jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  billed boolean DEFAULT false,
  clinic_id uuid,
  CONSTRAINT lab_results_pkey PRIMARY KEY (id)
);

CREATE TABLE public.medical_records (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "patientId" text NOT NULL DEFAULT ''::text,
  "petName" text NOT NULL DEFAULT ''::text,
  "petType" text NOT NULL DEFAULT 'Canine'::text,
  breed text NOT NULL DEFAULT ''::text,
  age text NOT NULL DEFAULT ''::text,
  weight numeric NOT NULL DEFAULT 0,
  sex text DEFAULT 'Unknown'::text,
  "ownerName" text NOT NULL DEFAULT ''::text,
  "ownerPhone" text NOT NULL DEFAULT ''::text,
  "ownerEmail" text DEFAULT ''::text,
  "visitDate" text NOT NULL DEFAULT ''::text,
  vitals jsonb DEFAULT '{}'::jsonb,
  "patientHistory" jsonb DEFAULT '{}'::jsonb,
  "physicalExam" jsonb DEFAULT '{}'::jsonb,
  assessment jsonb DEFAULT '{}'::jsonb,
  "diagnosticPlan" jsonb DEFAULT '[]'::jsonb,
  "monitoringPlan" jsonb DEFAULT '[]'::jsonb,
  "subjectiveTags" jsonb DEFAULT '[]'::jsonb,
  symptoms text DEFAULT ''::text,
  "objectiveFindings" jsonb DEFAULT '{}'::jsonb,
  diagnosis text DEFAULT ''::text,
  "treatmentNotes" text DEFAULT ''::text,
  "prescribedMeds" jsonb DEFAULT '[]'::jsonb,
  vaccinations jsonb DEFAULT '[]'::jsonb,
  "labResults" jsonb DEFAULT '[]'::jsonb,
  "inpatientLogs" jsonb DEFAULT '[]'::jsonb,
  "groomingRecords" jsonb DEFAULT '[]'::jsonb,
  "boardingInfo" jsonb,
  "createdDate" text DEFAULT ''::text,
  "attendingVet" text DEFAULT ''::text,
  "appointmentId" text DEFAULT ''::text,
  "followUpDate" text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT medical_records_pkey PRIMARY KEY (id)
);

CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "petName" text DEFAULT ''::text,
  "ownerName" text DEFAULT ''::text,
  recipient text DEFAULT ''::text,
  type text NOT NULL DEFAULT 'appointment_reminder'::text,
  channel text NOT NULL DEFAULT 'sms'::text,
  message text DEFAULT ''::text,
  "scheduledTime" text DEFAULT ''::text,
  status text NOT NULL DEFAULT 'queued'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);


CREATE TABLE public.pets (
  id text NOT NULL,
  "clientId" text NOT NULL DEFAULT ''::text,
  name text NOT NULL DEFAULT ''::text,
  "petType" text NOT NULL DEFAULT 'Canine'::text,
  breed text NOT NULL DEFAULT ''::text,
  weight numeric NOT NULL DEFAULT 0,
  sex text NOT NULL DEFAULT 'Unknown'::text,
  age text NOT NULL DEFAULT ''::text,
  "recordIds" jsonb DEFAULT '[]'::jsonb,
  "vaccineIds" jsonb DEFAULT '[]'::jsonb,
  "labIds" jsonb DEFAULT '[]'::jsonb,
  "groomingIds" jsonb DEFAULT '[]'::jsonb,
  "boardingIds" jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT pets_pkey PRIMARY KEY (id)
);


CREATE TABLE public.shift_reconciliations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "timestamp" text NOT NULL,
  "userId" text NOT NULL,
  "userName" text NOT NULL,
  "openingFloat" numeric NOT NULL,
  "cashSales" numeric NOT NULL,
  "expectedClosing" numeric NOT NULL,
  "actualClosing" numeric NOT NULL,
  discrepancy numeric NOT NULL,
  status text NOT NULL,
  updated_at text NOT NULL DEFAULT ((now() AT TIME ZONE 'utc'::text))::text,
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT true,
  clinic_id uuid,
  CONSTRAINT shift_reconciliations_pkey PRIMARY KEY (id)
);

CREATE TABLE public.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "openedBy" text NOT NULL DEFAULT ''::text,
  "startTime" text NOT NULL DEFAULT ''::text,
  "endTime" text DEFAULT ''::text,
  "openingFloatCents" numeric NOT NULL DEFAULT 0,
  "cashCollectedCents" numeric NOT NULL DEFAULT 0,
  "cardCollectedCents" numeric NOT NULL DEFAULT 0,
  "bankTransferCollectedCents" numeric NOT NULL DEFAULT 0,
  "expectedCashCents" numeric DEFAULT 0,
  "actualCashCents" numeric DEFAULT 0,
  "discrepancyCents" numeric DEFAULT 0,
  notes text DEFAULT ''::text,
  "isOpen" boolean NOT NULL DEFAULT true,
  opening_float numeric NOT NULL DEFAULT 0,
  actual_cash numeric,
  discrepancy_reason text DEFAULT ''::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT shifts_pkey PRIMARY KEY (id)
);


CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  payment_terms text,
  is_active boolean DEFAULT true,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  clinic_id uuid,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  severity text NOT NULL DEFAULT 'info'::text,
  category text NOT NULL DEFAULT 'system'::text,
  message text NOT NULL DEFAULT ''::text,
  "timestamp" text DEFAULT ''::text,
  read boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT system_alerts_pkey PRIMARY KEY (id)
);

CREATE TABLE public.system_config (
  id text NOT NULL DEFAULT 'global'::text,
  app_name text DEFAULT 'Ceylon Pets POS'::text,
  reseller_name text DEFAULT 'Ash Point Solutions'::text,
  hospital_name text DEFAULT 'Ceylon Pets Animal Hospital'::text,
  hospital_address text DEFAULT 'Kandy, Sri Lanka'::text,
  hospital_phone text DEFAULT '+94 81 234 5678'::text,
  hospital_email text DEFAULT 'contact@ceylonpets.lk'::text,
  invoice_logo text DEFAULT '🐾'::text,
  invoice_footer_message text DEFAULT 'Thank you for choosing Ceylon Pets!'::text,
  invoice_sub_footer_message text DEFAULT '* OFFICIAL RECEIPT *'::text,
  invoice_extra_footer_message text DEFAULT 'POWERED BY ASH POINT SOLUTIONS'::text,
  tax_rate numeric DEFAULT 0.0825,
  currency_symbol text DEFAULT 'Rs. '::text,
  selected_receipt_printer text DEFAULT ''::text,
  selected_report_printer text DEFAULT ''::text,
  receipt_paper_size text DEFAULT '58mm'::text,
  connection_type text DEFAULT 'usb'::text,
  local_autosave_interval integer DEFAULT 15,
  cloud_endpoint text DEFAULT ''::text,
  cloud_backup_enabled boolean DEFAULT false,
  email_digest_enabled boolean DEFAULT false,
  recipient_emails jsonb DEFAULT '[]'::jsonb,
  digest_schedule text DEFAULT 'daily_end'::text,
  role_permissions jsonb DEFAULT '{}'::jsonb,
  boarding_rates jsonb DEFAULT '{}'::jsonb,
  default_deposit_cents integer DEFAULT 1500000,
  idle_logout_minutes integer DEFAULT 15,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  setup_mode_active boolean DEFAULT false,
  clinic_id uuid,
  CONSTRAINT system_config_pkey PRIMARY KEY (id)
);


CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT ''::text,
  username text NOT NULL DEFAULT ''::text,
  role text NOT NULL DEFAULT 'cashier'::text,
  avatar_color text DEFAULT ''::text,
  active boolean DEFAULT true,
  is_deleted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  auth_user_id uuid,
  clinic_id uuid,
  is_superadmin boolean NOT NULL DEFAULT false,
  panel_permissions jsonb,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);

CREATE TABLE public.vaccinations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  "petId" text NOT NULL DEFAULT ''::text,
  "itemId" text NOT NULL DEFAULT ''::text,
  name text NOT NULL DEFAULT ''::text,
  price numeric NOT NULL DEFAULT 0,
  billed boolean NOT NULL DEFAULT false,
  "dateAdministered" text NOT NULL DEFAULT ''::text,
  "nextDueDate" text NOT NULL DEFAULT ''::text,
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  is_deleted boolean NOT NULL DEFAULT false,
  _dirty boolean NOT NULL DEFAULT false,
  clinic_id uuid,
  CONSTRAINT vaccinations_pkey PRIMARY KEY (id)
);


-- Original prerequisite functions required before the remediation chain.
CREATE OR REPLACE FUNCTION public._invoice_method_cents(
  p_invoice jsonb,
  OUT cash_cents integer,
  OUT card_cents integer,
  OUT bank_cents integer
)
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_elem jsonb;
  v_method text;
BEGIN
  cash_cents := 0; card_cents := 0; bank_cents := 0;
  IF (p_invoice->>'paymentMethod') = 'split'
     AND jsonb_typeof(p_invoice->'splitPayments') = 'array' THEN
    FOR v_elem IN SELECT * FROM jsonb_array_elements(p_invoice->'splitPayments') LOOP
      v_method := v_elem->>'method';
      IF v_method = 'cash' THEN
        cash_cents := cash_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      ELSIF v_method = 'card' THEN
        card_cents := card_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      ELSIF v_method = 'bank_transfer' THEN
        bank_cents := bank_cents + round(COALESCE((v_elem->>'amount')::numeric, 0) * 100)::integer;
      END IF;
    END LOOP;
  ELSE
    v_method := p_invoice->>'paymentMethod';
    IF v_method = 'cash' THEN
      cash_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    ELSIF v_method = 'card' THEN
      card_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    ELSIF v_method = 'bank_transfer' THEN
      bank_cents := round(COALESCE((p_invoice->>'sales_total')::numeric, 0) * 100)::integer;
    END IF;
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.apply_shift_revenue(
  p_shift_id uuid,
  p_cash_cents integer,
  p_card_cents integer,
  p_bank_cents integer
) RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_shift_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SHIFT_ID';
  END IF;
  -- Lock the target shift row so concurrent deltas serialize (no read-modify-write race).
  PERFORM 1 FROM public.shifts WHERE id = p_shift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: %', p_shift_id;
  END IF;
  UPDATE public.shifts SET
    "cashCollectedCents"         = "cashCollectedCents"         + COALESCE(p_cash_cents, 0),
    "cardCollectedCents"         = "cardCollectedCents"         + COALESCE(p_card_cents, 0),
    "bankTransferCollectedCents" = "bankTransferCollectedCents" + COALESCE(p_bank_cents, 0),
    updated_at = now()
  WHERE id = p_shift_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.atomic_stock_decrement(
  p_item_id  uuid,
  p_qty_delta integer
) RETURNS numeric
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item_stock numeric;
  v_batch_count integer;
  v_available numeric;
  v_remaining integer;
  v_consume integer;
  v_total numeric;
  v_expiry text;
  v_lot text;
  v_newest_id uuid;
  b RECORD;
BEGIN
  -- Lock the target inventory row; fail closed if it does not exist.
  SELECT stock INTO v_item_stock
  FROM public.inventory
  WHERE id = p_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ITEM_NOT_FOUND: %', p_item_id;
  END IF;

  SELECT count(*) INTO v_batch_count
  FROM public.inventory_batches
  WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

  IF v_batch_count > 0 THEN
    IF p_qty_delta < 0 THEN
      -- Lock all non-deleted batches for this item BEFORE computing availability,
      -- then reject an oversell before touching any batch row (no partial consume).
      PERFORM 1 FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false
      FOR UPDATE;

      SELECT COALESCE(sum("quantityRemaining"), 0) INTO v_available
      FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

      IF abs(p_qty_delta) > v_available THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: item=%, requested=%, available=%',
          p_item_id, abs(p_qty_delta), v_available;
      END IF;

      -- FEFO consumption, soonest expiry first (rows already locked above).
      v_remaining := abs(p_qty_delta);
      FOR b IN
        SELECT id, "quantityRemaining"
        FROM public.inventory_batches
        WHERE "inventoryItemId" = p_item_id
          AND is_deleted = false
          AND "quantityRemaining" > 0
        ORDER BY "expiryDate" ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_consume := LEAST(b."quantityRemaining", v_remaining);
        UPDATE public.inventory_batches
        SET "quantityRemaining" = "quantityRemaining" - v_consume,
            updated_at = now()
        WHERE id = b.id;
        v_remaining := v_remaining - v_consume;
      END LOOP;

    ELSIF p_qty_delta > 0 THEN
      -- Return stock to the newest non-deleted batch (max expiryDate).
      SELECT id INTO v_newest_id
      FROM public.inventory_batches
      WHERE "inventoryItemId" = p_item_id AND is_deleted = false
      ORDER BY "expiryDate" DESC, id DESC
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        UPDATE public.inventory_batches
        SET "quantityRemaining" = "quantityRemaining" + p_qty_delta,
            updated_at = now()
        WHERE id = v_newest_id;
      END IF;
    END IF;

    -- Batch totals are the source of truth: recompute inventory.stock.
    SELECT COALESCE(sum("quantityRemaining"), 0) INTO v_total
    FROM public.inventory_batches
    WHERE "inventoryItemId" = p_item_id AND is_deleted = false;

    -- expiry/lot follow the soonest-expiring active batch, else NULL.
    v_expiry := NULL;
    v_lot := NULL;
    SELECT "expiryDate", "lotNumber" INTO v_expiry, v_lot
    FROM public.inventory_batches
    WHERE "inventoryItemId" = p_item_id
      AND is_deleted = false
      AND "quantityRemaining" > 0
    ORDER BY "expiryDate" ASC, id ASC
    LIMIT 1;

    UPDATE public.inventory
    SET stock = v_total,
        "expiryDate" = v_expiry,
        "lotNumber" = v_lot,
        updated_at = now()
    WHERE id = p_item_id;

    RETURN v_total;
  END IF;

  -- No batches: manual-stock item. The inventory row is already locked above, so
  -- v_item_stock is the live availability. Reject an oversell before any update.
  IF p_qty_delta < 0 AND (v_item_stock + p_qty_delta) < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: item=%, requested=%, available=%',
      p_item_id, abs(p_qty_delta), v_item_stock;
  END IF;
  v_item_stock := v_item_stock + p_qty_delta;
  UPDATE public.inventory
  SET stock = v_item_stock,
      updated_at = now()
  WHERE id = p_item_id;
  RETURN v_item_stock;
END;
$$;
CREATE OR REPLACE FUNCTION public.close_shift_and_reconcile(
  p_shift_id uuid,
  p_actual_cash_cents numeric,
  p_expected_cash_cents numeric,
  p_discrepancy_cents numeric,
  p_notes text,
  p_reconciliation jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_recon_id uuid;
  v_now_iso text := to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_is_open boolean;
BEGIN
  -- ---- validate before any mutation ----
  IF p_shift_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SHIFT_ID';
  END IF;
  IF p_reconciliation IS NULL OR jsonb_typeof(p_reconciliation) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_PAYLOAD';
  END IF;
  IF NULLIF(p_reconciliation->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_ID';
  END IF;
  BEGIN
    v_recon_id := (p_reconciliation->>'id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_RECONCILIATION_ID';
  END;

  -- Lock the target shift row and read its state. The lock serializes concurrent
  -- calls so only one can proceed past the isOpen check to insert a reconciliation.
  SELECT "isOpen" INTO v_is_open
  FROM public.shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SHIFT_NOT_FOUND: %', p_shift_id;
  END IF;

  -- Idempotent: a retry/concurrent call after the shift is already closed does NOT
  -- re-close it and does NOT insert a second reconciliation.
  IF v_is_open = false THEN
    RETURN jsonb_build_object(
      'shift_id', p_shift_id,
      'already_closed', true,
      'reconciliation_id', NULL
    );
  END IF;

  -- 1) Close the shift (mirrors the previous closeShift update exactly).
  UPDATE public.shifts SET
    "endTime"            = v_now_iso,
    "expectedCashCents"  = round(p_expected_cash_cents),
    "actualCashCents"    = round(p_actual_cash_cents),
    "discrepancyCents"   = round(p_discrepancy_cents),
    notes                = COALESCE(NULLIF(p_notes, ''), 'Shift closed'),
    "isOpen"             = false,
    actual_cash          = round(p_actual_cash_cents) / 100.0,
    discrepancy_reason   = COALESCE(p_notes, ''),
    updated_at           = now()
  WHERE id = p_shift_id;

  -- 2) Insert the reconciliation row. Same columns the prior upsert wrote;
  --    updated_at / is_deleted / _dirty use their column defaults, as before.
  INSERT INTO public.shift_reconciliations
    (id, "timestamp", "userId", "userName", "openingFloat", "cashSales",
     "expectedClosing", "actualClosing", discrepancy, status)
  VALUES (
    v_recon_id,
    p_reconciliation->>'timestamp',
    p_reconciliation->>'userId',
    p_reconciliation->>'userName',
    (p_reconciliation->>'openingFloat')::numeric,
    (p_reconciliation->>'cashSales')::numeric,
    (p_reconciliation->>'expectedClosing')::numeric,
    (p_reconciliation->>'actualClosing')::numeric,
    (p_reconciliation->>'discrepancy')::numeric,
    p_reconciliation->>'status'
  );

  RETURN jsonb_build_object(
    'shift_id', p_shift_id,
    'already_closed', false,
    'reconciliation_id', v_recon_id
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.commit_checkout_invoice_and_stock(
  p_invoice jsonb,
  p_stock_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_full jsonb;
  v_inserted integer;
  v_item jsonb;
  v_item_id uuid;
  v_qty numeric;
  v_remaining numeric;
  v_stock jsonb := '{}'::jsonb;
  v_appt text;
BEGIN
  -- ---- validate invoice payload (before any mutation) ----
  IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_INVOICE_PAYLOAD';
  END IF;
  IF NULLIF(p_invoice->>'id', '') IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END IF;
  BEGIN
    v_invoice_id := (p_invoice->>'id')::uuid;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END;

  -- ---- validate stock items (before any mutation) ----
  IF p_stock_items IS NULL OR jsonb_typeof(p_stock_items) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_STOCK_ITEMS';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
    IF NULLIF(v_item->>'item_id', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_STOCK_ITEM_ID';
    END IF;
    BEGIN
      PERFORM (v_item->>'item_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_STOCK_ITEM_ID';
    END;
    IF (v_item->>'qty') IS NULL THEN
      RAISE EXCEPTION 'INVALID_STOCK_QTY';
    END IF;
    v_qty := (v_item->>'qty')::numeric;
    IF v_qty <= 0 OR v_qty <> floor(v_qty) THEN
      RAISE EXCEPTION 'INVALID_STOCK_QTY';
    END IF;
  END LOOP;

  -- ---- idempotent invoice insert ----
  -- Merge server defaults for NOT NULL columns the invoice payload omits
  -- (updated_at, is_deleted, _dirty, created_at); the payload overrides them
  -- if present. This mirrors PostgREST default-filling for absent keys.
  v_full := jsonb_build_object(
    'is_deleted', false,
    '_dirty', false,
    'created_at', now(),
    'updated_at', now()
  ) || p_invoice;

  INSERT INTO public.invoices
  SELECT * FROM jsonb_populate_record(null::public.invoices, v_full)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    -- Already committed by a prior (possibly lost) response: do NOT re-decrement.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
      v_item_id := (v_item->>'item_id')::uuid;
      SELECT stock INTO v_remaining FROM public.inventory WHERE id = v_item_id;
      v_stock := v_stock || jsonb_build_object(v_item_id::text, v_remaining);
    END LOOP;
    RETURN jsonb_build_object(
      'invoice_id', v_invoice_id,
      'already_committed', true,
      'remaining_stock', v_stock
    );
  END IF;

  -- ---- newly inserted: mirror upsertInvoice's appointment cascade ----
  v_appt := NULLIF(v_full->>'appointmentId', '');
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments
    SET status = CASE WHEN (v_full->>'paymentStatus') = 'void' THEN 'booked' ELSE 'completed' END
    WHERE id = v_appt::uuid;
  END IF;

  -- ---- decrement every requested stock item via the existing FEFO RPC ----
  -- A failure here (e.g. ITEM_NOT_FOUND) raises and rolls back the invoice too.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_stock_items) LOOP
    v_item_id := (v_item->>'item_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_remaining := public.atomic_stock_decrement(v_item_id, (-v_qty)::integer);
    v_stock := v_stock || jsonb_build_object(v_item_id::text, v_remaining);
  END LOOP;

  RETURN jsonb_build_object(
    'invoice_id', v_invoice_id,
    'already_committed', false,
    'remaining_stock', v_stock
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.void_invoice_and_reverse_revenue(
  p_invoice_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_cash integer;
  v_card integer;
  v_bank integer;
  v_appt text;
  v_was_paid boolean;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_remaining numeric;
  v_restocked jsonb := '{}'::jsonb;
BEGIN
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INVOICE_ID';
  END IF;

  -- Lock the invoice first so retries / concurrent voids serialize on this row.
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: %', p_invoice_id;
  END IF;

  -- Idempotent: already void -> touch nothing (no second restock / reversal /
  -- appointment / state change).
  IF v_inv."paymentStatus" = 'void' THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'already_void', true,
                             'reversed', false, 'restocked', '{}'::jsonb);
  END IF;

  v_was_paid := (v_inv."paymentStatus" = 'paid');

  -- A newly-voided PAID invoice must carry a valid shiftId; fail rather than
  -- silently losing the revenue reversal.
  IF v_was_paid THEN
    IF NULLIF(v_inv."shiftId", '') IS NULL THEN
      RAISE EXCEPTION 'MISSING_SHIFT_ID_FOR_PAID_INVOICE: %', p_invoice_id;
    END IF;
    BEGIN
      PERFORM (v_inv."shiftId")::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'INVALID_SHIFT_ID_FOR_PAID_INVOICE: %', v_inv."shiftId";
    END;
  END IF;

  -- 1) Restore stock for non-service line items in THIS transaction, using the same
  --    primitive checkout used (positive delta = restock). All-or-nothing.
  IF jsonb_typeof(v_inv.items) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_inv.items) LOOP
      IF COALESCE(v_item->>'category', '') NOT IN ('service', 'lab_service')
         AND NULLIF(v_item->>'itemId', '') IS NOT NULL THEN
        v_item_id := (v_item->>'itemId')::uuid;
        v_qty := round(COALESCE((v_item->>'quantity')::numeric, 0))::integer;
        IF v_qty > 0 THEN
          v_remaining := public.atomic_stock_decrement(v_item_id, v_qty);
          v_restocked := v_restocked || jsonb_build_object(v_item_id::text, v_remaining);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- 2) Mark the invoice void.
  UPDATE public.invoices SET "paymentStatus" = 'void', updated_at = now() WHERE id = p_invoice_id;

  -- 3) Revert the linked appointment to 'booked' (preserved cascade).
  v_appt := NULLIF(v_inv."appointmentId", '');
  IF v_appt IS NOT NULL THEN
    UPDATE public.appointments SET status = 'booked' WHERE id = v_appt::uuid;
  END IF;

  -- 4) Reverse the exact shift revenue exactly once (paid only; shiftId validated above).
  IF v_was_paid THEN
    SELECT * INTO v_cash, v_card, v_bank FROM public._invoice_method_cents(to_jsonb(v_inv));
    PERFORM public.apply_shift_revenue(v_inv."shiftId"::uuid, -v_cash, -v_card, -v_bank);
  END IF;

  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'already_void', false,
                           'reversed', v_was_paid, 'restocked', v_restocked);
END;
$$;
CREATE OR REPLACE FUNCTION public.auto_cancel_expired_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Perform update targeting the appointments table (mapping fuzzy intent visit_date to date)
  UPDATE public.appointments
  SET status = 'cancelled'
  WHERE status = 'booked'
    AND date::date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Insert telemetry entry into system_alerts table
  INSERT INTO public.system_alerts (severity, category, message, timestamp, read)
  VALUES (
    'info',
    'appointment',
    'Automated Appointment Expiry Sweeper executed: ' || v_count || ' expired bookings auto-cancelled.',
    to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    false
  );

  -- Notify cache invalidation so postgrest has new data
  NOTIFY pgrst, 'reload schema';
END;
$$;

-- Destructive maintenance helper is retained only so early hardening migrations can revoke it.

create or replace function public.wipe_all_tables()

returns text

language plpgsql

security definer

set search_path = public

as $$

begin

  delete from public.appointments;

  delete from public.boarding_records;

  delete from public.cash_adjustments;

  delete from public.clients;

  delete from public.clinic_queue;

  delete from public.grooming_logs;

  delete from public.inventory;

  delete from public.inventory_batches;

  delete from public.invoices;

  delete from public.lab_results;

  delete from public.medical_records;

  delete from public.notifications;

  delete from public.pets;

  delete from public.shift_reconciliations;

  delete from public.shifts;

  delete from public.suppliers;

  delete from public.system_alerts;

  delete from public.users;

  delete from public.vaccinations;

  return wiped;

end;

$$;
