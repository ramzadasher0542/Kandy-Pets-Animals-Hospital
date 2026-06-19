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
  appointments: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'appointments' }),
  records: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'records' }),
  invoices: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'invoices' }),
  shifts: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'shifts' }),
  notifications: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'notifications' }),
  alerts: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'alerts' }),
  system: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'system_config' }),
  users: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'users' }),
  clients: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'clients' }),
  
  // The original sync queue for cloud handoffs
  syncQueue: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'sync_queue' }),
  
  // THE LIVING FLOOR: Real-time clinic queue state machine
  clinicQueue: localforage.createInstance({ name: 'CeylonPets_Enterprise_OS', storeName: 'clinic_queue' })
};

/**
 * Universal Bootstrapper: 
 * Ensures all tables are initialized correctly on startup.
 */
export async function initializeDatabaseVault() {
  try {
    console.log('[CeylonPets Vault] Initializing high-capacity IndexedDB matrix...');
    // Just a quick dummy write/read to ensure the driver is locked and ready
    await db.system.setItem('vault_status', 'active');
    console.log('[CeylonPets Vault] Database instances ready. 5MB limits bypassed.');
    return true;
  } catch (error) {
    console.error('[CeylonPets Vault] CRITICAL FAILURE: Could not mount IndexedDB.', error);
    return false;
  }
}
