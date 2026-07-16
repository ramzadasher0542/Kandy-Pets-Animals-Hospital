/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import localforage from 'localforage';

// 1. Configure the core database driver to strictly use IndexedDB
localforage.config({
  driver: localforage.INDEXEDDB,
  name: 'CeylonPets_Enterprise_OS',
  version: 2.0,
  description: 'Unlimited capacity offline storage vault for CeylonPets Medical Suite'
});

// 2. Create isolated instances (Tables) for each major data matrix
export const db = {
  inventory: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'inventory' }),
  inventoryBatches: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'inventory_batches' }),
  appointments: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'appointments' }),
  records: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'records' }),
  invoices: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'invoices' }),
  shifts: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'shifts' }),
  notifications: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'notifications' }),
  alerts: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'alerts' }),
  system: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'system_config' }),
  users: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'users' }),
  clients: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'clients' }),
  cashAdjustments: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'cash_adjustments' }),
  shiftReconciliations: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'shift_reconciliations' }),
  
  pets: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'pets' }),
  vaccinations: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'vaccinations' }),
  labResults: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'lab_results' }),
  groomingLogs: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'grooming_logs' }),
  boardingRecords: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'boarding_records' }),

  // The original sync queue for cloud handoffs
  syncQueue: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'sync_queue' }),
  
  // THE LIVING FLOOR: Real-time clinic queue state machine
  clinicQueue: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'clinic_queue' }),

  // PAYROLL MODULE: Staff, time tracking, scheduling, and payroll
  staffProfiles: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'staff_profiles' }),
  timeEntries: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'time_entries' }),
  scheduleEntries: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'schedule_entries' }),
  payslips: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'payslips' }),

  // F-3: Audit trail for soft-deletions of clients and pets (owner oversight)
  deletionAudit: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'deletion_audit' }),

  // AUTH-3: Audit trail for every privileged-action authorization attempt
  // (granted, denied, or supervisor-overridden). Local-only by design — it is
  // deliberately NOT in syncEngine's STORE_MAPPINGS, so it never leaves the till.
  authAudit: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'auth_audit' })
};

/**
 * Universal Bootstrapper: 
 * Ensures all tables are initialized correctly on startup.
 * AUDIT FIX: Added persistent storage request and quota monitoring.
 */
export async function initializeDatabaseVault() {
  try {
    console.log('[CeylonPets Vault] Initializing high-capacity IndexedDB matrix...');
    // Just a quick dummy write/read to ensure the driver is locked and ready
    await db.system.setItem('vault_status', 'active');

    // AUDIT FIX: Request persistent storage to prevent browser eviction
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persist();
      console.log(`[CeylonPets Vault] Persistent storage: ${isPersisted ? 'GRANTED' : 'DENIED'}`);
    }

    // AUDIT FIX: Log storage quota for monitoring
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const usedMB = ((usage || 0) / (1024 * 1024)).toFixed(2);
      const quotaMB = ((quota || 0) / (1024 * 1024)).toFixed(0);
      const pct = quota ? (((usage || 0) / quota) * 100).toFixed(1) : '0';
      console.log(`[CeylonPets Vault] Storage: ${usedMB}MB / ${quotaMB}MB (${pct}% used)`);
    }

    console.log('[CeylonPets Vault] Database instances ready. 5MB limits bypassed.');
    return true;
  } catch (error) {
    console.error('[CeylonPets Vault] CRITICAL FAILURE: Could not mount IndexedDB.', error);
    return false;
  }
}

/**
 * SYNC ENGINE: Stamps a record as dirty with an updated_at timestamp.
 * The sync engine reads _dirty to know which records need to be pushed to Supabase.
 * After successful push, _dirty is cleared by the sync engine.
 */
export function stampRecord<T extends Record<string, any>>(record: T): T & { _dirty: boolean; updated_at: string } {
  return {
    ...record,
    updated_at: new Date().toISOString(),
    _dirty: true
  };
}

/**
 * AUDIT FIX: Safe DB write wrapper that catches QuotaExceededError
 * and other IndexedDB failures gracefully instead of crashing the chain.
 * Returns true on success, false on failure.
 */
export async function safeDbWrite<T>(
  store: LocalForage,
  key: string,
  value: T
): Promise<boolean> {
  try {
    await store.setItem(key, value);
    return true;
  } catch (error: any) {
    const isQuotaError = error?.name === 'QuotaExceededError' 
      || error?.code === 22 
      || error?.message?.includes('quota');
    
    if (isQuotaError) {
      console.error(`[CeylonPets Vault] STORAGE FULL: Cannot write to "${key}". Clear old data or increase quota.`);
    } else {
      console.error(`[CeylonPets Vault] DB write failed for "${key}":`, error);
    }
    return false;
  }
}

