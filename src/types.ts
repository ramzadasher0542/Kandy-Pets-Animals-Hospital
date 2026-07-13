/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'veterinarian' | 'cashier' | 'owner' | 'dummy_admin';

export interface User { id: string; name: string; username: string; role: UserRole; avatarColor: string; pin?: string; }

export type ItemCategory = 'retail' | 'prescription' | 'lab_service' | 'service' | 'vaccine' | 'food';

// PHASE 2 PREP: Added labParameters to support Dynamic Test Categories
export interface InventoryItem { 
  id: string; 
  sku: string; 
  name: string; 
  category: ItemCategory; 
  price: number; 
  cost: number; 
  stock: number; 
  minStock: number; 
  unit: string; 
  location?: string;
  labParameters?: Array<{ name: string; referenceRange: string; unit: string }>;
  // expiryDate and lotNumber now represent the SOONEST-EXPIRING active batch for convenience.
  // Do NOT rely on these as the single source of truth for items with multiple batches.
  expiryDate?: string;
  lotNumber?: string;
  is_deleted?: boolean;
}

export interface InventoryBatch {
  id: string;
  inventoryItemId: string;
  lotNumber: string;
  expiryDate: string;        // ISO date
  quantityReceived: number;
  quantityRemaining: number;
  receivedDate: string;      // ISO date
  supplier?: string;
  costPerUnit?: number;      // cents — actual cost for this batch
  created_at: string; 
  updated_at: string;
  is_deleted: boolean; 
  _dirty: boolean;
}

export type AppointmentStatus = 'booked' | 'in-progress' | 'completed' | 'cancelled';
export type QueueStatus = 'scheduled' | 'active' | 'completed';
export type PetClassification = 'Canine' | 'Feline' | 'Avian' | 'Reptile' | 'Small Mammal' | 'Exotic' | 'Other';

export interface ClinicQueueItem {
  id: string;
  petId: string;
  petName: string;
  ownerName: string;
  ownerPhone: string;
  appointmentId: string;
  serviceType: string;
  checkInTime: string;
  status: QueueStatus;
  priority?: number;
  assignedVet?: string;
  prescribedMeds?: Array<{ itemId: string; name: string; quantity: number }>;
  urgency?: 'routine' | 'non-emergency' | 'emergency';
  emergencyBackfillRequired?: boolean;
}

// PHASE 1: Added weight and sex as native first-class citizens
export interface Appointment { 
  id: string; 
  aptNumber?: string; 
  petName: string; 
  petType: PetClassification; 
  breed: string; 
  weight?: number;
  sex?: string;
  age?: string;
  ownerName: string; 
  ownerPhone: string; 
  alternatePhone?: string;
  ownerEmail?: string; 
  address?: string;
  date: string; 
  time: string; 
  veterinarian: string; 
  reason: string; 
  status: AppointmentStatus; 
  urgency?: 'routine' | 'non-emergency' | 'emergency';
  emergencyBackfillRequired?: boolean;
  admissionType?: 'OPD' | 'Pet Boarding' | 'Hospital Admission' | 'Vaccination' | 'Grooming Salon'; 
  assignedVet?: string; 
  created_at?: string; 
  updated_at?: string; 
  is_deleted?: boolean; 
  surgeryChecklist?: {
    fastingStartTime?: string;
    rabiesProof: boolean;
    dhlpProof: boolean;
    fleaTickUpToDate: boolean;
  };
}

export interface Pet {
  id: string;
  clientId: string;
  name: string;
  petType: PetClassification;
  breed: string;
  weight: number;
  sex: string;
  age: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  recordIds?: string[];
  vaccineIds?: string[];
  labIds?: string[];
  groomingIds?: string[];
  boardingIds?: string[];
}

