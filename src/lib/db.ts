/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './localDb';
import { supabase } from './supabase';
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
  InventoryCategory
} from '../types';
import { SystemConfig } from '../components/SystemSettings';

// Clients DB is imported from localDb.ts

// ==========================================
// INVENTORY (DELTA UPDATES)
// ==========================================
export async function fetchInventory(): Promise<InventoryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('inventory').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as InventoryItem[];
  return items.filter(i => !(i as any).is_deleted);
}

export async function fetchInventoryBatches(): Promise<InventoryBatch[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('inventory_batches').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []).filter((b: any) => !b.is_deleted);
}

export async function upsertInventoryItem(item: InventoryItem): Promise<void> {
  if (!item) return;

  if (!supabase) throw new Error('No internet connection');

  // SKU duplicate check against Supabase (excludes this item, so edits pass).
  if (item.sku) {
    const { data: skuData, error: skuError } = await supabase
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

  const { error } = await supabase.from('inventory').upsert(item);
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
  if (!supabase) throw new Error('No internet connection');
  const { data: batchData, error: batchError } = await supabase
    .from('inventory_batches')
    .select('*')
    .eq('inventoryItemId', itemId);
  if (batchError) throw batchError;
  const batches = (batchData || []).filter((b: any) => !b.is_deleted);

  // Sum all non-deleted batches for this item.
  const total = batches.reduce((sum: number, b: any) => sum + b.quantityRemaining, 0);

  // No batches → manual-stock item; leave item.stock exactly as-is.
  if (batches.length === 0) {
    const { data: itemData, error: itemError } = await supabase
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
  const { error } = await supabase
    .from('inventory')
    .update({ stock: total, expiryDate, lotNumber })
    .eq('id', itemId);
  if (error) throw error;

  return total;
}

export async function upsertInventoryBatch(batch: InventoryBatch): Promise<void> {
  if (!batch || !batch.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('inventory_batches').upsert(batch);
  if (error) throw error;
  // Keep item.stock in sync with the batch totals for this item.
  await recomputeItemStockFromBatches(batch.inventoryItemId);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');

  // Soft delete batches first
  const { error: batchError } = await supabase
    .from('inventory_batches')
    .update({ is_deleted: true })
    .eq('inventoryItemId', id);
  if (batchError) throw batchError;

  // Soft delete inventory item
  const { error } = await supabase
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
    if (!supabase) throw new Error('No internet connection');
    const { data: itemData, error: itemError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', itemId)
      .maybeSingle();
    if (itemError) throw itemError;
    if (!itemData) throw new Error(`ITEM_NOT_FOUND: ${itemId}`);
    const item = itemData as InventoryItem;

    const newStock = Math.max(0, item.stock + qtyDelta);

    // Fetch all batches for this item from Supabase
    const { data: batchData, error: batchError } = await supabase
      .from('inventory_batches')
      .select('*')
      .eq('inventoryItemId', itemId);
    if (batchError) throw batchError;
    const batches = ((batchData || []) as InventoryBatch[]).filter((b: any) => !b.is_deleted);

    if (batches.length > 0) {
      if (qtyDelta < 0) {
        let remainingToConsume = Math.abs(qtyDelta);
        // Sort by expiry ascending (soonest first)
        const activeBatches = batches.filter(b => b.quantityRemaining > 0).sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
        
        for (const batch of activeBatches) {
          if (remainingToConsume <= 0) break;
          const consumeFromBatch = Math.min(batch.quantityRemaining, remainingToConsume);
          batch.quantityRemaining -= consumeFromBatch;
          remainingToConsume -= consumeFromBatch;
          if (!supabase) throw new Error('No internet connection');
          const { error } = await supabase.from('inventory_batches').upsert(batch);
          if (error) throw error;
        }
      } else if (qtyDelta > 0) {
        // For returns/voids, add to the newest batch
        const sortedBatches = batches.sort((a, b) => new Date(b.expiryDate).getTime() - new Date(a.expiryDate).getTime());
        if (sortedBatches.length > 0) {
          const newestBatch = sortedBatches[0];
          newestBatch.quantityRemaining += qtyDelta;
          if (!supabase) throw new Error('No internet connection');
          const { error } = await supabase.from('inventory_batches').upsert(newestBatch);
          if (error) throw error;
        }
      }

      // Batch-tracked item: batch totals are the source of truth. Recompute
      // item.stock (and expiry/lot) from the now-updated batches and save it.
      const total = await recomputeItemStockFromBatches(itemId);
      return total;
    }

    // No batches: this item uses manual stock — apply the delta directly.
    item.stock = newStock;
    if (!supabase) throw new Error('No internet connection');
    const { error } = await supabase.from('inventory').upsert(item);
    if (error) throw error;
    return newStock;
  } finally {
    unlock();
  }
}

// ==========================================
// APPOINTMENTS
// ==========================================
export async function fetchAppointments(days?: number): Promise<Appointment[]> {
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
    .filter((value: any) => !value.is_deleted)
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
  if (!supabase) return { appointments: [], count: 0 };

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
  if (error) { console.error('[DB]', error.message); return { appointments: [], count: 0 }; }

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
  const { error } = await supabase.from('appointments').upsert(formattedApt);
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
  if (!supabase) return [];
  const { data, error } = await supabase.from('users').select('*').eq('is_deleted', false);
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []).map((u: any) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    avatarColor: u.avatar_color || '',
    pin: u.pin,
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
    pin: user.pin,
    avatar_color: user.avatarColor,
    active: user.active ?? true,
    is_deleted: false
  };
  const { error } = await supabase.from('users').upsert(payload);
  if (error) throw error;
}

export async function deleteUser(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('users').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

export async function fetchVeterinarians(): Promise<User[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'veterinarian')
    .eq('active', true)
    .eq('is_deleted', false);
  if (error) { console.error('[DB]', error.message); return []; }
  const vets = (data || []).map((u: any) => ({
    id: u.id,
    name: u.name,
    username: u.username,
    role: u.role,
    avatarColor: u.avatar_color || '',
    pin: u.pin,
    active: u.active ?? true
  }));
  if (vets.length === 0) {
    return [{ id: 'fallback-vet', name: 'Attending Doctor', username: 'attending', role: 'veterinarian', avatarColor: '', active: true }];
  }
  return vets.sort((a, b) => a.name.localeCompare(b.name));
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
  const { error } = await supabase.from('medical_records').upsert(formattedRec);
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
  const { error } = await supabase.from('invoices').upsert(formattedInv);
  if (error) throw error;

  // Cross-module cascade: Auto-complete appointment
  if (inv.appointmentId && supabase) {
    const newStatus = inv.paymentStatus === 'void' ? 'booked' : 'completed';
    await supabase.from('appointments').update({ status: newStatus }).eq('id', inv.appointmentId);
  }
}

// ==========================================
// NOTIFICATIONS
// ==========================================
export async function fetchNotifications(): Promise<ClientNotification[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('notifications').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const notifs = (data || []) as ClientNotification[];
  return notifs;
}

export async function upsertNotification(notif: ClientNotification): Promise<void> {
  if (!notif || typeof notif !== 'object' || !notif.id) {
    if (import.meta.env.DEV) console.warn('[CeylonPets POS] Rejected malformed or empty notification payload.');
    return;
  }
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('notifications').upsert(notif);
  if (error) throw error;
}

// ==========================================
// ALERTS
// ==========================================
export async function fetchAlerts(): Promise<SystemAlert[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('system_alerts').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []).filter((a: any) => !a.is_deleted);
}

export async function upsertAlert(alert: SystemAlert): Promise<void> {
  if (!alert || typeof alert !== 'object' || !alert.id) {
    if (import.meta.env.DEV) console.warn('[CeylonPets POS] Rejected malformed or empty system alert payload.');
    return;
  }
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('system_alerts').upsert(alert);
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
  if (!supabase) return null;
  const { data: invoiceRows, error: invoiceError } = await supabase
    .from('invoices')
    .select('*')
    .eq('shiftId', shiftId)
    .eq('paymentStatus', 'paid');
  if (invoiceError) { console.error('[DB]', invoiceError.message); return null; }

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
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .lte('stock', 20)
    .neq('category', 'service')
    .neq('category', 'lab_service');
  if (error) { console.error('[DB]', error.message); return 0; }
  return (data || []).filter((item: any) => !item.is_deleted && item.stock <= item.minStock).length;
}

export async function fetchActiveShiftId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('shifts')
    .select('id')
    .eq('isOpen', true)
    .order('startTime', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error('[DB]', error.message); return null; }
  if (data?.id) {
    localStorage.setItem('ceylon_active_shift_id', data.id);
    return data.id;
  }
  return null;
}

