/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { requireSupabase, supabase } from './supabase';
import { globalMutex } from './mutex';
import { formatDisplayDate, formatDisplayTime } from '../utils/time';
import {
  InventoryItem,
  Appointment,
  MedicalRecord,
  Invoice,
  ClientNotification,
  User,
  SystemAlert,
  Shift,
  Client,
  PaymentMethod,
  ClinicQueueItem,
  Pet,
  Vaccination,
  LabResult,
  GroomingLog,
  BoardingRecord,
  InventoryBatch,
  Supplier,
  InventoryCategory,
  ShiftReconciliation,
  Clinic,
  ClinicSettings
} from '../types';
import { SystemConfig } from '../components/SystemSettings';

const cloudUnavailable = () => new Error('Cloud data is unavailable. Check your connection and try again.');

function cloud() {
  try {
    return requireSupabase();
  } catch {
    throw cloudUnavailable();
  }
}

let currentClinicId: string | null = null;

/** Keep the authenticated clinic in memory so every write uses the same scope. */
export function setCurrentClinicId(clinicId: string | null | undefined): void {
  currentClinicId = clinicId || null;
}

export function withCurrentClinicId<T extends object>(payload: T): T & { clinic_id: string } {
  if (!currentClinicId) throw new Error('No clinic is assigned to the current user.');
  return { ...payload, clinic_id: currentClinicId };
}

const defaultClinicSettings = (clinicId: string): ClinicSettings => ({
  clinicId,
  taxEnabled: true,
  groomingEnabled: true,
  boardingEnabled: true,
});

function mapClinicSettings(row: any, clinicId: string): ClinicSettings {
  return {
    clinicId,
    taxEnabled: row?.tax_enabled ?? true,
    groomingEnabled: row?.grooming_enabled ?? true,
    boardingEnabled: row?.boarding_enabled ?? true,
  };
}

export async function fetchClinics(): Promise<Clinic[]> {
  const { data, error } = await cloud()
    .from('clinics')
    .select('id, name, address, phone, created_at')
    .order('name');
  if (error) throw error;
  return (data || []) as Clinic[];
}

export async function fetchClinicSettings(clinicId: string): Promise<ClinicSettings> {
  if (!clinicId) throw new Error('A clinic is required to load clinic settings.');
  const { data, error } = await cloud()
    .from('clinic_settings')
    .select('clinic_id, tax_enabled, grooming_enabled, boarding_enabled')
    .eq('clinic_id', clinicId)
    .maybeSingle();
  if (error) throw error;
  return mapClinicSettings(data, clinicId);
}

export async function fetchAllClinicSettings(): Promise<ClinicSettings[]> {
  const { data, error } = await cloud()
    .from('clinic_settings')
    .select('clinic_id, tax_enabled, grooming_enabled, boarding_enabled');
  if (error) throw error;
  return (data || []).map((row: any) => mapClinicSettings(row, row.clinic_id));
}

export async function upsertClinicSettings(settings: ClinicSettings): Promise<void> {
  const { error } = await cloud().from('clinic_settings').upsert({
    clinic_id: settings.clinicId,
    tax_enabled: settings.taxEnabled,
    grooming_enabled: settings.groomingEnabled,
    boarding_enabled: settings.boardingEnabled,
  }, { onConflict: 'clinic_id' });
  if (error) throw error;
}

export async function createClinic(input: Pick<Clinic, 'name' | 'address' | 'phone'>): Promise<Clinic> {
  const name = input.name.trim();
  if (!name) throw new Error('Clinic name is required.');
  const { data, error } = await cloud()
    .from('clinics')
    .insert({ name, address: input.address?.trim() || null, phone: input.phone?.trim() || null })
    .select('id, name, address, phone, created_at')
    .single();
  if (error) throw error;
  const clinic = data as Clinic;
  await upsertClinicSettings(defaultClinicSettings(clinic.id));
  return clinic;
}

// ==========================================
// INVENTORY (DELTA UPDATES)
// ==========================================
export async function fetchInventory(): Promise<InventoryItem[]> {
  const client = cloud();
  const { data, error } = await client.from('inventory').select('*');
  if (error) throw error;
  const items = (data || []) as InventoryItem[];
  return items.filter(i => !(i as any).is_deleted);
}

export async function fetchInventoryBatches(): Promise<InventoryBatch[]> {
  const client = cloud();
  const { data, error } = await client.from('inventory_batches').select('*');
  if (error) throw error;
  return (data || []).filter((b: any) => !b.is_deleted);
}

export async function upsertInventoryItem(item: InventoryItem): Promise<void> {
  if (!item) return;

  const client = cloud();

  // SKU duplicate check against Supabase (excludes this item, so edits pass).
  if (item.sku) {
    const { data: skuData, error: skuError } = await client
      .from('inventory')
      .select('id')
      .eq('sku', item.sku)
      .neq('id', item.id)
      .maybeSingle();
    if (skuError) throw skuError;
    if (skuData) throw new Error('DUPLICATE_SKU: An item with this SKU already exists.');
  }

  // If it's a service, wipe stock bounds logically
  if (item.category === 'lab_service' || item.category === 'service') {
    item.stock = 0;
    item.minStock = 0;
  }

  const { error } = await client.from('inventory').upsert(withCurrentClinicId(item));
  if (error) throw error;
}

/**
 * Recompute an item's stock (and soonest expiry/lot) from the sum of its batch
 * quantities, so item.stock and batch totals never drift for batch-tracked items.
 *
 * HYBRID MODEL GUARD: this app also has manual/seeded stock with NO batches.
 * If the item has zero batches, we DO NOT touch item.stock (summing zero batches
 * would wrongly zero out a manually-stocked item) — we return its current stock
 * unchanged. Only items that actually have batches are recomputed from them.
 *
 * Returns the item's resulting stock level.
 */
async function recomputeItemStockFromBatches(itemId: string): Promise<number> {
  const client = cloud();
  const { data: batchData, error: batchError } = await client
    .from('inventory_batches')
    .select('*')
    .eq('inventoryItemId', itemId);
  if (batchError) throw batchError;
  const batches = (batchData || []).filter((b: any) => !b.is_deleted);

  // Sum all non-deleted batches for this item.
  const total = batches.reduce((sum: number, b: any) => sum + b.quantityRemaining, 0);

  // No batches → manual-stock item; leave item.stock exactly as-is.
  if (batches.length === 0) {
    const { data: itemData, error: itemError } = await client
      .from('inventory')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!itemData) return total;
    return (itemData as any).stock;
  }

  // Point expiry/lot at the soonest-expiring active batch.
  const activeBatches = batches
    .filter((b: any) => b.quantityRemaining > 0)
    .sort((a: any, b: any) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
  const expiryDate = activeBatches.length > 0 ? activeBatches[0].expiryDate : null;
  const lotNumber = activeBatches.length > 0 ? activeBatches[0].lotNumber : null;

  // Save to Supabase.
  const { error } = await client
    .from('inventory')
    .update({ stock: total, expiryDate, lotNumber })
    .eq('id', itemId);
  if (error) throw error;

  return total;
}

