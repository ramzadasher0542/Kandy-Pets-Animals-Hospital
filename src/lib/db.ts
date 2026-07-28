/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, safeDbWrite, stampRecord } from './localDb';
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
  InventoryBatch
} from '../types';

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

  const existingItem = await db.inventory.getItem<InventoryItem>(item.id);
  if (!existingItem) {
    let duplicateFound = false;
    await db.inventory.iterate((existing: InventoryItem) => {
      if (existing && !Array.isArray(existing) && existing.sku === item.sku) {
        duplicateFound = true;
      }
    });
    if (duplicateFound) {
      throw new Error('DUPLICATE_SKU: An item with this SKU already exists.');
    }
  }

  // If it's a service, wipe stock bounds logically
  if (item.category === 'lab_service' || item.category === 'service') { 
    item.stock = 0; 
    item.minStock = 0; 
  }
  
  if (!supabase) throw new Error('No internet connection');
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
  const { error } = await supabase.from('inventory').delete().eq('id', id);
  if (error) throw error;

  // Clean up related batches. Never throw — the item delete already succeeded.
  const { error: batchError } = await supabase.from('inventory_batches').delete().eq('inventoryItemId', id);
  if (batchError) console.error('[DB] Batch cleanup failed:', batchError.message);
}

/**
 * AUDIT FIX: True atomic stock decrement — reads current stock from IndexedDB
 * (not stale React state), applies delta, and writes back.
 * Implements FEFO (First Expiry, First Out) batch consumption.
 */
