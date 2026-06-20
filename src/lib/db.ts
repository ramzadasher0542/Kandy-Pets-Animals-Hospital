/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db } from './localDb';
import localforage from 'localforage';
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
  ClinicQueueItem
} from '../types';

// Clients DB is imported from localDb.ts

// ==========================================
// INVENTORY (DELTA UPDATES)
// ==========================================
export async function fetchInventory(): Promise<InventoryItem[]> {
  const items: InventoryItem[] = [];
  await db.inventory.iterate((value: InventoryItem) => {
    if (value && !Array.isArray(value)) items.push(value);
  });
  return items;
}

export async function upsertInventoryItem(item: InventoryItem): Promise<void> {
  if (!item || !item.id) return;
  
  // If it's a service, wipe stock bounds logically
  if (item.category === 'lab_service' || item.category === 'service') { 
    item.stock = 0; 
    item.minStock = 0; 
  }
  
  // True Delta Update - No race conditions
  await db.inventory.setItem(item.id, item);
}

export async function deleteInventoryItem(id: string): Promise<void> {
  if (!id) return;
  await db.inventory.removeItem(id);
}

export async function updateInventoryStockCAS(itemId: string, newStock: number, expectedStock: number): Promise<void> {
  const item = await db.inventory.getItem<InventoryItem>(itemId);
  if (!item || item.stock !== expectedStock) {
    throw new Error('CAS_MISMATCH');
  }
  item.stock = newStock;
  await db.inventory.setItem(itemId, item);
}

// ==========================================
// APPOINTMENTS
// ==========================================
export async function fetchAppointments(): Promise<Appointment[]> {
  const items: Appointment[] = [];
  await db.appointments.iterate((value: Appointment) => {
    if (value && !Array.isArray(value) && (value.status === 'booked' || value.status === 'in-progress')) {
      items.push(value);
    }
  });
  return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
  await db.appointments.setItem(apt.id, formattedApt);
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
  const records: MedicalRecord[] = [];
  await db.records.iterate((value: MedicalRecord) => {
    if (value && !Array.isArray(value)) records.push(value);
  });
  return records.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime());
}

export async function upsertMedicalRecord(rec: MedicalRecord): Promise<void> {
  if (!rec || !rec.id) return;
  const formattedRec = {
    ...rec,
    visitDate: formatDisplayDate(rec.visitDate)
  };
  await db.records.setItem(rec.id, formattedRec);
}

export async function deleteMedicalRecord(id: string): Promise<void> {
  if (!id) return;
  await db.records.removeItem(id);
}