export async function fetchActiveShiftDetails(): Promise<{ shift: Shift | null; adjustments: any[] }> {
  const activeId = await fetchActiveShiftId();
  if (!activeId || !supabase) return { shift: null, adjustments: [] };
  const { data: shiftData, error: shiftError } = await supabase.from('shifts').select('*').eq('id', activeId).maybeSingle();
  if (shiftError) { console.error('[DB]', shiftError.message); return { shift: null, adjustments: [] }; }
  const shift = shiftData as Shift | null;
  if (!shift || !shift.isOpen) return { shift: null, adjustments: [] };
  const { data: adjData, error: adjError } = await supabase.from('cash_adjustments').select('*').eq('shiftId', activeId);
  if (adjError) console.error('[DB]', adjError.message);
  return { shift, adjustments: adjData || [] };
}

export async function fetchCashAdjustments(shiftId: string): Promise<any[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('cash_adjustments').select('*').eq('shiftId', shiftId);
  if (error) { console.error('[DB]', error.message); return []; }
  return data || [];
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
  const { error } = await supabase.from('cash_adjustments').insert(adj);
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

  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('shifts').insert(newShift);
  if (error) throw error;

  localStorage.setItem('ceylon_active_shift_id', newShiftId);
  return newShiftId;
}

export async function closeShift(
  shiftId: string, 
  actualCashCents: number, 
  expectedCashCents: number, 
  discrepancyCents: number, 
  notes: string
): Promise<void> {
  if (!supabase) throw new Error('No internet connection');
  const now = new Date().toISOString();
  const { error } = await supabase.from('shifts').update({
    endTime: now,
    expectedCashCents: Math.round(expectedCashCents),
    actualCashCents: Math.round(actualCashCents),
    discrepancyCents: Math.round(discrepancyCents),
    notes: notes || 'Shift closed',
    isOpen: false,
    actual_cash: Math.round(actualCashCents) / 100, // FIXED: ensure integer before division
    discrepancy_reason: notes || '',
    updated_at: now
  }).eq('id', shiftId);
  if (error) throw error;

  localStorage.removeItem('ceylon_active_shift_id');
}