export async function atomicStockDecrement(itemId: string, qtyDelta: number): Promise<number> {
  const unlock = await globalMutex.lock();
  try {
    const item = await db.inventory.getItem<InventoryItem>(itemId);
    if (!item) {
      throw new Error(`ITEM_NOT_FOUND: ${itemId}`);
    }
    const newStock = Math.max(0, item.stock + qtyDelta);

    // Fetch all batches for this item from Supabase
    if (!supabase) throw new Error('No internet connection');
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
export async function fetchAppointments(): Promise<Appointment[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('appointments').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as Appointment[];
  return items
    .filter(value => value.status === 'booked' || value.status === 'in-progress')
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function fetchHistoricalAppointmentsArchive(
  page = 0,
  limit = 50,
  search?: string
): Promise<{ appointments: Appointment[]; count: number }> {
  let filtered: Appointment[] = [];
  
  await db.appointments.iterate((a: Appointment) => {
    if (a && !Array.isArray(a) && (a.status === 'completed' || a.status === 'cancelled')) {
      filtered.push(a);
    }
  });

  if (search && search.trim() !== '') {
    const term = search.trim().toLowerCase();
    if (/^\d{4}-\d{2}-\d{2}$/.test(term)) {
      filtered = filtered.filter(a => a.date === term);
    } else {
      filtered = filtered.filter(a => 
        a.petName.toLowerCase().includes(term) || 
        a.ownerName.toLowerCase().includes(term)
      );
    }
  }

  filtered.sort((a, b) => {
    const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.time.localeCompare(a.time);
  });

  const count = filtered.length;
  const start = page * limit;
  const end = start + limit;
  return { appointments: filtered.slice(start, end), count };
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

export async function fetchVeterinarians(): Promise<User[]> {
  const users: User[] = [];
  await db.users.iterate((value: User) => {
    if (value && !Array.isArray(value) && (value.role === 'veterinarian' || value.role === 'admin')) {
      users.push(value);
    }
  });
  return users.sort((a, b) => a.name.localeCompare(b.name));
}

// ==========================================
// MEDICAL RECORDS
// ==========================================
export async function fetchMedicalRecords(): Promise<MedicalRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('medical_records').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
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

  if (rec.patientId) {
    const pet = await db.pets.getItem<Pet>(rec.patientId);
    if (pet) {
      if (!pet.recordIds) pet.recordIds = [];
      if (!pet.recordIds.includes(rec.id)) {
        pet.recordIds.push(rec.id);
        await db.pets.setItem(rec.patientId, stampRecord(pet));
      }
    }
  }
}

export async function deleteMedicalRecord(id: string): Promise<void> {
  if (!id) return;
  // FIXED: Soft delete instead of hard delete for data integrity
  const rec = await db.records.getItem<MedicalRecord>(id);
  if (rec) {
    (rec as any).is_deleted = true;
    // BUG #8 FIX: Stamp for sync so deletion reaches Supabase
    await db.records.setItem(id, stampRecord(rec));
  }
}

// ==========================================
// INVOICES & AUTOMATION
// ==========================================
export async function fetchInvoices(): Promise<Invoice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('invoices').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
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
  if (inv.appointmentId) {
    const apt = await db.appointments.getItem<Appointment>(inv.appointmentId);
    if (apt) {
      apt.status = 'completed';
      await db.appointments.setItem(apt.id, stampRecord(apt));
    }
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
  await db.notifications.setItem(notif.id, stampRecord(notif));
}

// ==========================================
// ALERTS
// ==========================================
export async function fetchAlerts(): Promise<SystemAlert[]> {
  const alerts: SystemAlert[] = [];
  await db.alerts.iterate((value: SystemAlert) => {
    if (value && !Array.isArray(value)) alerts.push(value);
  });
  return alerts;
}

export async function upsertAlert(alert: SystemAlert): Promise<void> {
  if (!alert || typeof alert !== 'object' || !alert.id) {
    if (import.meta.env.DEV) console.warn('[CeylonPets POS] Rejected malformed or empty system alert payload.');
    return;
  }
  await db.alerts.setItem(alert.id, stampRecord(alert));
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

  // Stream invoices natively from DB without loading full arrays
  await db.invoices.iterate((inv: Invoice) => {
    if (inv && !Array.isArray(inv) && inv.shiftId === shiftId && inv.paymentStatus === 'paid') {
      grossSales += Math.round(inv.sales_total || 0);
      totalCogs += Math.round(inv.cogs || 0);
      
      // AUDIT FIX: 5-category breakdown instead of 2
      inv.items?.forEach(item => {
        const itemPrice = item.unitPrice || 0;
        const itemQty = item.quantity || 0;
        const computedTotal = Math.round(itemPrice * itemQty);

        if (item.category === 'service') clinicalRevenue += computedTotal;
        else if (item.category === 'lab_service') labRevenue += computedTotal;
        else if (item.category === 'vaccine') vaccineRevenue += computedTotal;
        else if (item.category === 'prescription') prescriptionRevenue += computedTotal;
        else retailRevenue += computedTotal;
      });
    }
  });

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
    ]
  };
}

export async function fetchLowStockCount(): Promise<number> {
  let count = 0;
  await db.inventory.iterate((item: InventoryItem) => {
    if (item && !Array.isArray(item) && item.category !== 'service' && item.category !== 'lab_service' && item.stock <= item.minStock) {
      count++;
    }
  });
  return count;
}

// LocalStorage is ONLY permitted for this single scalar reference ID
export async function fetchActiveShiftId(): Promise<string | null> {
  return localStorage.getItem('ceylon_active_shift_id') || null;
}

export async function fetchActiveShiftDetails(): Promise<Shift | null> {
  const activeId = localStorage.getItem('ceylon_active_shift_id');
  if (!activeId) return null;
  const shift = await db.shifts.getItem<Shift>(activeId);
  return (shift && shift.isOpen) ? shift : null;
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

  await db.shifts.setItem(newShiftId, newShift);
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
  const shift = await db.shifts.getItem<Shift>(shiftId);
  
  if (shift) {
    const now = new Date().toISOString();
    const updatedShift = {
      ...shift,
      endTime: now,
      expectedCashCents: Math.round(expectedCashCents),
      actualCashCents: Math.round(actualCashCents),
      discrepancyCents: Math.round(discrepancyCents),
      notes: notes || 'Shift closed',
      isOpen: false,
      actual_cash: Math.round(actualCashCents) / 100, // FIXED: ensure integer before division
      discrepancy_reason: notes || '',
      updated_at: now
    };
    await db.shifts.setItem(shiftId, updatedShift);
  }
  localStorage.removeItem('ceylon_active_shift_id');
}

export async function addRevenueToActiveShift(method: PaymentMethod, amountCents: number): Promise<void> {
  const activeId = localStorage.getItem('ceylon_active_shift_id');
  if (!activeId) return;
  const unlock = await globalMutex.lock();
  try {
    const shift = await db.shifts.getItem<Shift>(activeId); // FIXED: type-safe instead of <any>
    if (shift && shift.isOpen) {
      if (method === 'cash') shift.cashCollectedCents = (shift.cashCollectedCents || 0) + Math.round(amountCents);
      if (method === 'card') shift.cardCollectedCents = (shift.cardCollectedCents || 0) + Math.round(amountCents);
      if (method === 'bank_transfer') shift.bankTransferCollectedCents = (shift.bankTransferCollectedCents || 0) + Math.round(amountCents);
      await safeDbWrite(db.shifts, activeId, shift);
    }
  } finally {
    unlock();
  }
}

// ==========================================
// CLIENTS
// ==========================================
export async function fetchClients(): Promise<Client[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('clients').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const clients: Client[] = [];
  let hasWalkIn = false;

  for (const value of (data || []) as Client[]) {
    if (!(value as any).is_deleted) {
      clients.push(value);
      if (value.client_id === 'walk_in_retail') hasWalkIn = true;
    }
  }

  if (!hasWalkIn) {
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
    await db.clients.setItem('walk_in_retail', stampRecord(walkInClient));
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

// ==========================================
// SYSTEM MAINTENANCE
// ==========================================
export async function fetchFullSystemState(): Promise<any> {
  // FIXED: Include ALL collections in backup (was missing shifts, clients, clinicQueue)
  const shifts: Shift[] = [];
  await db.shifts.iterate((value: Shift) => { if (value && !Array.isArray(value)) shifts.push(value); });
  const clients: Client[] = [];
  await db.clients.iterate((value: Client) => { if (value && !Array.isArray(value)) clients.push(value); });
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => { if (value && !Array.isArray(value)) queue.push(value); });
  const pets: Pet[] = [];
  await db.pets.iterate((value: Pet) => { if (value && !Array.isArray(value)) pets.push(value); });
  const vaccinations: Vaccination[] = [];
  await db.vaccinations.iterate((value: Vaccination) => { if (value && !Array.isArray(value)) vaccinations.push(value); });
  const labResults: LabResult[] = [];
  await db.labResults.iterate((value: LabResult) => { if (value && !Array.isArray(value)) labResults.push(value); });
  const groomingLogs: GroomingLog[] = [];
  await db.groomingLogs.iterate((value: GroomingLog) => { if (value && !Array.isArray(value)) groomingLogs.push(value); });
  const boardingRecords: BoardingRecord[] = [];
  await db.boardingRecords.iterate((value: BoardingRecord) => { if (value && !Array.isArray(value)) boardingRecords.push(value); });

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
      clients: clients,
      clinicQueue: queue,
      system_alerts: await fetchAlerts(),
      notifications: await fetchNotifications(),
      pets,
      vaccinations,
      labResults,
      groomingLogs,
      boardingRecords
    }
  };
  return state;
}