export interface Vaccination { id: string; petId: string; itemId: string; name: string; price: number; billed: boolean; dateAdministered: string; nextDueDate: string; status: 'active' | 'overdue' | 'due-soon'; created_at?: string; updated_at?: string; is_deleted?: boolean; }
export interface LabResult { id: string; petId: string; testName: string; requestDate: string; resultDate?: string; status: 'pending' | 'completed' | 'urgent'; value?: string; referenceRange?: string; notes?: string; billingItems?: any[]; billed?: boolean; created_at?: string; updated_at?: string; is_deleted?: boolean; }
export interface InpatientLog { id: string; date: string; time: string; temperature?: string; treatment: string; route?: 'IV' | 'IM' | 'SC' | 'Oral' | 'Suppository'; frequency?: 'TDS' | 'BD' | 'Noct' | 'Mane' | 'SOS' | 'Stat' | 'custom'; frequencyCustom?: string; remarks?: string; vetId: string; }
export interface GroomingLog { id: string; petId: string; date: string; services: string[]; totalBilled: number; status: 'pending' | 'completed'; billingItems?: any[]; billed?: boolean; created_at?: string; updated_at?: string; is_deleted?: boolean; groomingInstructions?: { bathe: boolean; fullShave: boolean; trimOnly: boolean; nailClip: boolean; earClean: boolean; deShed: boolean; customNotes?: string; }; consentSignature?: string; consentTimestamp?: string; consentOwnerName?: string; }
export interface BoardingRecord { id: string; petId: string; cageNumber: string; checkInDate: string; expectedCheckOut: string; status: 'active' | 'discharged'; foodType: 'without_food' | 'with_food'; medicalBoarding: boolean; depositPaid: boolean; hospitalProvidesLitter?: boolean; billingItems?: any[]; billed?: boolean; feedingPlan?: { inventoryItemId: string; itemName: string; quantityPerMeal: number; mealsPerDay: number; }; estimatedStayDays?: number; depositAmountCents?: number; totalChargesCents?: number; cageFeePerDayCents?: number; cleaningFeePerDayCents?: number; doctorFeePerVisitCents?: number; created_at?: string; updated_at?: string; is_deleted?: boolean; }

// ============================================================================
// PHASE 1: ENTERPRISE EHR MATRIX
// ============================================================================

export interface Vitals {
  temperature?: number;
  pulse?: number;
  respiration?: number;
  crt?: string;
  mucousMembrane?: string;
  hydration?: string;
  bcs?: number;
}

export interface PatientHistory {
  duration?: string;
  progression?: string;
  diet?: string[];
  vaccinationStatus?: string;
  dewormingStatus?: string;
  previousMedicalHistory?: string[];
  currentMedications?: string[];
}

export interface SystemicExam {
  isNormal: boolean;
  notes?: string;
  abnormalities?: string[];
}

export interface PhysicalExamination {
  general: SystemicExam;
  gastrointestinal: SystemicExam;
  respiratory: SystemicExam;
  cardiovascular: SystemicExam;
  urogenital: SystemicExam;
  skin: SystemicExam;
  musculoskeletal: SystemicExam;
  neurological: SystemicExam;
  reproductive: SystemicExam;
  eyesAndEars: SystemicExam;
}

export interface ClinicalAssessment {
  diagnosisType?: 'Tentative' | 'Definitive';
  severity?: 'Mild' | 'Moderate' | 'Severe' | 'Critical';
  status?: 'Stable' | 'Unstable';
  prognosis?: 'Good' | 'Guarded' | 'Poor';
  notes?: string;
}

// PHASE 1: Added native sex property alongside weight
export interface MedicalRecord { 
  id: string; 
  patientId: string; 
  ownerName: string; 
  ownerPhone: string; 
  ownerEmail: string; 
  visitDate: string; 
  
  vitals?: Vitals;
  patientHistory?: PatientHistory;
  physicalExam?: PhysicalExamination;
  assessment?: ClinicalAssessment;
  diagnosticPlan?: string[]; 
  monitoringPlan?: string[];

  subjectiveTags?: string[]; 
  symptoms: string; 
  objectiveFindings?: Record<string, { isNormal: boolean; notes: string }>; 
  diagnosis: string; 
  treatmentNotes: string; 
  prescribedMeds: Array<{ itemId: string; name: string; dosage: string; quantity: number; frequency?: string; duration?: string; instructions?: string; }>; 
  inpatientLogs?: InpatientLog[]; 
  createdDate: string; 
  attendingVet?: string; 
  appointmentId?: string; 
  followUpDate?: string;
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
}

export interface InvoiceItem { itemId: string; sku: string; name: string; category: ItemCategory; quantity: number; unitPrice: number; totalPrice: number; }

export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'e_wallet' | 'deposit' | 'split';

export interface ActiveShift { id: string; openedAt: string; openedBy: string; openedByName: string; openingFloat: number; }
export interface ShiftReconciliation { id: string; timestamp: string; userId: string; userName: string; openingFloat: number; cashSales: number; expectedClosing: number; actualClosing: number; discrepancy: number; status: 'balanced' | 'discrepancy'; }

export interface Shift { id: string; openedBy: string; startTime: string; endTime?: string; openingFloatCents: number; cashCollectedCents: number; cardCollectedCents: number; bankTransferCollectedCents: number; expectedCashCents?: number; actualCashCents?: number; discrepancyCents?: number; notes?: string; isOpen: boolean; opening_float: number; actual_cash: number | null; discrepancy_reason: string; created_at: string; updated_at: string; is_deleted: boolean; }

export interface Invoice { id: string; appointmentId?: string; patientId: string; petName: string; ownerName: string; ownerPhone: string; date: string; items: InvoiceItem[]; subtotal: number; tax: number; discount: number; sales_total: number; cogs?: number; profit?: number; paymentMethod?: PaymentMethod; splitPayments?: Array<{ method: PaymentMethod; amount: number }>; paymentStatus: 'unpaid' | 'paid' | 'void'; depositHeld?: number; createdBy: string; shiftId?: string; notes?: string; }