export async function addRevenueToActiveShift(method: PaymentMethod, amountCents: number): Promise<void> {
  const activeId = await fetchActiveShiftId();
  if (!activeId) return;
  if (!supabase) throw new Error('No internet connection');
  const unlock = await globalMutex.lock();
  try {
    const { data, error: readError } = await supabase.from('shifts').select('*').eq('id', activeId).maybeSingle();
    if (readError) throw readError;
    const shift = data as Shift | null;
    if (shift && shift.isOpen) {
      const update: any = { updated_at: new Date().toISOString() };
      if (method === 'cash') update.cashCollectedCents = (shift.cashCollectedCents || 0) + Math.round(amountCents);
      if (method === 'card') update.cardCollectedCents = (shift.cardCollectedCents || 0) + Math.round(amountCents);
      if (method === 'bank_transfer') update.bankTransferCollectedCents = (shift.bankTransferCollectedCents || 0) + Math.round(amountCents);
      const { error } = await supabase.from('shifts').update(update).eq('id', activeId);
      if (error) throw error;
    }
  } finally {
    unlock();
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

  if (!hasWalkIn && supabase) {
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
    await supabase.from('clients').upsert(walkInClient);
    clients.unshift(walkInClient);
  }
  return clients;
}

export async function upsertClient(client: Client): Promise<void> {
  if (!client || !client.client_id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clients').upsert(client);
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
  // FIXED: Read ALL collections from Supabase (was reading empty local IndexedDB)
  const shifts = supabase ? ((await supabase.from('shifts').select('*')).data || []) : [];

  const state: any = {
    app: 'CeylonPets',
    version: '2.1.0', // Phase 8+ Audit Fix
    timestamp: new Date().toISOString(),
    collections: {
      inventory: await fetchInventory(),
      appointments: await fetchAppointments(),
      records: await fetchMedicalRecords(),
      invoices: await fetchInvoices(),
      pos_shifts: shifts,
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

export async function masterSystemPurge(): Promise<string[]> {
  const logs: string[] = [];
  if (supabase) {
    // PRIMARY PATH: explicit per-table deletes, children before parents.
    // The dummy-UUID predicate matches every real row and — unlike neq(pk, '')
    // — is valid uuid syntax, so Postgres never raises 22P02.
    const tables: [string, string, string][] = [
      ['cash_adjustments', 'id', '00000000-0000-0000-0000-000000000000'],
      ['invoices', 'id', '00000000-0000-0000-0000-000000000000'],
      ['clinic_queue', 'id', '00000000-0000-0000-0000-000000000000'],
      ['appointments', 'id', '00000000-0000-0000-0000-000000000000'],
      ['medical_records', 'id', '00000000-0000-0000-0000-000000000000'],
      ['vaccinations', 'id', '00000000-0000-0000-0000-000000000000'],
      ['lab_results', 'id', '00000000-0000-0000-0000-000000000000'],
      ['grooming_logs', 'id', '00000000-0000-0000-0000-000000000000'],
      ['boarding_records', 'id', '00000000-0000-0000-0000-000000000000'],
      ['inventory_batches', 'id', '00000000-0000-0000-0000-000000000000'],
      ['pets', 'id', '00000000-0000-0000-0000-000000000000'],
      ['clients', 'client_id', ''],
      ['inventory', 'id', '00000000-0000-0000-0000-000000000000'],
      ['shift_reconciliations', 'id', '00000000-0000-0000-0000-000000000000'],
      ['shifts', 'id', '00000000-0000-0000-0000-000000000000'],
      ['notifications', 'id', '00000000-0000-0000-0000-000000000000'],
      ['system_alerts', 'id', '00000000-0000-0000-0000-000000000000'],
      ['users', 'id', '00000000-0000-0000-0000-000000000000'],
    ];
    for (const [table, pk, dummy] of tables) {
      try {
        // .select() is required for `data` to come back — without it supabase-js
        // returns data:null and every row count would falsely log as 0.
        const { data, error } = await supabase.from(table).delete().neq(pk, dummy).select();
        if (error) {
          logs.push(`FAIL ${table}: ${error.message}`);
          console.error(`[ERASE] ${table}: ${error.message}`);
        } else {
          logs.push(`OK ${table}: ${(data || []).length} rows`);
          console.log(`[ERASE] ${table}: cleared`);
        }
      } catch (e: any) {
        logs.push(`ERR ${table}: ${e.message}`);
        console.error(`[ERASE] ${table}: ${e.message}`);
      }
    }
    // BACKSTOP: same deletes server-side in one transaction, catching any table
    // missing from the list above. Only logged when it fails, so the OK count
    // stays a clean n/18.
    try {
      const { error } = await supabase.rpc('wipe_all_tables');
      if (error) {
        logs.push(`FAIL rpc wipe_all_tables: ${error.message}`);
        console.error('[ERASE] rpc wipe_all_tables:', error.message);
      }
    } catch (e: any) {
      logs.push(`ERR rpc wipe_all_tables: ${e.message}`);
      console.error('[ERASE] rpc wipe_all_tables:', e.message);
    }
  } else {
    logs.push('FAIL: no supabase connection');
  }

  // Local clear
  await Promise.all([
    db.inventory.clear(),
    db.appointments.clear(),
    db.records.clear(),
    db.invoices.clear(),
    db.alerts.clear(),
    db.notifications.clear(),
    db.clients.clear(),
    db.pets.clear(),
    db.vaccinations.clear(),
    db.labResults.clear(),
    db.groomingLogs.clear(),
    db.boardingRecords.clear()
  ]);
  localStorage.removeItem('ceylon_active_shift_id');
  return logs;
}

/**
 * NUCLEAR-ERASE: same cloud + local wipe as masterSystemPurge, plus a sweep of
 * EVERY remaining localforage store — including the `system` store that holds
 * SystemConfig — so nothing survives locally. Config is "reset to minimal
 * defaults" by emptying db.system: on the next boot the app re-applies its
 * built-in default SystemConfig (App.tsx useState) because there is no stored
 * config to hydrate from. Iterating every store also covers newly-added ones
 * automatically. Pairs with the NEVER_SEED flag to block any demo reseed.
 *
 * Returns masterSystemPurge's per-table log so callers can report real results.
 */
export async function nuclearWipeLocal(): Promise<string[]> {
  const logs = await masterSystemPurge(); // same cloud + local wipe
  await Promise.all(
    Object.values(db).map((store: any) =>
      store && typeof store.clear === 'function' ? store.clear() : Promise.resolve()
    )
  );
  localStorage.removeItem('ceylon_active_shift_id');
  return logs;
}

export async function reconstituteSystemState(payload: any): Promise<void> {
  console.warn('[SYSTEM] Restore is disabled. All data lives in Supabase cloud.');
  return;
  if (!payload || !payload.collections) {
    throw new Error("Invalid backup payload. Ensure this file is a valid CeylonPets JSON export.");
  }

  await masterSystemPurge();

  const writePromises = [];

  if (payload.collections.inventory) {
    payload.collections.inventory.forEach((i: any) => writePromises.push(db.inventory.setItem(i.id, i)));
  }
  if (payload.collections.appointments) {
    payload.collections.appointments.forEach((a: any) => writePromises.push(db.appointments.setItem(a.id, a)));
  }
  if (payload.collections.records) {
    payload.collections.records.forEach((r: any) => writePromises.push(db.records.setItem(r.id, r)));
  }
  if (payload.collections.invoices) {
    payload.collections.invoices.forEach((i: any) => writePromises.push(db.invoices.setItem(i.id, i)));
  }
  if (payload.collections.system_alerts) {
    payload.collections.system_alerts.forEach((a: any) => writePromises.push(db.alerts.setItem(a.id, a)));
  }
  if (payload.collections.notifications) {
    payload.collections.notifications.forEach((n: any) => writePromises.push(db.notifications.setItem(n.id, n)));
  }
  if (payload.collections.clinicQueue) {
    payload.collections.clinicQueue.forEach((q: any) => writePromises.push(db.clinicQueue.setItem(q.id, q)));
  }
  // FIXED: Restore clients and shifts (was missing)
  if (payload.collections.clients) {
    payload.collections.clients.forEach((c: any) => writePromises.push(db.clients.setItem(c.client_id || c.id, c)));
  }
  if (payload.collections.pos_shifts) {
    payload.collections.pos_shifts.forEach((s: any) => writePromises.push(db.shifts.setItem(s.id, s)));
  }
  if (payload.collections.pets) {
    payload.collections.pets.forEach((p: any) => writePromises.push(db.pets.setItem(p.id, p)));
  }
  if (payload.collections.vaccinations) {
    payload.collections.vaccinations.forEach((v: any) => writePromises.push(db.vaccinations.setItem(v.id, v)));
  }
  if (payload.collections.labResults) {
    payload.collections.labResults.forEach((l: any) => writePromises.push(db.labResults.setItem(l.id, l)));
  }
  if (payload.collections.groomingLogs) {
    payload.collections.groomingLogs.forEach((g: any) => writePromises.push(db.groomingLogs.setItem(g.id, g)));
  }
  if (payload.collections.boardingRecords) {
    payload.collections.boardingRecords.forEach((b: any) => writePromises.push(db.boardingRecords.setItem(b.id, b)));
  }

  await Promise.all(writePromises);
}

// ==========================================
// THE LIVING FLOOR: Clinic Queue State Machine
// ==========================================
export async function fetchClinicQueue(): Promise<ClinicQueueItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false);
  if (error) { console.error('[DB]', error.message); return []; }
  // BUG #6 FIX: soft-deleted rows are now excluded server-side.
  return ((data || []) as ClinicQueueItem[])
    .sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

export async function addToClinicQueue(item: ClinicQueueItem): Promise<void> {
  if (!item || !item.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('clinic_queue').insert(item);
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
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false)
    .eq('status', 'active')
    .order('checkInTime', { ascending: false });
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []) as ClinicQueueItem[];
}

export async function getQueueItemsByService(serviceType: string): Promise<ClinicQueueItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('clinic_queue')
    .select('*')
    .eq('is_deleted', false)
    .eq('serviceType', serviceType)
    .order('checkInTime', { ascending: false });
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []) as ClinicQueueItem[];
}

// ==========================================
// FULL DATABASE EXPORT & RESTORE
// ==========================================
export async function exportFullDatabase(): Promise<string> {
  const unlock = await globalMutex.lock();
  try {
    // FIXED: Read cloud collections from Supabase (was reading empty local IndexedDB).
    // `system` (SystemConfig) has no cloud table and stays local.
    const shifts = supabase ? ((await supabase.from('shifts').select('*')).data || []) : [];
    const data: any = {
      clients: await fetchClients(),
      inventory: await fetchInventory(),
      appointments: await fetchAppointments(),
      medicalRecords: await fetchMedicalRecords(),
      invoices: await fetchInvoices(),
      shifts,
      alerts: await fetchAlerts(),
      notifications: await fetchNotifications(),
      clinicQueue: await fetchClinicQueue(),
      system: [],
      pets: await fetchPets(),
      vaccinations: await fetchVaccinations(),
      labResults: await fetchLabResults(),
      groomingLogs: await fetchGroomingLogs(),
      boardingRecords: await fetchBoardingRecords()
    };

    await db.system.iterate((value: any, key: string) => { data.system.push({ key, value }); });

    return JSON.stringify(data);
  } finally {
    unlock();
  }
}

export async function restoreFullDatabase(jsonData: string): Promise<void> {
  console.warn('[SYSTEM] Restore is disabled. All data lives in Supabase cloud.');
  return;
  const data = JSON.parse(jsonData);
  const unlock = await globalMutex.lock();
  try {
    await db.clients.clear();
    await db.inventory.clear();
    await db.appointments.clear();
    await db.records.clear();
    await db.invoices.clear();
    await db.shifts.clear();
    await db.alerts.clear();
    await db.notifications.clear();
    await db.clinicQueue.clear();
    await db.system.clear();
    await db.pets.clear();
    await db.vaccinations.clear();
    await db.labResults.clear();
    await db.groomingLogs.clear();
    await db.boardingRecords.clear();

    const writePromises: Promise<any>[] = [];

    if (data.clients) {
      data.clients.forEach((item: any) => writePromises.push(db.clients.setItem(item.client_id || item.id, item)));
    }
    if (data.inventory) {
      data.inventory.forEach((item: any) => writePromises.push(db.inventory.setItem(item.id, item)));
    }
    if (data.appointments) {
      data.appointments.forEach((item: any) => writePromises.push(db.appointments.setItem(item.id, item)));
    }
    if (data.medicalRecords) {
      data.medicalRecords.forEach((item: any) => writePromises.push(db.records.setItem(item.id, item)));
    }
    if (data.invoices) {
      data.invoices.forEach((item: any) => writePromises.push(db.invoices.setItem(item.id, item)));
    }
    if (data.shifts) {
      data.shifts.forEach((item: any) => writePromises.push(db.shifts.setItem(item.id, item)));
    }
    if (data.alerts) {
      data.alerts.forEach((item: any) => writePromises.push(db.alerts.setItem(item.id, item)));
    }
    if (data.notifications) {
      data.notifications.forEach((item: any) => writePromises.push(db.notifications.setItem(item.id, item)));
    }
    if (data.clinicQueue) {
      data.clinicQueue.forEach((item: any) => writePromises.push(db.clinicQueue.setItem(item.id, item)));
    }
    if (data.system) {
      data.system.forEach((item: any) => writePromises.push(db.system.setItem(item.key, item.value)));
    }
    if (data.pets) {
      data.pets.forEach((item: any) => writePromises.push(db.pets.setItem(item.id, item)));
    }
    if (data.vaccinations) {
      data.vaccinations.forEach((item: any) => writePromises.push(db.vaccinations.setItem(item.id, item)));
    }
    if (data.labResults) {
      data.labResults.forEach((item: any) => writePromises.push(db.labResults.setItem(item.id, item)));
    }
    if (data.groomingLogs) {
      data.groomingLogs.forEach((item: any) => writePromises.push(db.groomingLogs.setItem(item.id, item)));
    }
    if (data.boardingRecords) {
      data.boardingRecords.forEach((item: any) => writePromises.push(db.boardingRecords.setItem(item.id, item)));
    }

    await Promise.all(writePromises);
  } finally {
    unlock();
  }
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
  if (!supabase) return [];
  const today = formatDisplayDate(new Date());
  const { data, error } = await supabase
    .from('medical_records')
    .select('*')
    .eq('visitDate', today)
    .eq('is_deleted', false);
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []).sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

/**
 * Returns today's invoices from Supabase using server-side date filter.
 */
export async function fetchTodaysInvoices(): Promise<Invoice[]> {
  if (!supabase) return [];
  const today = formatDisplayDate(new Date());
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('date', today);
  if (error) { console.error('[DB]', error.message); return []; }
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
  if (!supabase) return { invoices: [], total: 0 };
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
  if (error) { console.error('[DB]', error.message); return { invoices: [], total: 0 }; }
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
  if (!supabase) return { records: [], total: 0 };
  let query = supabase.from('medical_records').select('*', { count: 'exact' })
    .eq('is_deleted', false);

  if (search && search.trim()) {
    query = query.or(`ownerName.ilike.%${search.trim()}%,ownerPhone.ilike.%${search.trim()}%`);
  }

  const start = page * limit;
  query = query.order('visitDate', { ascending: false }).range(start, start + limit - 1);

  const { data, error, count } = await query;
  if (error) { console.error('[DB]', error.message); return { records: [], total: 0 }; }
  return { records: (data || []) as MedicalRecord[], total: count || 0 };
}

/**
 * Aggregate invoice KPIs using server-side count and selective column fetch.
 */
export async function fetchInvoiceStats(): Promise<{ total: number; revenue: number; voided: number }> {
  if (!supabase) return { total: 0, revenue: 0, voided: 0 };
  const { count: total, error: totalError } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true });
  const { data: paidData, error: paidError } = await supabase
    .from('invoices').select('sales_total').eq('paymentStatus', 'paid');
  const { count: voided, error: voidedError } = await supabase
    .from('invoices').select('*', { count: 'exact', head: true }).eq('paymentStatus', 'void');

  if (totalError) console.error('[DB]', totalError.message);
  if (paidError) console.error('[DB]', paidError.message);
  if (voidedError) console.error('[DB]', voidedError.message);

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
  const { error } = await supabase.from('pets').upsert(pet);
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
  const { error } = await supabase.from('vaccinations').upsert(vaccine);
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
  const { error } = await supabase.from('lab_results').upsert(result);
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
  const { error } = await supabase.from('grooming_logs').upsert(log);
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
  const { error } = await supabase.from('boarding_records').upsert(record);
  if (error) throw error;
}