export async function masterSystemPurge(): Promise<void> {
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
}

/**
 * NUCLEAR-ERASE: clear EVERY localforage store — all clinic data plus the
 * `system` store that holds SystemConfig — so nothing survives locally. Config
 * is "reset to minimal defaults" by emptying db.system: on the next boot the
 * app re-applies its built-in default SystemConfig (App.tsx useState) because
 * there is no stored config to hydrate from.
 *
 * Unlike masterSystemPurge (which clears a fixed subset), this iterates every
 * store on `db`, so newly-added stores are covered automatically. Pairs with
 * wipeAllCloudTables() for the cloud side and the NEVER_SEED flag to block any
 * demo reseed.
 */
export async function nuclearWipeLocal(): Promise<void> {
  await Promise.all(
    Object.values(db).map((store: any) =>
      store && typeof store.clear === 'function' ? store.clear() : Promise.resolve()
    )
  );
  localStorage.removeItem('ceylon_active_shift_id');
}

export async function reconstituteSystemState(payload: any): Promise<void> {
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
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => {
    // BUG #6 FIX: Filter out soft-deleted queue items
    if (value && !Array.isArray(value) && !(value as any).is_deleted) queue.push(value);
  });
  return queue.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

export async function addToClinicQueue(item: ClinicQueueItem): Promise<void> {
  if (!item || !item.id) return;
  // BUG #5 FIX: Stamp for sync so queue items reach Supabase
  await db.clinicQueue.setItem(item.id, stampRecord(item));
}