export async function upsertInventoryBatch(batch: InventoryBatch): Promise<void> {
  if (!batch || !batch.id) return;
  const client = cloud();
  const { error } = await client.from('inventory_batches').upsert(withCurrentClinicId(batch));
  if (error) throw error;
  // Keep item.stock in sync with the batch totals for this item.
  await recomputeItemStockFromBatches(batch.inventoryItemId);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (!id) return;
  const client = cloud();

  // Soft delete batches first
  const { error: batchError } = await client
    .from('inventory_batches')
    .update({ is_deleted: true })
    .eq('inventoryItemId', id);
  if (batchError) throw batchError;

  // Soft delete inventory item
  const { error } = await client
    .from('inventory')
    .update({ is_deleted: true })
    .eq('id', id);
  if (error) throw error;
}

/**
 * AUDIT FIX: True atomic stock decrement — reads current stock from IndexedDB
 * (not stale React state), applies delta, and writes back.
 * Implements FEFO (First Expiry, First Out) batch consumption.
 */
export async function atomicStockDecrement(itemId: string, qtyDelta: number): Promise<number> {
  const unlock = await globalMutex.lock();
  try {
    const client = cloud();
    // Atomicity is now enforced by the Postgres RPC public.atomic_stock_decrement
    // (single transaction + FOR UPDATE row locks on the inventory row and affected
    // batches), not by this browser-only mutex. The RPC preserves the previous
    // semantics — FEFO consumption for negative deltas, newest-batch return for
    // positive deltas, manual-stock items without batches, soft-deleted batches
    // ignored, expiry/lot recomputed — and returns the resulting numeric stock.
    const { data, error } = await client.rpc('atomic_stock_decrement_auth', {
      p_item_id: itemId,
      p_qty_delta: qtyDelta,
    });
    if (error) throw error;
    return Number(data);
  } finally {
    unlock();
  }
}