export interface ClientNotification { id: string; petName: string; ownerName: string; recipient: string; type: 'appointment_reminder' | 'vaccine_alert' | 'followup' | 'lab_result'; channel: 'sms' | 'email' | 'push'; message: string; scheduledTime: string; status: 'queued' | 'sent' | 'failed'; }
export interface SystemAlert { id: string; severity: 'info' | 'warning' | 'urgent'; category: 'inventory' | 'appointment' | 'system' | 'lab'; message: string; timestamp: string; read: boolean; }
export interface OfflineSyncItem { id: string; action: 'create_appointment' | 'create_invoice' | 'update_medical_record' | 'delete_medical_record' | 'checkout_pos' | 'update_stock' | 'add_inventory' | 'create_alert' | 'create_notification'; collection: 'appointments' | 'invoices' | 'records' | 'inventory' | 'alerts' | 'notifications'; payload: any; timestamp: string; }

export const CATEGORY_DISPLAY_MAP: Record<string, string> = { 'service': 'Clinical Care', 'lab_service': 'Labs & Diagnostics', 'vaccine': 'Vaccinations', 'prescription': 'Pharmacy Rx', 'retail': 'Pet Supplies Shop', 'food': 'Food & Feeding', 'Taxes & Adjustments': 'Taxes & Adjustments', 'other': 'Other / Uncategorized' };

export interface Client { client_id: string; primary_phone: string; alternate_phone?: string; full_name: string; email_address: string; physical_address: string; communication_preference: 'sms' | 'email' | 'both' | 'none'; account_balance: number; lifetime_value: number; client_status: 'active' | 'inactive' | 'flagged_bad_debt'; administrative_notes: string; created_at?: string; updated_at?: string; is_deleted?: boolean; petIds?: string[]; }

export interface StaffProfile {
  id: string;
  userId?: string;           // optional link to a User login account
  fullName: string;
  position: string;          // job title e.g. "Head Veterinarian"
  department: string;        // e.g. "Clinical", "Grooming", "Admin"
  employmentType: 'hourly' | 'monthly';
  hourlyRate?: number;       // cents, only if hourly
  monthlySalary?: number;    // cents, only if monthly
  hireDate: string;          // ISO date string
  active: boolean;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  _dirty: boolean;
}

export interface TimeEntry {
  id: string;
  staffId: string;           // StaffProfile.id
  date: string;              // ISO date string YYYY-MM-DD
  clockIn: string;           // ISO datetime string (full timestamp)
  clockOut?: string;         // ISO datetime string, undefined if still clocked in
  durationMinutes?: number;  // computed on clockOut, stored for easy payroll math
  enteredBy: string;         // User.id of who logged this entry
  source: 'self' | 'manager';
  notes?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  _dirty: boolean;
}

export interface ScheduleEntry {
  id: string;
  staffId: string;           // StaffProfile.id
  shiftStart: string;        // ISO datetime — full timestamp, NOT time-of-day only
  shiftEnd: string;          // ISO datetime — handles overnight shifts correctly
  role: string;              // capacity e.g. "Vet on Call", "Cashier", "Groomer"
  notes?: string;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  _dirty: boolean;
}

export interface PayslipDeduction {
  label: string;             // e.g. "Advance", "EPF", "Uniform"
  amountCents: number;
}

export interface Payslip {
  id: string;
  staffId: string;           // StaffProfile.id
  periodStart: string;       // ISO date string
  periodEnd: string;         // ISO date string
  grossPayCents: number;     // computed from TimeEntry sum (hourly) or monthlySalary
  deductions: PayslipDeduction[];
  netPayCents: number;       // grossPayCents minus sum of deductions
  status: 'draft' | 'finalized' | 'paid';
  generatedBy: string;       // User.id
  generatedAt: string;       // ISO datetime
  paidAt?: string;           // ISO datetime, only when status = 'paid'
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
  _dirty: boolean;
}

// F-3: Audit trail for soft-deletions of clients and pets. Every deletion is
// logged here for owner oversight; financial/clinical records are never touched.
export interface DeletionAudit {
  id: string;
  entity_type: 'client' | 'pet';
  entity_id: string;
  entity_name?: string;
  deleted_by: string;              // User.name of the operator
  deleted_at: string;              // ISO datetime
  had_history?: boolean;           // did it have linked records?
  history_summary?: string;        // e.g. "3 invoices, 2 medical records"
  override_confirmed?: boolean;    // did the operator confirm the history override?
  created_at?: string;
  updated_at?: string;
  is_deleted?: boolean;
  _dirty?: boolean;
}