// ==========================================
// SYSTEM CONFIG (SUPABASE — cross-device permissions)
// ==========================================

export async function fetchSystemConfig(): Promise<SystemConfig | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('system_config')
    .select('*')
    .eq('id', 'global')
    .maybeSingle();
  if (error) {
    console.error('[DB] fetchSystemConfig error:', error.message);
    return null;
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
    selectedReceiptPrinter: data.selected_receipt_printer || '',
    selectedReportPrinter: data.selected_report_printer || '',
    receiptPaperSize: data.receipt_paper_size || '58mm',
    connectionType: data.connection_type || 'usb',
    localAutosaveInterval: Number(data.local_autosave_interval) || 15,
    cloudEndpoint: data.cloud_endpoint || '',
    cloudBackupEnabled: data.cloud_backup_enabled || false,
    emailDigestEnabled: data.email_digest_enabled || false,
    recipientEmails: data.recipient_emails || [],
    digestSchedule: data.digest_schedule || 'daily_end',
    rolePermissions: data.role_permissions || {},
    masterPin: data.master_pin || '',
    actionPolicies: data.action_policies || {},
    emailjsServiceId: data.emailjs_service_id || '',
    emailjsTemplateId: data.emailjs_template_id || '',
    emailjsPublicKey: data.emailjs_public_key || '',
    boardingRates: data.boarding_rates || {},
    defaultDepositCents: Number(data.default_deposit_cents) || 0,
    dummyAdminPin: data.dummy_admin_pin || '',
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
    selected_receipt_printer: config.selectedReceiptPrinter,
    selected_report_printer: config.selectedReportPrinter,
    receipt_paper_size: config.receiptPaperSize,
    connection_type: config.connectionType,
    local_autosave_interval: config.localAutosaveInterval,
    cloud_endpoint: config.cloudEndpoint,
    cloud_backup_enabled: config.cloudBackupEnabled,
    email_digest_enabled: config.emailDigestEnabled,
    recipient_emails: config.recipientEmails,
    digest_schedule: config.digestSchedule,
    role_permissions: config.rolePermissions,
    master_pin: config.masterPin,
    action_policies: config.actionPolicies,
    emailjs_service_id: config.emailjsServiceId,
    emailjs_template_id: config.emailjsTemplateId,
    emailjs_public_key: config.emailjsPublicKey,
    boarding_rates: config.boardingRates,
    default_deposit_cents: config.defaultDepositCents,
    dummy_admin_pin: config.dummyAdminPin,
    idle_logout_minutes: config.idleLogoutMinutes,
    setup_mode_active: config.setupModeActive,
  };
  const { error } = await supabase.from('system_config').upsert(payload);
  if (error) throw new Error(`CLOUD_SAVE_FAILED: ${error.message}`);
}

// ==========================================
// SUPPLIERS
// ==========================================

export async function fetchSuppliers(): Promise<Supplier[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_deleted', false)
    .order('name', { ascending: true });
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []) as Supplier[];
}

export async function upsertSupplier(supplier: Supplier): Promise<void> {
  if (!supplier || !supplier.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('suppliers').upsert(supplier);
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
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('inventory_categories')
    .select('*')
    .eq('is_deleted', false)
    .order('sort_order', { ascending: true });
  if (error) { console.error('[DB]', error.message); return []; }
  return (data || []) as InventoryCategory[];
}

export async function upsertInventoryCategory(cat: InventoryCategory): Promise<void> {
  if (!cat || !cat.id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('inventory_categories').upsert(cat);
  if (error) throw error;
}

export async function deleteInventoryCategory(id: string): Promise<void> {
  if (!id) return;
  if (!supabase) throw new Error('No internet connection');
  const { error } = await supabase.from('inventory_categories').update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}