export async function updateQueueItemStatus(id: string, status: 'scheduled' | 'active' | 'completed'): Promise<void> {
  const item = await db.clinicQueue.getItem<ClinicQueueItem>(id);
  if (item) {
    item.status = status;
    // BUG #5 FIX: Stamp for sync
    await db.clinicQueue.setItem(id, stampRecord(item));
  }
}

export async function removeFromClinicQueue(id: string): Promise<void> {
  if (!id) return;
  // BUG #6 FIX: Soft-delete instead of hard-delete so sync engine can push deletion
  const item = await db.clinicQueue.getItem<ClinicQueueItem>(id);
  if (item) {
    (item as any).is_deleted = true;
    (item as any).status = 'completed';
    await db.clinicQueue.setItem(id, stampRecord(item));
  }
}

export async function getActiveQueueItems(): Promise<ClinicQueueItem[]> {
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => {
    if (value && !Array.isArray(value) && value.status === 'active' && !(value as any).is_deleted) {
      queue.push(value);
    }
  });
  return queue.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

export async function getQueueItemsByService(serviceType: string): Promise<ClinicQueueItem[]> {
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => {
    if (value && !Array.isArray(value) && value.serviceType === serviceType) {
      queue.push(value);
    }
  });
  return queue.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

// ==========================================
// FULL DATABASE EXPORT & RESTORE
// ==========================================
export async function exportFullDatabase(): Promise<string> {
  const unlock = await globalMutex.lock();
  try {
    const data: any = {
      clients: [],
      inventory: [],
      appointments: [],
      medicalRecords: [],
      invoices: [],
      shifts: [],
      alerts: [],
      notifications: [],
      clinicQueue: [],
      system: [],
      pets: [],
      vaccinations: [],
      labResults: [],
      groomingLogs: [],
      boardingRecords: []
    };

    await db.clients.iterate((value: any, key: string) => { data.clients.push(value); });
    await db.inventory.iterate((value: any, key: string) => { data.inventory.push(value); });
    await db.appointments.iterate((value: any, key: string) => { data.appointments.push(value); });
    await db.records.iterate((value: any, key: string) => { data.medicalRecords.push(value); });
    await db.invoices.iterate((value: any, key: string) => { data.invoices.push(value); });
    await db.shifts.iterate((value: any, key: string) => { data.shifts.push(value); });
    await db.alerts.iterate((value: any, key: string) => { data.alerts.push(value); });
    await db.notifications.iterate((value: any, key: string) => { data.notifications.push(value); });
    await db.clinicQueue.iterate((value: any, key: string) => { data.clinicQueue.push(value); });
    await db.system.iterate((value: any, key: string) => { data.system.push({ key, value }); });
    await db.pets.iterate((value: any, key: string) => { data.pets.push(value); });
    await db.vaccinations.iterate((value: any, key: string) => { data.vaccinations.push(value); });
    await db.labResults.iterate((value: any, key: string) => { data.labResults.push(value); });
    await db.groomingLogs.iterate((value: any, key: string) => { data.groomingLogs.push(value); });
    await db.boardingRecords.iterate((value: any, key: string) => { data.boardingRecords.push(value); });

    return JSON.stringify(data);
  } finally {
    unlock();
  }
}

