/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'admin' | 'veterinarian' | 'cashier' | 'owner' | 'dummy_admin';

export interface User { id: string; name: string; username: string; role: UserRole; avatarColor: string; pin?: string; }

export type ItemCategory = 'retail' | 'prescription' | 'lab_service' | 'service' | 'vaccine';

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
  assignedVet?: string;
  prescribedMeds?: Array<{ itemId: string; name: string; quantity: number }>;
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
  ownerName: string; 
  ownerPhone: string; 
  ownerEmail?: string; 
  date: string; 
  time: string; 
  veterinarian: string; 
  reason: string; 
  status: AppointmentStatus; 
  admissionType?: 'OPD' | 'Pet Boarding' | 'Hospital Admission' | 'Vaccination'; 
  assignedVet?: string; 
  created_at?: string; 
  updated_at?: string; 
  is_deleted?: boolean; 
}

export interface Vaccination { itemId: string; name: string; price: number; billed: boolean; dateAdministered: string; nextDueDate: string; status: 'active' | 'overdue' | 'due-soon'; }
export interface LabResult { id: string; testName: string; requestDate: string; resultDate?: string; status: 'pending' | 'completed' | 'urgent'; value?: string; referenceRange?: string; notes?: string; }
export interface InpatientLog { id: string; date: string; time: string; temperature?: string; treatment: string; route?: string; frequency?: string; remarks?: string; vetId: string; }
export interface GroomingLog { id: string; date: string; services: string[]; totalBilled: number; status: 'pending' | 'completed'; }
export interface BoardingRecord { id: string; cageNumber: string; checkInDate: string; expectedCheckOut: string; status: 'active' | 'discharged'; foodType: 'without_food' | 'with_food'; medicalBoarding: boolean; depositPaid: boolean; }

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
  petName: string; 
  petType: PetClassification; 
  breed: string; 
  age: string; 
  weight: number; 
  sex?: string;
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
  prescribedMeds: Array<{ itemId: string; name: string; dosage: string; quantity: number }>; 
  vaccinations: Vaccination[]; 
  labResults: LabResult[]; 
  inpatientLogs?: InpatientLog[]; 
  groomingRecords?: GroomingLog[]; 
  boardingInfo?: BoardingRecord; 
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

export const CATEGORY_DISPLAY_MAP: Record<string, string> = { 'service': 'Clinical Care', 'lab_service': 'Labs & Diagnostics', 'vaccine': 'Vaccinations', 'prescription': 'Pharmacy Rx', 'retail': 'Pet Supplies Shop', 'Taxes & Adjustments': 'Taxes & Adjustments', 'other': 'Other / Uncategorized' };

export interface Client { client_id: string; primary_phone: string; alternate_phone?: string; full_name: string; email_address: string; physical_address: string; communication_preference: 'sms' | 'email' | 'both' | 'none'; account_balance: number; lifetime_value: number; client_status: 'active' | 'inactive' | 'flagged_bad_debt'; administrative_notes: string; created_at?: string; updated_at?: string; is_deleted?: boolean; }