// ==========================================
// APPOINTMENTS
// ==========================================
// includeDeleted=false (default) excludes soft-deleted rows — the normal read.
// Pass true ONLY where the caller must scan every appointment row (e.g. customer
// identity propagation across historical, possibly soft-deleted, appointments).
export async function fetchAppointments(days?: number, includeDeleted = false): Promise<Appointment[]> {
  if (!supabase) throw new Error('No internet connection');
  let query = supabase.from('appointments').select('*');
  if (days && days > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = formatDisplayDate(cutoff);
    query = query.gte('date', cutoffStr);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || [])
    .filter((value: any) => includeDeleted || !value.is_deleted)
    .sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`).getTime();
      const dateB = new Date(`${b.date}T${b.time}`).getTime();
      return dateB - dateA;
    });
}

export async function fetchHistoricalAppointmentsArchive(
  page = 0,
  limit = 50,
  search?: string
): Promise<{ appointments: Appointment[]; count: number }> {
  if (!supabase) throw cloudUnavailable();

  let query = supabase
    .from('appointments')
    .select('*', { count: 'exact' })
    .in('status', ['completed', 'cancelled', 'no-show'])
    .eq('is_deleted', false)
    .order('date', { ascending: false })
    .range(page * limit, (page + 1) * limit - 1);

  if (search && search.trim() !== '') {
    const term = search.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
      query = query.eq('date', term);
    } else {
      query = query.or(`petName.ilike.%${term}%,ownerName.ilike.%${term}%`);
    }
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { appointments: (data || []) as Appointment[], count: count || 0 };
}

export async function upsertAppointment(apt: Appointment): Promise<void> {
  if (!apt || !apt.id) return;
  const formattedApt = {
    ...apt,
    date: formatDisplayDate(apt.date),
    time: formatDisplayTime(apt.time)
  };
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('appointments').upsert(withCurrentClinicId(formattedApt));
  if (error) throw error;
}

// ==========================================
// USERS (staff login accounts)
// ==========================================

/**
 * Supabase `users` uses snake_case `avatar_color`; the app's User type uses
 * `avatarColor`. Map in both directions — never leak the raw column name.
 */
export async function fetchUsers(): Promise<User[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase.from('users').select('id, name, username, role, avatar_color, active, is_deleted, auth_user_id').eq('is_deleted', false);
  if (error) throw error;
  return (data || []).map((u: any) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    avatarColor: u.avatar_color || '',
    active: u.active ?? true
  }));
}

export async function upsertUser(user: User): Promise<void> {
  if (!user || !user.id) return;
  if (!supabase) throw new Error('No internet connection');
  const payload = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    avatar_color: user.avatarColor,
    active: user.active ?? true,
    is_deleted: false
  };
  const { error } = await supabase.from('users').upsert(withCurrentClinicId(payload));
  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('users').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

export async function fetchVeterinarians(): Promise<User[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, role, avatar_color, active, is_deleted, auth_user_id')
    .eq('role', 'veterinarian')
    .eq('active', true)
    .eq('is_deleted', false);
  if (error) throw error;
  const vets = (data || []).map((u: any) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    avatarColor: u.avatar_color || '',
    active: u.active ?? true
  }));
  if (vets.length === 0) {
    return [{ id: 'fallback-vet', name: 'Attending Doctor', username: 'attending', role: 'veterinarian', avatarColor: '', active: true }];
  }
  return vets.sort((a, b) => a.name.localeCompare(b.name));
}

// ==========================================
// STAFF OPERATIONS & AUDIT TRAILS
// ==========================================
export async function fetchStaffProfiles(): Promise<any[]> {
  const client = cloud();
  const { data, error } = await client.from('staff_profiles').select('*').eq('is_deleted', false);
  if (error) throw error;
  return data || [];
}

export async function upsertStaffProfile(profile: any): Promise<void> {
  if (!profile?.id) return;
  const { error } = await cloud().from('staff_profiles').upsert(withCurrentClinicId(profile));
  if (error) throw error;
}

export async function fetchTimeEntries(): Promise<any[]> {
  const { data, error } = await cloud().from('time_entries').select('*').eq('is_deleted', false);
  if (error) throw error;
  return data || [];
}

export async function upsertTimeEntry(entry: any): Promise<void> {
  if (!entry?.id) return;
  const { error } = await cloud().from('time_entries').upsert(withCurrentClinicId(entry));
  if (error) throw error;
}

export async function fetchScheduleEntries(): Promise<any[]> {
  const { data, error } = await cloud().from('schedule_entries').select('*').eq('is_deleted', false);
  if (error) throw error;
  return data || [];
}

export async function upsertScheduleEntry(entry: any): Promise<void> {
  if (!entry?.id) return;
  const { error } = await cloud().from('schedule_entries').upsert(withCurrentClinicId(entry));
  if (error) throw error;
}

export async function deleteScheduleEntry(id: string): Promise<void> {
  if (!id) return;
  const { error } = await cloud().from('schedule_entries').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

export async function fetchPayslips(): Promise<any[]> {
  const { data, error } = await cloud().from('payslips').select('*').eq('is_deleted', false);
  if (error) throw error;
  return data || [];
}

export async function upsertPayslip(payslip: any): Promise<void> {
  if (!payslip?.id) return;
  const { error } = await cloud().from('payslips').upsert(withCurrentClinicId(payslip));
  if (error) throw error;
}

export async function fetchDeletionAudits(): Promise<any[]> {
  const { data, error } = await cloud().from('deletion_audit').select('*').eq('is_deleted', false).order('deleted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function insertDeletionAudit(audit: any): Promise<void> {
  if (!audit?.id) return;
  const { error } = await cloud().from('deletion_audit').insert(withCurrentClinicId(audit));
  if (error) throw error;
}

export async function insertAuthAudit(audit: any): Promise<void> {
  if (!audit?.id) return;
  const { error } = await cloud().from('auth_audit').insert(withCurrentClinicId(audit));
  if (error) throw error;
}

// ==========================================
// MEDICAL RECORDS
// ==========================================
export async function fetchMedicalRecords(): Promise<MedicalRecord[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('medical_records').select('*');
  if (error) throw error;
  const records = (data || []) as MedicalRecord[];
  return records
    .filter(value => !(value as any).is_deleted)
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

export async function upsertMedicalRecord(rec: MedicalRecord): Promise<void> {
  if (!rec || !rec.id) return;
  const formattedRec = {
    ...rec,
    visitDate: formatDisplayDate(rec.visitDate)
  };
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('medical_records').upsert(withCurrentClinicId(formattedRec));
  if (error) throw error;
}

export async function deleteMedicalRecord(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('medical_records').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

// ==========================================
// INVOICES & AUTOMATION
// ==========================================
export async function fetchInvoices(): Promise<Invoice[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('invoices').select('*');
  if (error) throw error;
  // FIXED: Include ALL invoices (including voided) — let consumers handle filtering
  const invoices = (data || []) as Invoice[];
  return invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function upsertInvoice(inv: Invoice): Promise<void> {
  if (!inv || !inv.id) return;
  const formattedInv = {
    ...inv,
    date: formatDisplayDate(inv.date)
  };

  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('invoices').upsert(withCurrentClinicId(formattedInv));
  if (error) throw error;

  // Cross-module cascade: Auto-complete appointment
  if (inv.appointmentId && supabase) {
    const newStatus = inv.paymentStatus === 'void' ? 'booked' : 'completed';
    await supabase.from('appointments').update({ status: newStatus }).eq('id', inv.appointmentId);
  }
}

export interface CheckoutStockItem { item_id: string; qty: number; }
export interface CheckoutCommitResult {
  invoice_id: string;
  already_committed: boolean;
  remaining_stock: Record<string, number>;
  invoice?: Invoice;
}

export interface CheckoutEffectsResult {
  processed: boolean;
  already_processed?: boolean;
  no_effects?: boolean;
  invoice_id: string;
  client_id?: string | null;
  client_value_delta?: number;
  source_refs?: Array<{ type: 'vaccination' | 'grooming' | 'lab' | 'boarding'; id: string }>;
}

// Persists ONE checkout invoice and decrements ALL of its stock items in a single
// DB transaction via the commit_checkout_invoice_and_stock RPC. Catalog values,
// stock, shift revenue, appointment completion, and queue closure are server-owned;
// the remaining customer/source updates are recorded in a durable outbox.
// Idempotent by invoice id: a retry does not decrement stock or revenue again.
// The invoice `date` is pre-formatted exactly as upsertInvoice does so the stored
// representation is identical.
export async function commitCheckoutInvoiceAndStock(
  inv: Invoice,
  stockItems: CheckoutStockItem[]
): Promise<CheckoutCommitResult> {
  if (!inv || !inv.id) throw new Error('INVALID_INVOICE_ID');
  if (!supabase) throw new Error('No internet connection');
  const formattedInv = { ...inv, date: formatDisplayDate(inv.date) };
  const { data, error } = await supabase.rpc('commit_checkout_invoice_and_stock', {
    p_invoice: withCurrentClinicId(formattedInv),
    p_stock_items: stockItems,
  });
  if (error) throw error;
  const result = (data || {}) as Partial<CheckoutCommitResult>;
  return {
    invoice_id: result.invoice_id ?? inv.id,
    already_committed: !!result.already_committed,
    remaining_stock: result.remaining_stock ?? {},
    invoice: result.invoice,
  };
}

// Applies the durable client/source effects recorded by checkout. The RPC is
// idempotent, so a lost response can be retried without double-counting.
export async function processCheckoutEffects(invoiceId: string): Promise<CheckoutEffectsResult> {
  if (!supabase) throw new Error('No internet connection');
  if (!invoiceId) throw new Error('INVALID_INVOICE_ID');
  const { data, error } = await supabase.rpc('process_checkout_effects_auth', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return (data || { invoice_id: invoiceId, processed: false, no_effects: true }) as CheckoutEffectsResult;
}

export async function processPendingCheckoutEffects(): Promise<number> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.rpc('process_pending_checkout_effects_auth');
  if (error) throw error;
  return Number(data || 0);
}

// ==========================================
// NOTIFICATIONS
// ==========================================
export async function fetchNotifications(): Promise<ClientNotification[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase.from('notifications').select('*');
  if (error) throw error;
  const notifs = (data || []) as ClientNotification[];
  return notifs;
}

export async function upsertNotification(notif: ClientNotification): Promise<void> {
  if (!notif || typeof notif !== 'object' || !notif.id) {
    if (import.meta.env.DEV) console.warn('[CeylonPets POS] Rejected malformed or empty notification payload.');
    return;
  }
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('notifications').upsert(withCurrentClinicId(notif));
  if (error) throw error;
}

// ==========================================
// ALERTS
// ==========================================
export async function fetchAlerts(): Promise<SystemAlert[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase.from('system_alerts').select('*');
  if (error) throw error;
  return (data || []).filter((a: any) => !a.is_deleted);
}

export async function upsertAlert(alert: SystemAlert): Promise<void> {
  if (!alert || typeof alert !== 'object' || !alert.id) {
    if (import.meta.env.DEV) console.warn('[CeylonPets POS] Rejected malformed or empty system alert payload.');
    return;
  }
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('system_alerts').upsert(withCurrentClinicId(alert));
  if (error) throw error;
}

// ==========================================
// POS SHIFTS & FINANCIAL METRICS
// ==========================================
export interface ShiftMetrics {
  gross_sales: number;
  total_cogs?: number;
  cogs?: number;
  net_profit: number;
  category_breakdown: { category: string; total: number }[];
  payment_breakdown?: { method: string; total: number }[];
}

export async function fetchShiftMetrics(): Promise<ShiftMetrics | null> {
  const shiftId = await fetchActiveShiftId();
  
  if (!shiftId || shiftId === '0') {
     return {
      gross_sales: 0, total_cogs: 0, cogs: 0, net_profit: 0,
      category_breakdown: [{ category: 'service', total: 0 }, { category: 'retail', total: 0 }]
    };
  }

  let grossSales = 0;
  let totalCogs = 0;
  let clinicalRevenue = 0;
  let labRevenue = 0;
  let vaccineRevenue = 0;
  let prescriptionRevenue = 0;
  let retailRevenue = 0;

  // Read this shift's paid invoices from Supabase.
  if (!supabase) throw cloudUnavailable();
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('shiftId', shiftId)
    .eq('paymentStatus', 'paid');
  if (invoiceError) throw invoiceError;

  for (const inv of ((invoiceRows || []) as Invoice[])) {
    grossSales += Math.round(inv.sales_total || 0);
    totalCogs += Math.round(inv.cogs || 0);

    // AUDIT FIX: 5-category breakdown instead of 2
    // Distribute invoice discount proportionally across categories
    const itemSubtotal = (inv.items || []).reduce((s, item) => s + (item.totalPrice || 0), 0);
    const discountRatio = itemSubtotal > 0 ? (inv.sales_total || 0) / itemSubtotal : 1;

    inv.items?.forEach(item => {
      const adjustedTotal = Math.round((item.totalPrice || 0) * discountRatio);

      if (item.category === 'service') clinicalRevenue += adjustedTotal;
      else if (item.category === 'lab_service') labRevenue += adjustedTotal;
      else if (item.category === 'vaccine') vaccineRevenue += adjustedTotal;
      else if (item.category === 'prescription') prescriptionRevenue += adjustedTotal;
      else retailRevenue += adjustedTotal;
    });
  }

  // Payment method breakdown (cash / card / bank) for the Z-report.
  const cashTotal = (invoiceRows || []).filter((i: any) => i.paymentMethod === 'cash').reduce((s: number, i: any) => s + (i.sales_total || 0), 0);
  const cardTotal = (invoiceRows || []).filter((i: any) => i.paymentMethod === 'card').reduce((s: number, i: any) => s + (i.sales_total || 0), 0);
  const bankTotal = (invoiceRows || []).filter((i: any) => i.paymentMethod === 'bank_transfer').reduce((s: number, i: any) => s + (i.sales_total || 0), 0);

  return {
    gross_sales: grossSales,
    total_cogs: totalCogs,
    cogs: totalCogs,
    net_profit: Math.round(grossSales - totalCogs),
    // AUDIT FIX: Full 5-category breakdown
    category_breakdown: [
      { category: 'service', total: clinicalRevenue },
      { category: 'lab_service', total: labRevenue },
      { category: 'vaccine', total: vaccineRevenue },
      { category: 'prescription', total: prescriptionRevenue },
      { category: 'retail', total: retailRevenue }
    ],
    payment_breakdown: [
      { method: 'cash', total: cashTotal },
      { method: 'card', total: cardTotal },
      { method: 'bank_transfer', total: bankTotal }
    ]
  };
}

export async function fetchLowStockCount(): Promise<number> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .lte('stock', 20)
    .neq('category', 'service')
    .neq('category', 'lab_service');
  if (error) throw error;
  return (data || []).filter((item: any) => !item.is_deleted && item.stock <= item.minStock).length;
}

export async function fetchActiveShiftId(): Promise<string | null> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('isOpen', true)
    .order('startTime', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) {
    return data.id;
  }
  return null;
}

export async function fetchActiveShiftDetails(): Promise<{ shift: Shift | null; adjustments: any[] }> {
  if (!supabase) throw new Error('No internet connection');
  const { data: activeData, error: activeError } = await supabase
    .from('shifts')
    .select('id')
    .eq('isOpen', true)
    .order('startTime', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) {
    console.error('[DB]', activeError.message);
    throw activeError;
  }
  const activeId = activeData?.id;
  if (!activeId) return { shift: null, adjustments: [] };
  const { data: shiftData, error: shiftError } = await supabase.from('shifts').select('*').eq('id', activeId).maybeSingle();
  if (shiftError) {
    console.error('[DB]', shiftError.message);
    throw shiftError;
  }
  const shift = shiftData as Shift | null;
  if (!shift || !shift.isOpen) return { shift: null, adjustments: [] };
  const { data: adjData, error: adjError } = await supabase.from('cash_adjustments').select('*').eq('shiftId', activeId);
  if (adjError) {
    console.error('[DB]', adjError.message);
    throw adjError;
  }
  return { shift, adjustments: adjData || [] };
}

// shiftId provided → that shift's adjustments (existing behavior). shiftId omitted
// → ALL adjustments (explicit all-time mode for the reports vault). Fail-closed:
// a missing Supabase client or a query error throws instead of returning [], so a
// cloud outage can never look like a zeroed financial report. An empty successful
// result is still a valid empty array.
export async function fetchCashAdjustments(shiftId?: string): Promise<any[]> {
  if (!supabase) throw new Error('No internet connection');
  let query = supabase.from('cash_adjustments').select('*');
  if (shiftId) query = query.eq('shiftId', shiftId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Shift reconciliation history for the reports vault. Live columns are quoted
// camelCase (timestamp, userId, userName, openingFloat, cashSales,
// expectedClosing, actualClosing, discrepancy, status) and match the
// ShiftReconciliation type. Soft-deleted rows are excluded. Fail-closed: a
// missing Supabase client or a query error throws instead of returning [], so a
// cloud outage can never look like an empty reconciliation report. An empty
// successful result is still a valid empty array.
export async function fetchShiftReconciliations(): Promise<ShiftReconciliation[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('shift_reconciliations').select('*');
  if (error) throw error;
  const items = (data || []) as ShiftReconciliation[];
  return items.filter(value => !(value as any).is_deleted);
}

/**
 * Cash drawer adjustment (IN/OUT). Shape mirrors the CashAdjustment interface
 * declared in ShiftManager/ReportsManager — it is not exported from types.ts,
 * so the parameter is typed structurally here rather than inventing a new type.
 */
export async function addCashAdjustment(adj: {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  category: string;
  reason: string;
  date: string;
  createdBy: string;
  shiftId?: string;
}): Promise<void> {
  if (!adj || !adj.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('cash_adjustments').insert(withCurrentClinicId(adj));
  if (error) throw error;
}

export interface CashAdjustmentInput {
  id: string;
  type: 'IN' | 'OUT';
  amount: number;
  category: string;
  reason: string;
  date: string;
  createdBy: string;
  shiftId: string;
}

/**
 * Atomically persist a boarding row, its settlement invoice, and its cash
 * movement. The invoice is optional for admission, while the adjustment is
 * optional for a zero-balance discharge.
 */
export async function commitBoardingCashLedger(
  boarding: BoardingRecord,
  invoice?: Invoice,
  adjustment?: CashAdjustmentInput,
): Promise<void> {
  if (!boarding?.id) throw new Error('INVALID_BOARDING_ID');
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.rpc('commit_boarding_cash_ledger_auth', {
    p_boarding: withCurrentClinicId(boarding),
    p_invoice: invoice ? withCurrentClinicId(invoice) : null,
    p_adjustment: adjustment ? withCurrentClinicId(adjustment) : null,
  });
  if (error) throw error;
}

export async function openShift(openedBy: string, openingFloatCents: number): Promise<string | null> {
  const newShiftId = crypto.randomUUID(); // Strict UUID standard
  const now = new Date().toISOString();
  
  const newShift: Shift = {
    id: newShiftId,
    openedBy: openedBy || 'Unknown',
    startTime: now,
    openingFloatCents: Math.round(openingFloatCents || 0),
    cashCollectedCents: 0,
    cardCollectedCents: 0,
    bankTransferCollectedCents: 0,
    isOpen: true,
    opening_float: Math.round(openingFloatCents) / 100, // FIXED: ensure integer before division
    actual_cash: null,
    discrepancy_reason: '',
    created_at: now,
    updated_at: now,
    is_deleted: false
  };

  await insertShift(newShift);

  return newShiftId;
}

export async function insertShift(shift: Shift): Promise<void> {
  if (!shift?.id) return;
  const { error } = await cloud().from('shifts').insert(withCurrentClinicId(shift));
  if (error) throw error;
}

// Atomic shift close + reconciliation. One Supabase RPC transaction updates the
// shifts row (endTime, cents, notes, isOpen=false, actual_cash, discrepancy_reason,
// updated_at) AND inserts the matching shift_reconciliations row — both commit or
// neither does, replacing the previous separate closeShift + upsertShiftReconciliation
// pair. The RPC raises SHIFT_NOT_FOUND for a missing shift. Fail-closed: a missing
// client or any RPC error throws; there is NO IndexedDB fallback. The caller is
// responsible for clearing local active-shift state only after this resolves.
// Returns already_closed=true when the shift was already closed (a retry / lost
// response), in which case the RPC performed no second insert and no re-close.
export async function closeShiftAndReconcile(
  shiftId: string,
  actualCashCents: number,
  expectedCashCents: number,
  discrepancyCents: number,
  notes: string,
  reconciliation: ShiftReconciliation
): Promise<{ already_closed: boolean }> {
  if (!supabase) throw new Error('No internet connection');
  if (!shiftId) throw new Error('INVALID_SHIFT_ID');
  if (!reconciliation || !reconciliation.id) throw new Error('INVALID_SHIFT_RECONCILIATION');
  const { data, error } = await supabase.rpc('close_shift_and_reconcile_auth', {
    p_shift_id: shiftId,
    p_actual_cash_cents: actualCashCents,
    p_expected_cash_cents: expectedCashCents,
    p_discrepancy_cents: discrepancyCents,
    p_notes: notes,
    p_reconciliation: withCurrentClinicId(reconciliation),
  });
  if (error) throw error;
  return { already_closed: !!(data as any)?.already_closed };
}

// Void a paid invoice and reverse its shift revenue atomically & idempotently via
// the void_invoice_and_reverse_revenue RPC (flips paymentStatus to 'void', reverts
// the linked appointment to 'booked', and subtracts the exact revenue from the
// invoice's OWN shift — exactly once). Fail-closed: throws on any error, no local
// fallback. Returns whether the invoice was already void and whether revenue was
// reversed on this call.
export async function voidInvoiceAndReverseRevenue(
  invoiceId: string
): Promise<{ already_void: boolean; reversed: boolean; restocked: Record<string, number> }> {
  if (!supabase) throw new Error('No internet connection');
  if (!invoiceId) throw new Error('INVALID_INVOICE_ID');
  const { data, error } = await supabase.rpc('void_invoice_and_reverse_revenue_auth', {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  return {
    already_void: !!(data as any)?.already_void,
    reversed: !!(data as any)?.reversed,
    restocked: ((data as any)?.restocked || {}) as Record<string, number>,
  };
}

// All paid invoices attributed to a shift, regardless of date — so reconciliation
// covers the complete shift (including one that crosses midnight), not only today's
// in-memory list. Fail-closed: throws on a cloud error so an outage can never look
// like an empty (fully-reconciled) shift.
export async function fetchPaidInvoicesForShift(shiftId: string): Promise<Invoice[]> {
  if (!supabase) throw new Error('No internet connection');
  if (!shiftId) return [];
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('shiftId', shiftId)
    .eq('paymentStatus', 'paid');
  if (error) throw error;
  return (data || []) as Invoice[];
}

// Distinguish "cloud state unavailable" from "confirmed no open shift". Callers use
// available=false to BLOCK unsafe register-state changes rather than treating an
// outage as "no shift open". Never throws.
export async function fetchActiveShiftState(): Promise<{ available: boolean; shift: Shift | null }> {
  if (!supabase) return { available: false, shift: null };
  try {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('isOpen', true)
      .order('startTime', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { available: false, shift: null };
    return { available: true, shift: (data as Shift) || null };
  } catch {
    return { available: false, shift: null };
  }
}

// ==========================================
// CLIENTS
// ==========================================
export async function fetchClients(): Promise<Client[]> {
  // Fail closed: a missing client or a cloud outage must NOT masquerade as an
  // empty client database. Throw so callers can distinguish "no clients" from
  // "could not reach the cloud".
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('clients').select('*');
  if (error) throw error;
  const clients: Client[] = [];
  let hasWalkIn = false;

  for (const value of (data || []) as Client[]) {
    if (!(value as any).is_deleted) {
      clients.push(value);
      if (value.client_id === 'walk_in_retail') hasWalkIn = true;
    }
  }

  if (!hasWalkIn) {
    // Hydration reads must stay read-only. Under tenant RLS, an orphaned legacy
    // walk-in row can be hidden; trying to upsert it here turns a valid empty
    // result into the global Cloud Data Unavailable screen. The normal scoped
    // write path can persist this row when the clinic explicitly needs it.
    const walkInClient: Client = {
      client_id: 'walk_in_retail',
      full_name: 'Walk-In / Retail Customer',
      primary_phone: '0000000000',
      client_status: 'active',
      alternate_phone: '',
      email_address: 'none@ceylonpets.lk',
      physical_address: 'Counter Sale',
      communication_preference: 'none',
      account_balance: 0,
      lifetime_value: 0,
      administrative_notes: 'Permanent default account for anonymous over-the-counter retail sales.'
    };
    clients.unshift(walkInClient);
  }
  return clients;
}

export async function upsertClient(client: Client): Promise<void> {
  if (!client || !client.client_id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clients').upsert(withCurrentClinicId(client));
  if (error) throw error;
}

/**
 * Soft delete a client and CASCADE the soft delete to all of their pets.
 * Never .delete() — invoices and medical records must survive untouched.
 */
export async function deleteClient(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');

  // Step 1: Soft delete all pets of this client
  const { error: petError } = await supabase.from('pets').update({ is_deleted: true }).eq('clientId', id);
  if (petError) throw petError;

  // Step 2: Soft delete the client
  const { error } = await supabase.from('clients').update({ is_deleted: true }).eq('client_id', id);
  if (error) throw error;
}

// ==========================================
// SYSTEM MAINTENANCE
// ==========================================
export async function fetchFullSystemState(): Promise<any> {
  const client = cloud();
  const { data: shifts, error: shiftError } = await client.from('shifts').select('*');
  if (shiftError) throw shiftError;

  const state: any = {
    app: 'CeylonPets',
    version: '2.1.0', // Phase 8+ Audit Fix
    timestamp: new Date().toISOString(),
    collections: {
      inventory: await fetchInventory(),
      appointments: await fetchAppointments(),
      records: await fetchMedicalRecords(),
      invoices: await fetchInvoices(),
       pos_shifts: shifts || [],
      clients: await fetchClients(),
      clinicQueue: await fetchClinicQueue(),
      system_alerts: await fetchAlerts(),
      notifications: await fetchNotifications(),
      pets: await fetchPets(),
      vaccinations: await fetchVaccinations(),
      labResults: await fetchLabResults(),
      groomingLogs: await fetchGroomingLogs(),
      boardingRecords: await fetchBoardingRecords()
    }
  };
  return state;
}

// ==========================================
// THE LIVING FLOOR: Clinic Queue State Machine
// ==========================================
export async function fetchClinicQueue(): Promise<ClinicQueueItem[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false);
  if (error) throw error;
  // BUG #6 FIX: soft-deleted rows are now excluded server-side.
  return ((data || []) as ClinicQueueItem[])
    .sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

export async function addToClinicQueue(item: ClinicQueueItem): Promise<void> {
  if (!item || !item.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clinic_queue').insert(withCurrentClinicId(item));
  if (error) throw error;
}

export async function upsertClinicQueueItem(item: ClinicQueueItem): Promise<void> {
  if (!item || !item.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clinic_queue').upsert(withCurrentClinicId(item));
  if (error) throw error;
}

export async function updateQueueItemStatus(id: string, status: 'scheduled' | 'active' | 'completed'): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clinic_queue').update({ status }).eq('id', id);
  if (error) throw error;
}

export async function removeFromClinicQueue(
  id: string,
  finalStatus: 'completed' | 'cancelled' = 'completed'
): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  // BUG #6 FIX: Soft-delete instead of hard-delete so history is preserved
  const { error } = await supabase
    .from('clinic_queue')
    .update({ is_deleted: true, status: finalStatus })
    .eq('id', id);
  if (error) throw error;
}

export async function getActiveQueueItems(): Promise<ClinicQueueItem[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('checkInTime', { ascending: false });
  if (error) throw error;
  return (data || []) as ClinicQueueItem[];
}

export async function getQueueItemsByService(serviceType: string): Promise<ClinicQueueItem[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false)
    .eq('serviceType', serviceType)
    .order('checkInTime', { ascending: false });
  if (error) throw error;
  return (data || []) as ClinicQueueItem[];
}

// ==========================================
// FULL DATABASE EXPORT & RESTORE
// ==========================================
const FULL_BACKUP_FORMAT = 'ceylonpets-cloud-backup';
const FULL_BACKUP_VERSION = 2;
const RESTORE_BATCH_SIZE = 100;
const BACKUP_READ_ATTEMPTS = 2;

interface BackupTableDefinition {
  name: string;
  conflict: string;
  select?: string;
  appendOnly?: boolean;
}

const BACKUP_TABLES: readonly BackupTableDefinition[] = [
  { name: 'users', conflict: 'id', select: 'id, name, username, role, avatar_color, active, is_deleted, created_at, updated_at, auth_user_id' },
  { name: 'clients', conflict: 'client_id' },
  { name: 'inventory_categories', conflict: 'id' },
  { name: 'suppliers', conflict: 'id' },
  { name: 'inventory', conflict: 'id' },
  { name: 'inventory_batches', conflict: 'id' },
  { name: 'pets', conflict: 'id' },
  { name: 'appointments', conflict: 'id' },
  { name: 'medical_records', conflict: 'id' },
  { name: 'vaccinations', conflict: 'id' },
  { name: 'lab_results', conflict: 'id' },
  { name: 'grooming_logs', conflict: 'id' },
  { name: 'boarding_records', conflict: 'id' },
  { name: 'invoices', conflict: 'id' },
  { name: 'shifts', conflict: 'id' },
  { name: 'cash_adjustments', conflict: 'id' },
  { name: 'shift_reconciliations', conflict: 'id' },
  { name: 'clinic_queue', conflict: 'id' },
  { name: 'notifications', conflict: 'id' },
  { name: 'system_alerts', conflict: 'id' },
  { name: 'system_config', conflict: 'id' },
  { name: 'staff_profiles', conflict: 'id' },
  { name: 'time_entries', conflict: 'id' },
  { name: 'schedule_entries', conflict: 'id' },
  { name: 'payslips', conflict: 'id' },
  { name: 'deletion_audit', conflict: 'id', appendOnly: true },
  { name: 'auth_audit', conflict: 'id', appendOnly: true },
] as const;

interface FullBackupDocument {
  format: typeof FULL_BACKUP_FORMAT;
  version: typeof FULL_BACKUP_VERSION;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

export interface RestoreSummary {
  tablesProcessed: number;
  rowsProcessed: number;
}

export async function exportFullDatabase(): Promise<string> {
  const unlock = await globalMutex.lock();
  try {
    const client = cloud();
    const tables: Record<string, unknown[]> = {};

    // Read raw rows so deleted history and database-owned columns survive a round trip.
    for (const definition of BACKUP_TABLES) {
      let data: unknown[] | null = null;
      let lastError: { message?: string } | null = null;

      for (let attempt = 0; attempt < BACKUP_READ_ATTEMPTS; attempt++) {
        const query = definition.select
          ? client.from(definition.name).select(definition.select)
          : client.from(definition.name).select('*');
        const result = await query;
        data = result.data as unknown[] | null;
        lastError = result.error;
        if (!result.error) break;
        if (attempt < BACKUP_READ_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, 350));
        }
      }

      if (lastError) {
        throw new Error(`Backup could not read ${definition.name}: ${lastError.message || 'the cloud request failed'}`);
      }
      tables[definition.name] = data || [];
    }

    const backup: FullBackupDocument = {
      format: FULL_BACKUP_FORMAT,
      version: FULL_BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      tables,
    };
    return JSON.stringify(backup, null, 2);
  } finally {
    unlock();
  }
}

function parseFullBackup(jsonData: string): FullBackupDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonData);
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Backup file must contain a JSON object.');
  }

  const backup = parsed as Partial<FullBackupDocument>;
  if (backup.format !== FULL_BACKUP_FORMAT || backup.version !== FULL_BACKUP_VERSION) {
    throw new Error('Unsupported backup format. Download a new Full System Backup first.');
  }
  if (!backup.tables || typeof backup.tables !== 'object' || Array.isArray(backup.tables)) {
    throw new Error('Backup file has no table data.');
  }

  for (const definition of BACKUP_TABLES) {
    const rows = backup.tables[definition.name];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) {
      throw new Error(`Backup table ${definition.name} is not an array.`);
    }
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !(definition.conflict in row)) {
        throw new Error(`Backup table ${definition.name} contains an invalid row.`);
      }
    }
  }

  return backup as FullBackupDocument;
}

export async function restoreFullDatabase(jsonData: string): Promise<RestoreSummary> {
  const backup = parseFullBackup(jsonData);
  const client = cloud();
  let tablesProcessed = 0;
  let rowsProcessed = 0;

  for (const definition of BACKUP_TABLES) {
    const rows = backup.tables[definition.name];
    if (!rows?.length) continue;

    try {
      for (let start = 0; start < rows.length; start += RESTORE_BATCH_SIZE) {
        const chunk = rows.slice(start, start + RESTORE_BATCH_SIZE);
        if (definition.appendOnly) {
          const ids = chunk.map(row => (row as Record<string, unknown>)[definition.conflict]);
          const { data: existing, error: existingError } = await client
            .from(definition.name)
            .select(definition.conflict)
            .in(definition.conflict, ids);
          if (existingError) throw existingError;
          const existingIds = new Set((existing || []).map((row: any) => row[definition.conflict]));
          const newRows = chunk.filter(row => !existingIds.has((row as Record<string, unknown>)[definition.conflict]));
          if (newRows.length) {
            const { error } = await client
              .from(definition.name)
              .insert(newRows.map(row => withCurrentClinicId(row as Record<string, unknown>)));
            if (error) throw error;
          }
        } else {
          const { error } = await client
            .from(definition.name)
            .upsert(chunk.map(row => withCurrentClinicId(row as Record<string, unknown>)), { onConflict: definition.conflict });
          if (error) throw error;
        }
        rowsProcessed += chunk.length;
      }
      tablesProcessed++;
    } catch (error: any) {
      throw new Error(`Restore stopped at ${definition.name}: ${error?.message || 'write failed'}`);
    }
  }

  return { tablesProcessed, rowsProcessed };
}
export interface PurgeSummary {
  tablesCleared: number;
  usersPreserved: number;
}

/** Clear application data while preserving public.users and Supabase Auth identities. */
export async function purgeApplicationData(): Promise<PurgeSummary> {
  const client = cloud();
  const { data, error } = await client.rpc('purge_application_data_auth');
  if (error) throw new Error(error.message || 'Application reset failed.');

  const result = (data || {}) as Record<string, unknown>;
  return {
    tablesCleared: Number(result.tables_cleared || 0),
    usersPreserved: Number(result.users_preserved || 0),
  };
}


// ==========================================
// MISSION 2: BOOT-OPTIMIZED QUERIES
// Only load today's operational data into React state on boot.
// Historical data is queried on-demand via pagination.
// ==========================================

/**
 * Returns today's medical records from Supabase using server-side date filter.
 */
export async function fetchTodaysRecords(): Promise<MedicalRecord[]> {
  if (!supabase) throw cloudUnavailable();
  const today = formatDisplayDate(new Date());
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('visitDate', today)
    .eq('is_deleted', false);
  if (error) throw error;
  return (data || []).sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

/**
 * Returns today's invoices from Supabase using server-side date filter.
 */
export async function fetchTodaysInvoices(): Promise<Invoice[]> {
  if (!supabase) throw cloudUnavailable();
  const today = formatDisplayDate(new Date());
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('date', today);
  if (error) throw error;
  return (data || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * On-demand paginated invoice query for InvoicesManager.
 * Server-side paginated invoice query with search and status filter.
 */
export async function fetchPaginatedInvoices(
  page = 0,
  limit = 50,
  search?: string,
  statusFilter?: string
): Promise<{ invoices: Invoice[]; total: number }> {
  if (!supabase) throw cloudUnavailable();
  let query = supabase.from('invoices').select('*', { count: 'exact' });

  if (statusFilter && statusFilter !== 'All') {
    query = query.eq('paymentStatus', statusFilter);
  }
  if (search && search.trim()) {
    query = query.or(`ownerName.ilike.%${search.trim()}%,petName.ilike.%${search.trim()}%`);
  }

  const start = page * limit;
  query = query.order('date', { ascending: false }).range(start, start + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { invoices: (data || []) as Invoice[], total: count || 0 };
}

/**
 * On-demand paginated medical records query for MedicalRecordsManager "All History" mode.
 */
export async function fetchPaginatedRecords(
  page = 0,
  limit = 50,
  search?: string
): Promise<{ records: MedicalRecord[]; total: number }> {
  if (!supabase) throw cloudUnavailable();
  let query = supabase.from('medical_records').select('*', { count: 'exact' })
    .eq('is_deleted', false);

  if (search && search.trim()) {
    query = query.or(`ownerName.ilike.%${search.trim()}%,ownerPhone.ilike.%${search.trim()}%`);
  }

  const start = page * limit;
  query = query.order('visitDate', { ascending: false }).range(start, start + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { records: (data || []) as MedicalRecord[], total: count || 0 };
}

/**
 * Aggregate invoice KPIs using server-side count and selective column fetch.
 */
export async function fetchInvoiceStats(): Promise<{ total: number; revenue: number; voided: number }> {
  if (!supabase) throw cloudUnavailable();
  const { count: total, error: totalError } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true });
  const { data: paidData, error: paidError } = await supabase
    .from('invoices').select('sales_total').eq('paymentStatus', 'paid');
  const { count: voided, error: voidedError } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true }).eq('paymentStatus', 'void');

  if (totalError) throw totalError;
  if (paidError) throw paidError;
  if (voidedError) throw voidedError;

  const revenue = (paidData || []).reduce((s, inv) => s + (inv.sales_total || 0), 0);
  return { total: total || 0, revenue: Math.round(revenue * 100) / 100, voided: voided || 0 };
}

// ==========================================
// NEW ARCHITECTURE DATA STORES (PETS & RELATED)
// ==========================================

// PETS
// includeDeleted=false (default) returns only active pets — the normal read.
// Pass true ONLY for the client-deletion history preflight, which must still
// count a soft-deleted pet's surviving clinical/financial history.
export async function fetchPets(includeDeleted = false): Promise<Pet[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('pets').select('*');
  if (error) throw error;
  const items = (data || []) as Pet[];
  return includeDeleted ? items : items.filter(value => !(value as any).is_deleted);
}

export async function upsertPet(pet: Pet): Promise<void> {
  if (!pet || !pet.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('pets').upsert(withCurrentClinicId(pet));
  if (error) throw error;
}

/**
 * Soft delete only — never .delete(). A hard delete is rejected by the FKs from
 * vaccinations / medical_records / lab_results / grooming_logs / boarding_records,
 * and would destroy clinical history. Flipping is_deleted preserves all of it.
 */
export async function deletePet(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('pets').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

// VACCINATIONS
export async function fetchVaccinations(): Promise<Vaccination[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('vaccinations').select('*');
  if (error) throw error;
  const items = (data || []) as Vaccination[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertVaccination(vaccine: Vaccination): Promise<void> {
  if (!vaccine || !vaccine.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('vaccinations').upsert(withCurrentClinicId(vaccine));
  if (error) throw error;
}

// LAB RESULTS
export async function fetchLabResults(): Promise<LabResult[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('lab_results').select('*');
  if (error) throw error;
  return (data || []).filter((r: any) => !r.is_deleted);
}

export async function upsertLabResult(result: LabResult): Promise<void> {
  if (!result || !result.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('lab_results').upsert(withCurrentClinicId(result));
  if (error) throw error;
}

// GROOMING LOGS
export async function fetchGroomingLogs(): Promise<GroomingLog[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('grooming_logs').select('*');
  if (error) throw error;
  const items = (data || []) as GroomingLog[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertGroomingLog(log: GroomingLog): Promise<void> {
  if (!log || !log.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('grooming_logs').upsert(withCurrentClinicId(log));
  if (error) throw error;
}

// BOARDING RECORDS
export async function fetchBoardingRecords(): Promise<BoardingRecord[]> {
  if (!supabase) throw new Error('No internet connection');
  const { data, error } = await supabase.from('boarding_records').select('*');
  if (error) throw error;
  const items = (data || []) as BoardingRecord[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertBoardingRecord(record: BoardingRecord): Promise<void> {
  if (!record || !record.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('boarding_records').upsert(withCurrentClinicId(record));
  if (error) throw error;
}

// ==========================================
// SYSTEM CONFIG (SUPABASE — cross-device permissions)
// ==========================================

export async function fetchSystemConfig(): Promise<SystemConfig | null> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) return null;

  return {
    appName: data.app_name || '',
    resellerName: data.reseller_name || '',
    hospitalName: data.hospital_name || '',
    hospitalAddress: data.hospital_address || '',
    hospitalPhone: data.hospital_phone || '',
    hospitalEmail: data.hospital_email || '',
    invoiceLogo: data.invoice_logo || '',
    invoiceFooterMessage: data.invoice_footer_message || '',
    invoiceSubFooterMessage: data.invoice_sub_footer_message || '',
    invoiceExtraFooterMessage: data.invoice_extra_footer_message || '',
    taxRate: Number(data.tax_rate) || 0,
    currencySymbol: data.currency_symbol || 'Rs. ',
    localAutosaveInterval: Number(data.local_autosave_interval) || 15,
    cloudEndpoint: data.cloud_endpoint || '',
    cloudBackupEnabled: data.cloud_backup_enabled || false,
    rolePermissions: data.role_permissions || {},
    actionPolicies: data.action_policies || {},
    boardingRates: data.boarding_rates || {},
    defaultDepositCents: Number(data.default_deposit_cents) || 0,
     idleLogoutMinutes: data.idle_logout_minutes ?? 15,
    setupModeActive: data.setup_mode_active ?? false,
  } as SystemConfig;
}

export async function upsertSystemConfig(config: SystemConfig): Promise<void> {
  if (!supabase) throw new Error('No internet connection');
  const payload = {
    id: 'global',
    app_name: config.appName,
    reseller_name: config.resellerName,
    hospital_name: config.hospitalName,
    hospital_address: config.hospitalAddress,
    hospital_phone: config.hospitalPhone,
    hospital_email: config.hospitalEmail,
    invoice_logo: config.invoiceLogo,
    invoice_footer_message: config.invoiceFooterMessage,
    invoice_sub_footer_message: config.invoiceSubFooterMessage,
    invoice_extra_footer_message: config.invoiceExtraFooterMessage,
    tax_rate: config.taxRate,
    currency_symbol: config.currencySymbol,
    local_autosave_interval: config.localAutosaveInterval,
    cloud_endpoint: config.cloudEndpoint,
    cloud_backup_enabled: config.cloudBackupEnabled,
    role_permissions: config.rolePermissions,
    action_policies: config.actionPolicies,
    boarding_rates: config.boardingRates,
    default_deposit_cents: config.defaultDepositCents,
    idle_logout_minutes: config.idleLogoutMinutes,
    setup_mode_active: config.setupModeActive,
  };
  const { error } = await supabase.from('system_config').upsert(withCurrentClinicId(payload));
  if (error) throw error;
}

// ==========================================
// SUPPLIERS
// ==========================================

export async function fetchSuppliers(): Promise<Supplier[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true });
  if (error) throw error;
  return (data || []) as Supplier[];
}

export async function upsertSupplier(supplier: Supplier): Promise<void> {
  if (!supplier || !supplier.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('suppliers').upsert(withCurrentClinicId(supplier));
  if (error) throw error;
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('suppliers').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

// ==========================================
// INVENTORY CATEGORIES (dynamic, cross-device)
// ==========================================

export async function fetchInventoryCategories(): Promise<InventoryCategory[]> {
  if (!supabase) throw cloudUnavailable();
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('*')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data || []) as InventoryCategory[];
}

export async function upsertInventoryCategory(cat: InventoryCategory): Promise<void> {
  if (!cat || !cat.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('inventory_categories').upsert(withCurrentClinicId(cat));
  if (error) throw error;
}

export async function deleteInventoryCategory(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('inventory_categories').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}