// ==========================================
// INVOICES & AUTOMATION
// ==========================================
export async function fetchInvoices(): Promise<Invoice[]> {
  const invoices: Invoice[] = [];
  await db.invoices.iterate((value: Invoice) => {
    if (value && !Array.isArray(value) && value.paymentStatus !== 'void') invoices.push(value);
  });
  return invoices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export async function upsertInvoice(inv: Invoice): Promise<void> {
  if (!inv || !inv.id) return;
  const formattedInv = {
    ...inv,
    date: formatDisplayDate(inv.date)
  };

  await db.invoices.setItem(inv.id, formattedInv);

  // Cross-module cascade: Auto-complete appointment
  if (inv.appointmentId) {
    const apt = await db.appointments.getItem<Appointment>(inv.appointmentId);
    if (apt) {
      apt.status = 'completed';
      await db.appointments.setItem(apt.id, apt);
    }
  }
}

// ==========================================
// NOTIFICATIONS
// ==========================================
export async function fetchNotifications(): Promise<ClientNotification[]> {
  const notifs: ClientNotification[] = [];
  await db.notifications.iterate((value: ClientNotification) => {
    if (value && !Array.isArray(value)) notifs.push(value);
  });
  return notifs;
}

export async function upsertNotification(notif: ClientNotification): Promise<void> {
  if (!notif || typeof notif !== 'object' || !notif.id) {
    console.warn('[CeylonPets POS] Rejected malformed or empty notification payload.');
    return;
  }
  await db.notifications.setItem(notif.id, notif);
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
    console.warn('[CeylonPets POS] Rejected malformed or empty system alert payload.');
    return;
  }
  await db.alerts.setItem(alert.id, alert);
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
  let retailRevenue = 0;

  // Stream invoices natively from DB without loading full arrays
  await db.invoices.iterate((inv: Invoice) => {
    if (inv && !Array.isArray(inv) && inv.shiftId === shiftId && inv.paymentStatus === 'paid') {
      grossSales += Math.round(inv.sales_total || 0);
      totalCogs += Math.round(inv.cogs || 0);
      
      inv.items?.forEach(item => {
        const isService = item.category === 'service' || item.category === 'lab_service';
        const itemPrice = item.unitPrice || 0;
        const itemQty = item.quantity || 0;
        const computedTotal = Math.round(itemPrice * itemQty);

        if (isService) {
          clinicalRevenue += computedTotal;
        } else {
          retailRevenue += computedTotal;
        }
      });
    }
  });

  return {
    gross_sales: grossSales,
    total_cogs: totalCogs,
    cogs: totalCogs,
    net_profit: Math.round(grossSales - totalCogs),
    category_breakdown: [
      { category: 'service', total: clinicalRevenue },
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
    opening_float: openingFloatCents / 100,
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
      actual_cash: actualCashCents / 100,
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
  const shift = await db.shifts.getItem<any>(activeId);
  if (shift && shift.isOpen) {
    if (method === 'cash') shift.cashCollectedCents = (shift.cashCollectedCents || 0) + Math.round(amountCents);
    if (method === 'card') shift.cardCollectedCents = (shift.cardCollectedCents || 0) + Math.round(amountCents);
    if (method === 'bank_transfer') shift.bankTransferCollectedCents = (shift.bankTransferCollectedCents || 0) + Math.round(amountCents);
    await db.shifts.setItem(activeId, shift);
  }
}

// ==========================================
// CLIENTS
// ==========================================
export async function fetchClients(): Promise<Client[]> {
  const clients: Client[] = [];
  let hasWalkIn = false;

  await db.clients.iterate((value: Client) => {
    if (value && !Array.isArray(value)) {
      clients.push(value);
      if (value.client_id === 'walk_in_retail') hasWalkIn = true;
    }
  });

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
    await db.clients.setItem('walk_in_retail', walkInClient);
    clients.unshift(walkInClient);
  }
  return clients;
}

export async function upsertClient(client: Client): Promise<void> {
  if (!client || !client.client_id) return;
  await db.clients.setItem(client.client_id, client);
}

// ==========================================
// SYSTEM MAINTENANCE
// ==========================================
export async function fetchFullSystemState(): Promise<any> {
  const state: any = {
    app: 'CeylonPets',
    version: '2.0.0', // Phase 8 IndexedDB Architecture
    timestamp: new Date().toISOString(),
    collections: {
      inventory: await fetchInventory(),
      appointments: await fetchAppointments(),
      records: await fetchMedicalRecords(),
      invoices: await fetchInvoices(),
      pos_shifts: [], // Assuming separate sync logic if needed
      system_alerts: await fetchAlerts(),
      notifications: await fetchNotifications()
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
    db.clients.clear()
  ]);
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

  await Promise.all(writePromises);
}

// ==========================================
// THE LIVING FLOOR: Clinic Queue State Machine
// ==========================================
export async function fetchClinicQueue(): Promise<ClinicQueueItem[]> {
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => {
    if (value && !Array.isArray(value)) queue.push(value);
  });
  return queue.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
}

export async function addToClinicQueue(item: ClinicQueueItem): Promise<void> {
  if (!item || !item.id) return;
  await db.clinicQueue.setItem(item.id, item);
}

export async function updateQueueItemStatus(id: string, status: 'scheduled' | 'active' | 'completed'): Promise<void> {
  const item = await db.clinicQueue.getItem<ClinicQueueItem>(id);
  if (item) {
    item.status = status;
    await db.clinicQueue.setItem(id, item);
  }
}

export async function removeFromClinicQueue(id: string): Promise<void> {
  if (!id) return;
  await db.clinicQueue.removeItem(id);
}

export async function getActiveQueueItems(): Promise<ClinicQueueItem[]> {
  const queue: ClinicQueueItem[] = [];
  await db.clinicQueue.iterate((value: ClinicQueueItem) => {
    if (value && !Array.isArray(value) && value.status === 'active') {
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

export async function fetchInvoices() { const items: any[] = []; await db.invoices.iterate((value) => { if (value && !Array.isArray(value)) items.push(value); }); return items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); }

export async function upsertInvoice(invoice: any) { if (!invoice || !invoice.id) return; await db.invoices.setItem(invoice.id, invoice); }