export async function restoreFullDatabase(jsonData: string): Promise<void> {
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
 * Boot-optimized: Returns only today's medical records + active boarding.
 * Prevents loading thousands of historical records into React memory.
 */
export async function fetchTodaysRecords(): Promise<MedicalRecord[]> {
  const today = formatDisplayDate(new Date());
  const records: MedicalRecord[] = [];
  await db.records.iterate((value: MedicalRecord) => {
    if (value && !Array.isArray(value) && !(value as any).is_deleted) {
      // Include today's records
      if (value.visitDate === today) {
        records.push(value);
      }
    }
  });
  return records.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

/**
 * Boot-optimized: Returns only today's invoices.
 * Prevents loading thousands of historical invoices into React memory.
 */
export async function fetchTodaysInvoices(): Promise<Invoice[]> {
  const today = formatDisplayDate(new Date());
  const invoices: Invoice[] = [];
  await db.invoices.iterate((value: Invoice) => {
    if (value && !Array.isArray(value) && value.date === today) {
      invoices.push(value);
    }
  });
  return invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * On-demand paginated invoice query for InvoicesManager.
 * Streams through IndexedDB with optional search and status filter.
 */
export async function fetchPaginatedInvoices(
  page = 0,
  limit = 50,
  search?: string,
  statusFilter?: string
): Promise<{ invoices: Invoice[]; total: number }> {
  let filtered: Invoice[] = [];
  await db.invoices.iterate((value: Invoice) => {
    if (value && !Array.isArray(value)) {
      filtered.push(value);
    }
  });

  if (statusFilter && statusFilter !== 'All') {
    filtered = filtered.filter(i => i.paymentStatus === statusFilter);
  }

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(inv =>
      (inv.id || '').toLowerCase().includes(q) ||
      (inv.ownerName || '').toLowerCase().includes(q) ||
      (inv.petName || '').toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const total = filtered.length;
  const start = page * limit;
  return { invoices: filtered.slice(start, start + limit), total };
}

/**
 * On-demand paginated medical records query for MedicalRecordsManager "All History" mode.
 */
export async function fetchPaginatedRecords(
  page = 0,
  limit = 50,
  search?: string
): Promise<{ records: MedicalRecord[]; total: number }> {
  let filtered: MedicalRecord[] = [];
  await db.records.iterate((value: MedicalRecord) => {
    if (value && !Array.isArray(value) && !(value as any).is_deleted) {
      filtered.push(value);
    }
  });

  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(r =>
      (r.ownerName || '').toLowerCase().includes(q) ||
      (r.ownerPhone || '').includes(q) ||
      ((r as any).petName || '').toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
  const total = filtered.length;
  const start = page * limit;
  return { records: filtered.slice(start, start + limit), total };
}

/**
 * Aggregate invoice KPIs by streaming through IndexedDB.
 * Used by InvoicesManager for all-time statistics without loading full arrays.
 */
export async function fetchInvoiceStats(): Promise<{ total: number; revenue: number; voided: number }> {
  let total = 0, revenue = 0, voided = 0;
  await db.invoices.iterate((inv: Invoice) => {
    if (inv && !Array.isArray(inv)) {
      total++;
      if (inv.paymentStatus === 'paid') revenue += inv.sales_total || 0;
      if (inv.paymentStatus === 'void') voided++;
    }
  });
  return { total, revenue: Math.round(revenue * 100) / 100, voided };
}

// ==========================================
// NEW ARCHITECTURE DATA STORES (PETS & RELATED)
// ==========================================

// PETS
export async function fetchPets(): Promise<Pet[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('pets').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as Pet[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertPet(pet: Pet): Promise<void> {
  if (!pet || !pet.id) return;
  await db.pets.setItem(pet.id, stampRecord(pet));
  
  if (pet.clientId) {
    const client = await db.clients.getItem<Client>(pet.clientId);
    if (client) {
      if (!client.petIds) client.petIds = [];
      if (!client.petIds.includes(pet.id)) {
        client.petIds.push(pet.id);
        await db.clients.setItem(pet.clientId, stampRecord(client));
      }
    }
  }
}

export async function deletePet(id: string): Promise<void> {
  if (!id) return;
  const item = await db.pets.getItem<Pet>(id);
  if (item) {
    (item as any).is_deleted = true;
    await db.pets.setItem(id, stampRecord(item));
  }
}

// VACCINATIONS
export async function fetchVaccinations(): Promise<Vaccination[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('vaccinations').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as Vaccination[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertVaccination(vaccine: Vaccination): Promise<void> {
  if (!vaccine || !vaccine.id) return;
  await db.vaccinations.setItem(vaccine.id, stampRecord(vaccine));
  
  if (vaccine.petId) {
    const pet = await db.pets.getItem<Pet>(vaccine.petId);
    if (pet) {
      if (!pet.vaccineIds) pet.vaccineIds = [];
      if (!pet.vaccineIds.includes(vaccine.id)) {
        pet.vaccineIds.push(vaccine.id);
        await db.pets.setItem(vaccine.petId, stampRecord(pet));
      }
    }
  }
}

// LAB RESULTS
export async function fetchLabResults(): Promise<LabResult[]> {
  const items: LabResult[] = [];
  await db.labResults.iterate((value: LabResult) => {
    if (value && !Array.isArray(value) && !(value as any).is_deleted) items.push(value);
  });
  return items;
}

export async function upsertLabResult(result: LabResult): Promise<void> {
  if (!result || !result.id) return;
  await db.labResults.setItem(result.id, stampRecord(result));
  
  if (result.petId) {
    const pet = await db.pets.getItem<Pet>(result.petId);
    if (pet) {
      if (!pet.labIds) pet.labIds = [];
      if (!pet.labIds.includes(result.id)) {
        pet.labIds.push(result.id);
        await db.pets.setItem(result.petId, stampRecord(pet));
      }
    }
  }
}

// GROOMING LOGS
export async function fetchGroomingLogs(): Promise<GroomingLog[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('grooming_logs').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as GroomingLog[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertGroomingLog(log: GroomingLog): Promise<void> {
  if (!log || !log.id) return;
  await db.groomingLogs.setItem(log.id, stampRecord(log));
  
  if (log.petId) {
    const pet = await db.pets.getItem<Pet>(log.petId);
    if (pet) {
      if (!pet.groomingIds) pet.groomingIds = [];
      if (!pet.groomingIds.includes(log.id)) {
        pet.groomingIds.push(log.id);
        await db.pets.setItem(log.petId, stampRecord(pet));
      }
    }
  }
}

// BOARDING RECORDS
export async function fetchBoardingRecords(): Promise<BoardingRecord[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('boarding_records').select('*');
  if (error) { console.error('[DB]', error.message); return []; }
  const items = (data || []) as BoardingRecord[];
  return items.filter(value => !(value as any).is_deleted);
}

export async function upsertBoardingRecord(record: BoardingRecord): Promise<void> {
  if (!record || !record.id) return;
  await db.boardingRecords.setItem(record.id, stampRecord(record));
  
  if (record.petId) {
    const pet = await db.pets.getItem<Pet>(record.petId);
    if (pet) {
      if (!pet.boardingIds) pet.boardingIds = [];
      if (!pet.boardingIds.includes(record.id)) {
        pet.boardingIds.push(record.id);
        await db.pets.setItem(record.petId, stampRecord(pet));
      }
    }
  }
}
