/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useRef } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ClinicErrorBoundary extends React.Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // SECURITY FIX: Only log detailed errors in development
    if (import.meta.env.DEV) {
      console.error('[CeylonPets Core] Critical layout exception trapped by safety boundary:', error, errorInfo);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-screen p-8 flex items-center justify-center bg-slate-50 text-xs">
          <div className="max-w-md w-full bg-white border border-rose-200 p-6 rounded-2xl shadow-sm text-center space-y-4">
            <div className="text-rose-600 text-lg font-black">🐾 Recovery Mode Intercepted</div>
            <p className="text-slate-600 font-semibold leading-relaxed">
              A view formatting discrepancy occurred inside a panel. The data state wrapper has been kept isolated and preserved safely to prevent data loss.
            </p>
            <button
              onClick={() => { window.location.reload(); }}
              className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-xs cursor-pointer"
            >
              Hot Re-sync Application View
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

import { db, initializeDatabaseVault } from './lib/localDb';
import {
  Calculator, LayoutDashboard, Calendar, PawPrint, Users, Syringe,
  Stethoscope, TestTube, BriefcaseMedical, Package, FileText,
  BarChart3, Settings, LogOut, CloudLightning, Printer, Lock,
  ChevronLeft, PenTool, Home, Scissors, Activity
} from 'lucide-react';

import {
  InventoryItem, Appointment, MedicalRecord, ClientNotification,
  SystemAlert, Invoice, AppointmentStatus, OfflineSyncItem,
  ShiftReconciliation, ActiveShift, ClinicQueueItem
} from './types';

import DashboardAnalytics from './components/DashboardAnalytics';
import ReportsManager from './components/ReportsManager';
import POSRegister from './components/POSRegister';
import AppointmentsManager from './components/AppointmentsManager';
import MedicalRecordsManager from './components/MedicalRecordsManager';
import InventoryManager from './components/InventoryManager';
import PatientPortal from './components/PatientPortal';
import InvoicesManager from './components/InvoicesManager';
import SystemSettings, { SystemConfig } from './components/SystemSettings';
import ToastContainer, { showToast } from './components/Toast';
import CustomersManager from './components/CustomersManager';
import VaccinationsManager from './components/VaccinationsManager';
import LaboratoryManager from './components/LaboratoryManager';
import BoardingManager from './components/BoardingManager';
import GroomingManager from './components/GroomingManager';
import ShiftManager from './components/ShiftManager';

import {
  fetchClients, upsertClient, reconstituteSystemState,
  upsertInventoryItem, upsertAppointment, upsertMedicalRecord,
  deleteMedicalRecord, upsertInvoice, upsertAlert,
  fetchInventory, fetchAppointments, fetchMedicalRecords,
  fetchInvoices, fetchNotifications, fetchAlerts,
  fetchClinicQueue, addToClinicQueue, updateQueueItemStatus, removeFromClinicQueue, getActiveQueueItems,
  atomicStockDecrement
} from './lib/db';

function hashPin(pin: string): string {
  if (!pin) return '';
  const isPlaintext = /^\d{4}$/.test(pin);
  if (!isPlaintext) return pin;

  let hash = 5381;
  const salt = "CeylonPetsSecuritySalt";
  const combined = pin + salt;
  for (let i = 0; i < combined.length; i++) {
    hash = (hash * 33) ^ combined.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function App() {
  // SYSTEM BOOT STATE
  const [isBooting, setIsBooting] = useState(true);
  const [dbCorrupted, setDbCorrupted] = useState(false);

  // CORE DATA MATRICES (Now initialized empty, hydrated by DB)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [shiftLogs, setShiftLogs] = useState<ShiftReconciliation[]>([]);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [syncQueue, setSyncQueue] = useState<OfflineSyncItem[]>([]);
  const [pinCache, setPinCache] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);

  // THE LIVING FLOOR: Real-time clinic queue state
  const [clinicQueue, setClinicQueue] = useState<ClinicQueueItem[]>([]);

  const [systemConfig, setSystemConfig] = useState<SystemConfig>({
    appName: 'Ceylon Pets POS',
    resellerName: 'Ash Point Solutions',
    hospitalName: 'Ceylon Pets Animal Hospital',
    hospitalAddress: 'Kandy, Sri Lanka',
    hospitalPhone: '+94 81 234 5678',
    hospitalEmail: 'contact@ceylonpets.lk',
    invoiceLogo: '🐾',
    invoiceFooterMessage: 'Thank you for choosing Ceylon Pets!',
    invoiceSubFooterMessage: '* OFFICIAL RECEIPT *',
    invoiceExtraFooterMessage: 'POWERED BY ASH POINT SOLUTIONS',
    taxRate: 0.0825,
    currencySymbol: 'Rs. ',
    selectedReceiptPrinter: '',
    selectedReportPrinter: '',
    receiptPaperSize: '58mm',
    connectionType: 'usb',
    localAutosaveInterval: 15,
    cloudEndpoint: '',
    cloudBackupEnabled: false,
    emailDigestEnabled: false,
    recipientEmails: [],
    digestSchedule: 'daily_end',
    rolePermissions: {
      cashier: ['pos', 'shift'],
      veterinarian: ['dashboard', 'appointments', 'examinations', 'boarding', 'grooming', 'shift'],
      admin: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift']
    },
    masterPin: hashPin('5692')
  } as SystemConfig);

  // --- THE INDEXED-DB BOOTLOADER & MIGRATION ENGINE ---
  useEffect(() => {
    let isMounted = true;
    async function bootSequence() {
      try {
        if (import.meta.env.DEV) {
          console.log('[Bootloader] Initiating DB sequence...');
        }
        await initializeDatabaseVault();

        // Phase 1: Check for Legacy Migration
        const isMigrated = await db.system.getItem('indexeddb_migration_v1');
        if (!isMigrated) {
          if (import.meta.env.DEV) {
            console.log('[Bootloader] Migrating legacy localStorage to unlimited IndexedDB vault...');
          }
          const migrateItem = async (key: string, dbInstance: any) => {
            const legacy = localStorage.getItem(key);
            if (legacy) {
              try {
                const parsed = JSON.parse(legacy);
                if (Array.isArray(parsed)) {
                  await Promise.all(parsed.map((item: any) => {
                    if (item && item.id) return dbInstance.setItem(item.id, item);
                    return Promise.resolve();
                  }));
                } else if (parsed && parsed.id) {
                  await dbInstance.setItem(parsed.id, parsed);
                } else {
                  await dbInstance.setItem('data', parsed);
                }
              } catch (e) {
                if (import.meta.env.DEV) {
                  console.error(`[Bootloader] Failed to migrate ${key}:`, e);
                }
              }
            }
          };

          await migrateItem('ceylon_inventory_v2', db.inventory);
          await migrateItem('ceylon_appointments_v2', db.appointments);
          await migrateItem('ceylon_records_v2', db.records);
          await migrateItem('ceylon_invoices_v2', db.invoices);
          await migrateItem('ceylon_shifts_v1', db.shifts);
          await migrateItem('ceylon_sync_queue_v3', db.syncQueue);
          await migrateItem('ceylon_notifications_v2', db.notifications);
          await migrateItem('ceylon_alerts_v2', db.alerts);
          await migrateItem('ceylon_users_v3', db.users);

          const legacyShift = localStorage.getItem('ceylon_active_shift_v1');
          if (legacyShift) await db.system.setItem('active_shift', JSON.parse(legacyShift));

          const legacyConfig = localStorage.getItem('ceylon_system_config_v2');
          if (legacyConfig) await db.system.setItem('config', JSON.parse(legacyConfig));

          await db.system.setItem('indexeddb_migration_v1', true);
          if (import.meta.env.DEV) {
            console.log('[Bootloader] Migration successful. Data secured.');
          }
        }

        // Phase 1.5: Migrate from single key 'data' (Phase 7) to ID-based flat keys (Phase 8)
        const isPhase8Migrated = await db.system.getItem('indexeddb_migration_v2');
        if (!isPhase8Migrated) {
          if (import.meta.env.DEV) {
            console.log('[Bootloader] Migrating single-key data arrays to flat ID-based collections...');
          }

          const migrateStore = async (dbInstance: any, idField: string = 'id') => {
            const dataArray = await dbInstance.getItem('data');
            if (Array.isArray(dataArray)) {
              if (import.meta.env.DEV) {
                console.log(`[Bootloader] Migrating ${dataArray.length} items to flat keys...`);
              }
              await Promise.all(dataArray.map((item: any) => {
                if (item) {
                  const key = item[idField];
                  if (key) return dbInstance.setItem(key, item);
                }
                return Promise.resolve();
              }));
              await dbInstance.removeItem('data');
            }
          };

          await migrateStore(db.inventory);
          await migrateStore(db.appointments);
          await migrateStore(db.records);
          await migrateStore(db.invoices);
          await migrateStore(db.shifts);
          await migrateStore(db.notifications);
          await migrateStore(db.alerts);
          await migrateStore(db.users);
          await migrateStore(db.clients, 'client_id');
          await migrateStore(db.syncQueue);

          await db.system.setItem('indexeddb_migration_v2', true);
          if (import.meta.env.DEV) {
            console.log('[Bootloader] Phase 8 flat migration complete.');
          }
        }

        // Phase 2: Hydrate Memory from DB (With Corruption Safety Net)
        try {
          const hInventory = await fetchInventory();
          const hAppointments = await fetchAppointments();
          const hRecords = await fetchMedicalRecords();
          const hInvoices = await fetchInvoices();

          const hShifts: any[] = [];
          await db.shifts.iterate((value: any) => { if (value) hShifts.push(value); });

          const hSyncQueue: any[] = [];
          await db.syncQueue.iterate((value: any) => { if (value) hSyncQueue.push(value); });

          const hNotifications = await fetchNotifications();
          const hAlerts = await fetchAlerts();

          const hUsers: any[] = [];
          await db.users.iterate((value: any) => { if (value) hUsers.push(value); });

          const hClinicQueue: ClinicQueueItem[] = [];
          await db.clinicQueue.iterate((value: any) => { if (value) hClinicQueue.push(value); });

          const hActiveShift = await db.system.getItem('active_shift') || null;
          const hConfig = await db.system.getItem('config');

          if (isMounted) {
            setInventory(Array.isArray(hInventory) ? hInventory as any : []);
            setAppointments(Array.isArray(hAppointments) ? hAppointments as any : []);
            setRecords(Array.isArray(hRecords) ? hRecords as any : []);
            setInvoices(Array.isArray(hInvoices) ? hInvoices as any : []);
            setShiftLogs(Array.isArray(hShifts) ? hShifts as any : []);
            setSyncQueue(Array.isArray(hSyncQueue) ? hSyncQueue as any : []);
            setNotifications(Array.isArray(hNotifications) ? hNotifications as any : []);
            setAlerts(Array.isArray(hAlerts) ? hAlerts as any : []);
            setUsers(Array.isArray(hUsers) ? hUsers as any : []);
            setClinicQueue(Array.isArray(hClinicQueue) ? hClinicQueue as any : []);
            setActiveShift(hActiveShift as any);

            const cache: Record<string, string> = {};
            (Array.isArray(hUsers) ? hUsers : []).forEach(u => {
              if (u && u.pin) cache[u.username] = u.pin;
            });
            setPinCache(cache);

            if (hConfig) {
              setSystemConfig(prev => {
                const merged = { ...prev, ...(hConfig as any) };
                if (!merged.rolePermissions) merged.rolePermissions = prev.rolePermissions;
                if (!merged.rolePermissions.cashier || merged.rolePermissions.cashier.length === 0) merged.rolePermissions.cashier = prev.rolePermissions.cashier;
                if (!merged.rolePermissions.veterinarian) merged.rolePermissions.veterinarian = prev.rolePermissions.veterinarian;
                if (!merged.rolePermissions.admin) merged.rolePermissions.admin = prev.rolePermissions.admin;
                if (!merged.rolePermissions.owner) merged.rolePermissions.owner = prev.rolePermissions.owner;
                if (merged.masterPin === prev.masterPin) merged.masterPin = hashPin(merged.masterPin);
                if (merged.dummyAdminPin === prev.dummyAdminPin) merged.dummyAdminPin = hashPin(merged.dummyAdminPin);
                return merged;
              });
            }

            // Allow 500ms for UI painting to stabilize
            fetchInvoices().then(setInvoices);
            setTimeout(() => setIsBooting(false), 500);
          }
        } catch (hydrationError) {
          if (import.meta.env.DEV) {
            console.error('[Bootloader] Critical Phase 2 Hydration Failed:', hydrationError);
          }
          if (isMounted) {
            setDbCorrupted(true);
            setIsBooting(false);
          }
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('[Bootloader] Fatal Init Error', err);
        }
        if (isMounted) {
          setDbCorrupted(true);
          setIsBooting(false);
        }
      }
    }
    bootSequence();
    return () => { isMounted = false; };
  }, []);

  // Session states
  const [isOnline, setIsOnline] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeView, setActiveView] = useState<string>('pos');
  const [viewPayload, setViewPayload] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<string[]>(['dashboard']);
  const [consentPayload, setConsentPayload] = useState<{ clientName: string, petName: string } | null>(null);

  const [enteredPin, setEnteredPin] = useState('');
  const [selectedUsername, setSelectedUsername] = useState('');
  const [pinError, setPinError] = useState(false);

  useEffect(() => {
    if (currentUser && !isViewPermitted(activeView, currentUser)) {
      setActiveView(getDefaultViewForUser(currentUser));
    }
  }, [currentUser, activeView, systemConfig]);

  const handleAddProduct = async (product: InventoryItem) => {
    await upsertInventoryItem(product);
    setInventory(prev => [product, ...prev]);
    showToast(`${product.name} added to inventory.`);
  };

  // AUDIT FIX: Atomic stock decrement — reads from IndexedDB, not stale React state
  const handleUpdateStock = async (itemId: string, qtyDelta: number, _expectedStock?: number) => {
    try {
      const newStock = await atomicStockDecrement(itemId, qtyDelta);

      // Update React state to match the DB truth
      setInventory(prev => prev.map(item => item.id === itemId ? { ...item, stock: newStock } : item));

      const currentItem = inventory.find(i => i.id === itemId);
      if (currentItem && newStock <= currentItem.minStock && currentItem.category !== 'service') {
        const alert: SystemAlert = { id: crypto.randomUUID(), severity: 'urgent', category: 'inventory', message: `LOW STOCK: ${currentItem.name} (${newStock} left).`, timestamp: new Date().toISOString(), read: false };
        await upsertAlert(alert);
        setAlerts(prev => [alert, ...prev]);
      }
      showToast(`Stock updated: ${currentItem?.name || itemId} (${newStock} remaining).`);
    } catch (error: any) {
      console.error('[CeylonPets] Stock update failed:', error);
      showToast(`Stock update failed: ${error.message}`, 'error');
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
    const item = inventory.find(i => i.id === id);
    if (item) {
      await upsertInventoryItem({ ...item, price: newPrice });
      setInventory(prev => prev.map(i => i.id === id ? { ...i, price: newPrice } : i));
      showToast(`Price updated for item.`);
    }
  };

  const handleAddAppointment = async (appointment: Appointment) => {
    await upsertAppointment(appointment);
    setAppointments(prev => [appointment, ...prev]);
    showToast(`Appointment scheduled for ${appointment.petName}.`);
  };

  const handleUpdateAppointment = async (updated: Appointment) => {
    await upsertAppointment(updated);
    setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));
    showToast(`Appointment for ${updated.petName} updated successfully.`);
  };

  const handleUpdateAppointmentStatus = async (id: string, status: AppointmentStatus) => {
    const apt = appointments.find(a => a.id === id);
    if (apt) {
      try {
        const updated = { ...apt, status, updated_at: new Date().toISOString() };
        await upsertAppointment(updated);
        setAppointments(prev => prev.map(a => a.id === id ? updated : a));

        // LIVING FLOOR: When appointment is checked-in (in-progress), add to clinic queue
        if (status === 'in-progress') {
          const queueItem: ClinicQueueItem = {
            id: `queue_${apt.id}_${crypto.randomUUID().slice(0,8)}`,
            petId: `${(apt.petName || '').trim().toLowerCase()}_${apt.ownerPhone.replace(/\D/g, '').slice(-9)}`,
            petName: apt.petName,
            ownerName: apt.ownerName,
            ownerPhone: apt.ownerPhone,
            appointmentId: apt.id,
            serviceType: apt.admissionType === 'Vaccination' ? 'Vaccine' : apt.admissionType === 'Pet Boarding' ? 'Boarding' : 'Examination',
            checkInTime: new Date().toISOString(),
            status: 'active',
            assignedVet: apt.veterinarian
          };
          await addToClinicQueue(queueItem);
          setClinicQueue(prev => [queueItem, ...prev]);
        }

        // FIXED: Remove from queue when appointment is completed or cancelled
        if (status === 'completed' || status === 'cancelled') {
          const matchPetId = `${(apt.petName || '').trim().toLowerCase()}_${apt.ownerPhone.replace(/\D/g, '').slice(-9)}`;
          const queueItem = clinicQueue.find(q => q.petId === matchPetId);
          if (queueItem) {
            await removeFromClinicQueue(queueItem.id);
            setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
          }
        }

        showToast(`Appointment status updated to ${status}.`);
      } catch (error: any) {
        console.error('[CeylonPets] Appointment status update failed:', error);
        showToast(`Failed to update appointment status: ${error.message}`, 'error');
      }
    }
  };

  const handleAddRecord = async (newRec: MedicalRecord) => {
    await upsertMedicalRecord(newRec);
    setRecords(prev => [newRec, ...prev]);
    showToast(`Medical record added for ${newRec.petName}.`);
  };

  const handleUpdateRecord = async (updated: MedicalRecord) => {
    await upsertMedicalRecord(updated);
    setRecords(prev => prev.map(r => r.id === updated.id ? updated : r));
    showToast(`Medical record updated for ${updated.petName}.`);
  };

  const handleBulkUpdateRecords = async (updatedRecords: MedicalRecord[]) => {
    try {
      // 1. Fire a single batch transaction to the database
      await Promise.all(updatedRecords.map(record => upsertMedicalRecord(record)));
      
      // 2. Perform exactly ONE React state render
      setRecords(prev => {
        const newMap = new Map(prev.map(r => [r.id, r]));
        updatedRecords.forEach(ur => newMap.set(ur.id, ur));
        return Array.from(newMap.values());
      });
      
    } catch (error) {
      console.error("Bulk sync failed:", error);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    await deleteMedicalRecord(id);
    setRecords(prev => prev.filter(r => r.id !== id));
    showToast('Medical record permanently deleted.', 'success');
  };

  // AUDIT FIX: Properly await DB writes instead of fire-and-forget inside setState
  const handleUpdateCustomer = async (oldPhone: string, newPhone: string, newName: string, newEmail: string) => {
    const normOld = oldPhone.replace(/\D/g, '');
    
    // Collect updates, await DB writes, then batch React state updates
    const aptUpdates: Appointment[] = [];
    appointments.forEach(a => {
      if (a.ownerPhone.replace(/\D/g, '') === normOld) {
        aptUpdates.push({ ...a, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail });
      }
    });
    
    const recUpdates: MedicalRecord[] = [];
    records.forEach(r => {
      if (r.ownerPhone.replace(/\D/g, '') === normOld) {
        recUpdates.push({ ...r, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail });
      }
    });
    
    const invUpdates: Invoice[] = [];
    invoices.forEach(i => {
      if (i.ownerPhone.replace(/\D/g, '') === normOld) {
        invUpdates.push({ ...i, ownerName: newName, ownerPhone: newPhone });
      }
    });

    try {
      // Await all DB writes before updating React state
      await Promise.all([
        ...aptUpdates.map(u => upsertAppointment(u)),
        ...recUpdates.map(u => upsertMedicalRecord(u)),
        ...invUpdates.map(u => upsertInvoice(u))
      ]);

      // Batch React state updates
      if (aptUpdates.length > 0) setAppointments(prev => prev.map(a => aptUpdates.find(u => u.id === a.id) || a));
      if (recUpdates.length > 0) setRecords(prev => prev.map(r => recUpdates.find(u => u.id === r.id) || r));
      if (invUpdates.length > 0) setInvoices(prev => prev.map(i => invUpdates.find(u => u.id === i.id) || i));
    } catch (error: any) {
      console.error('[CeylonPets] Customer update failed:', error);
      showToast(`Failed to update customer across records: ${error.message}`, 'error');
    }
  };

  const handleUpdatePet = async (oldPatientId: string, newPetName: string, newDetails: any) => {
    setRecords(prev => {
      return prev.map(r => {
        if (r.patientId === oldPatientId) {
          const u = { ...r, petName: newPetName, ...newDetails };
          upsertMedicalRecord(u);
          return u;
        }
        return r;
      });
    });
  };

  // AUDIT FIX: Removed redundant double-write of appointment completion.
  // upsertInvoice in db.ts already marks the appointment as 'completed'.
  // Added try-catch for error resilience.
  const handleAddInvoice = async (invoice: any) => {
    try {
      await upsertInvoice(invoice);
      const updated = await fetchInvoices();
      setInvoices(updated);

      // Remove patient from clinic queue after checkout
      if (invoice.patientId && invoice.patientId !== 'RETAIL') {
        const queueItem = clinicQueue.find(q => q.petId === invoice.patientId);
        if (queueItem) {
          await removeFromClinicQueue(queueItem.id);
          setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
        }
      }

      // Sync React appointment state to match DB (upsertInvoice already completed it in DB)
      if (invoice.appointmentId) {
        setAppointments(prev => prev.map(a => a.id === invoice.appointmentId ? { ...a, status: 'completed' as const, updated_at: new Date().toISOString() } : a));
      }
    } catch (error: any) {
      console.error('[CeylonPets] Invoice creation failed:', error);
      showToast(`Checkout failed: ${error.message}`, 'error');
    }
  };

  // FIXED: No longer mutates React state directly — creates a new object
  const handleVoidInvoice = async (id: any) => { const target = invoices.find(i => i.id === id); if (target) { const voided = { ...target, paymentStatus: 'void' as const }; await upsertInvoice(voided); const updated = await fetchInvoices(); setInvoices(updated); } };

  const handlePurgeDatabases = async () => {
    await db.inventory.clear();
    await db.appointments.clear();
    await db.records.clear();
    await db.invoices.clear();
    await db.shifts.clear();
    await db.notifications.clear();
    await db.alerts.clear();
    await db.users.clear();
    localStorage.clear(); sessionStorage.clear();
    window.location.reload();
  };

  const handleHardReboot = async () => {
    await db.system.clear();
    localStorage.clear(); sessionStorage.clear();
    window.location.reload();
  };

  const handleVerifyMasterPin = (pin: string): boolean => hashPin(pin) === (systemConfig.masterPin || hashPin('0000'));

  const isViewPermitted = (viewName: string, user: any): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (user.role === 'dummy_admin') return viewName === 'settings';
    if (user.role === 'pet_parent') return viewName === 'portal';
    if (viewName === 'settings') return false;
    const checkedView = (viewName === 'reports' || viewName === 'dashboard') ? 'dashboard' : viewName;
    const defaultPermissions = {
      cashier: ['pos', 'shift'],
      veterinarian: ['dashboard', 'appointments', 'examinations', 'boarding', 'grooming', 'shift'],
      admin: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift']
    };
    const permissions = (systemConfig.rolePermissions || defaultPermissions)[user.role as 'cashier' | 'veterinarian' | 'admin' | 'owner'] || [];
    if (checkedView === 'portal') return true;
    return permissions.includes(checkedView);
  };

  const getDefaultViewForUser = (user: any): any => {
    if (!user) return 'portal';
    if (user.role === 'admin' || user.role === 'dummy_admin') return 'settings';
    if (user.role === 'pet_parent') return 'portal';
    const priorityViews = ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'portal'] as const;
    for (const view of priorityViews) {
      if (isViewPermitted(view, user)) return view === 'dashboard' ? 'reports' : view;
    }
    return 'portal';
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsername) return;
    const ownerPinHash = systemConfig.masterPin || hashPin('5692');
    const dummyPinHash = systemConfig.dummyAdminPin || hashPin('7777');
    const enteredPinHash = hashPin(enteredPin);

    if (selectedUsername === 'ashpoint_owner') {
      if (enteredPinHash === ownerPinHash) {
        setCurrentUser({ id: crypto.randomUUID(), name: `${systemConfig.appName} Admin`, username: 'ashpoint_owner', role: 'admin', avatarColor: 'bg-indigo-600 text-white border-indigo-700' });
        setActiveView('settings');
      } else { setPinError(true); setTimeout(() => setPinError(false), 2000); }
      setEnteredPin(''); setSelectedUsername(''); return;
    }

    const foundUser = users.find(u => u.username === selectedUsername);
    if (foundUser && (enteredPinHash === foundUser.pin || enteredPinHash === pinCache[selectedUsername])) {
      setCurrentUser(foundUser); setActiveView(getDefaultViewForUser(foundUser));
    } else {
      setPinError(true); setTimeout(() => setPinError(false), 2000);
    }
    setEnteredPin(''); setSelectedUsername('');
  };

  const navItems = [
    { id: 'pos', label: 'POS', icon: Calculator, isLive: true },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, isLive: true },
    { id: 'appointments', label: 'Appointments', icon: Calendar, isLive: true },
    { id: 'pets', label: 'Pets', icon: PawPrint, isLive: true },
    { id: 'customers', label: 'Customers', icon: Users, isLive: true },
    { id: 'vaccinations', label: 'Vaccinations', icon: Syringe, isLive: true },
    { id: 'examinations', label: 'Examinations', icon: Stethoscope, isLive: true },
    { id: 'laboratory', label: 'Laboratory', icon: TestTube, isLive: true },
    { id: 'boarding', label: 'Boarding/Hotel', icon: Home, isLive: true },
    { id: 'grooming', label: 'Grooming Salon', icon: Scissors, isLive: true },
    { id: 'inventory', label: 'Inventory', icon: Package, isLive: true },
    { id: 'invoices', label: 'Invoices', icon: FileText, isLive: true }, // ACTIVATED
    { id: 'shift', label: 'Shift & Drawer', icon: Lock, isLive: true },
    { id: 'reports', label: 'Reports', icon: BarChart3, isLive: true }
  ];

  const renderCanvas = () => {
    switch (activeView) {
      case 'pos': {
        const { masterPin, dummyAdminPin, ...safeSystemConfig } = systemConfig;
        return (
          <POSRegister
            inventory={inventory} 
            appointments={appointments} // ADD THIS LINE
            records={records}
            currentUser={currentUser} invoices={invoices} onUpdateStock={handleUpdateStock}
            onAddInvoice={handleAddInvoice} onVoidInvoice={handleVoidInvoice} systemConfig={safeSystemConfig}
            onVerifyMasterPin={handleVerifyMasterPin} onTriggerInventorySync={async () => { }}
            activeShift={activeShift} incomingClient={viewPayload?.client ? { phone: viewPayload.client.primary_phone || '', name: viewPayload.client.full_name || '', id: viewPayload.client.client_id || '' } : null}
            onUpdateRecord={handleUpdateRecord}
          />
        );
      }
      case 'appointments': return <AppointmentsManager appointments={appointments} records={records} onAddAppointment={handleAddAppointment} onUpdateStatus={handleUpdateAppointmentStatus} onAddRecord={handleAddRecord} onUpdateAppointment={handleUpdateAppointment} preFilledClient={viewPayload?.client} preFilledPet={viewPayload?.pet} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} />;
      case 'boarding': return <BoardingManager records={records} onUpdateRecord={handleUpdateRecord} />;
      case 'grooming': return <GroomingManager records={records} inventory={inventory} onUpdateRecord={handleUpdateRecord} />;
      case 'inventory': return <InventoryManager inventory={inventory} onAddProduct={handleAddProduct} onUpdateStock={handleUpdateStock} onUpdatePrice={handleUpdatePrice} onUpdateInventory={setInventory} systemConfig={systemConfig} />;
      case 'invoices': return <InvoicesManager invoices={invoices} onVoidInvoice={handleVoidInvoice} systemConfig={systemConfig} />;
      case 'shift': return <ShiftManager invoices={invoices} currentUser={currentUser} activeShift={activeShift} setActiveShift={async (s) => { if (s) { await db.system.setItem('active_shift', s); } else { await db.system.removeItem('active_shift'); } setActiveShift(s); }} onSaveShift={async (log) => { await db.shifts.setItem(log.id, log); setShiftLogs(prev => [log, ...prev]); }} />;
      case 'dashboard':
        return <DashboardAnalytics inventory={inventory} appointments={appointments} activeShift={activeShift} onNavigate={(tab) => { setViewPayload(null); setActiveView(tab); setHistoryStack(prev => [...prev, tab]); }} />;
      case 'reports':
        return <ReportsManager />;
      case 'examinations': return <MedicalRecordsManager clinicQueue={clinicQueue} records={records} inventory={inventory as any} appointments={appointments} systemConfig={systemConfig} viewPayload={viewPayload} onUpdateRecord={handleUpdateRecord} onAddRecord={handleAddRecord} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'settings': {
        const { masterPin, dummyAdminPin, ...safeSystemConfig } = systemConfig;
        return (
          <SystemSettings
            config={safeSystemConfig}
            onChangeConfig={async (config) => {
              await db.system.setItem('config', config);
              setSystemConfig(config);
            }}
            users={users.map(({ pin, ...safeU }) => safeU)}
            onForceCloudSync={async () => { }}
            onRefreshUsers={async () => { }}
            onAddUser={async (user) => {
              const { pin, ...safeUser } = user;
              if (pin) {
                setPinCache(prev => ({ ...prev, [user.username]: pin }));
              }
              const userToSave = {
                ...safeUser,
                pin: pin || pinCache[user.username]
              };
              await db.users.setItem(userToSave.id, userToSave);
              setUsers(prev => [...prev, safeUser]);
              showToast(`User ${safeUser.name} added successfully.`);
            }}
            onRemoveUser={async (id) => {
              const userToRemove = users.find(u => u.id === id);
              if (userToRemove) {
                setPinCache(prev => {
                  const next = { ...prev };
                  delete next[userToRemove.username];
                  return next;
                });
              }
              await db.users.removeItem(id);
              setUsers(prev => prev.filter(u => u.id !== id));
            }}
            inventory={inventory}
            invoices={invoices}
            currentUser={currentUser}
            onUpdateInventory={(newInv) => setInventory(newInv)}
            onRestoreSnapshot={async () => true}
            onPurgeDatabases={handlePurgeDatabases}
            onHardReboot={handleHardReboot}
          />
        );
      }
      case 'pets': return <PatientPortal records={records} appointments={appointments} clinicQueue={clinicQueue} onBookAppointment={handleAddAppointment} systemConfig={systemConfig} viewPayload={viewPayload} onAddRecord={handleAddRecord} onGoToCustomers={(phone) => { setViewPayload({ selectedPhone: phone }); setActiveView('customers'); setHistoryStack(prev => [...prev, 'customers']); }} onGoToAppointments={(client, pet) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onUpdatePet={handleUpdatePet} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'vaccinations': return <VaccinationsManager records={records} inventory={inventory} onUpdateRecord={handleUpdateRecord} onUpdateStock={handleUpdateStock} />;
      case 'laboratory': return <LaboratoryManager records={records} inventory={inventory as any} onUpdateRecord={handleUpdateRecord} />;
      case 'customers': return <CustomersManager records={records} invoices={invoices} appointments={appointments} onGoToPOS={(client) => { setViewPayload({ client }); setActiveView('pos'); setHistoryStack(prev => [...prev, 'pos']); }} onGoToAppointments={(client, pet?) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onGoToRecords={(patientId) => { setActiveView('examinations'); setHistoryStack(prev => [...prev, 'examinations']); }} onUpdateCustomer={handleUpdateCustomer} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} onAddRecord={handleAddRecord} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      default: return null;
    }
  };

  // RENDER CORRUPTION SAFETY NET
  if (dbCorrupted) {
    return (
      <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-4 text-center">
        <div className="max-w-md w-full bg-slate-800 border border-rose-500/50 p-8 rounded-3xl shadow-2xl space-y-6">
          <div className="w-20 h-20 mx-auto bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
            <CloudLightning className="w-10 h-10 text-rose-500" />
          </div>
          <h1 className="text-2xl font-black text-rose-500 uppercase tracking-widest">Critical Database Corruption Detected</h1>
          <p className="text-slate-400 font-medium text-sm leading-relaxed">
            The local IndexedDB vault contains malformed structures preventing hydration. You must purge the local vault to restore system stability. All un-synced local data will be lost.
          </p>
          <button
            onClick={handlePurgeDatabases}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer"
          >
            PURGE DATABASES & REBOOT
          </button>
        </div>
      </div>
    );
  }

  // RENDER BOOTLOADER IF LOADING
  if (isBooting) {
    return (
      <div className="h-screen w-full bg-slate-900 flex flex-col items-center justify-center text-white font-sans">
        <div className="w-24 h-24 mb-8 bg-slate-800 rounded-3xl flex items-center justify-center animate-pulse border border-slate-700 shadow-2xl">
          <Activity className="w-12 h-12 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-black tracking-widest text-slate-100 uppercase">CeylonPets Vault</h1>
        <p className="text-slate-400 font-mono text-sm mt-2 font-bold tracking-widest">Hydrating Clinical Matrices...</p>
        <div className="w-64 h-1.5 bg-slate-800 rounded-full mt-6 overflow-hidden">
          <div className="h-full bg-indigo-500 rounded-full animate-[progress_2s_ease-in-out_infinite]" style={{ width: '60%' }}></div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen max-h-screen overflow-hidden bg-slate-50 flex flex-col font-sans relative antialiased leading-none text-xs text-slate-800 print:hidden">
        {!currentUser ? (
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl border border-sky-100 max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 overflow-hidden shadow-2xl animate-fade-in text-xs">
              <div className="p-8 bg-sky-600 text-white flex flex-col justify-between space-y-8 relative overflow-hidden">
                <div className="relative z-10 font-sans flex flex-col h-full justify-between">
                  <div className="space-y-6">
                    <span className="px-3 py-1 bg-white/20 text-white font-bold rounded-full text-[9px] uppercase tracking-wider flex items-center gap-1.5 w-max">
                      <span className="text-sm select-none leading-none">{systemConfig.invoiceLogo}</span> {systemConfig.appName} Core Medical Suite
                    </span>
                    <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-sm border-2 border-white/30 border-dashed inline-block">
                      <p className="text-white/70 font-bold text-xs uppercase tracking-widest text-center">Your Logo Here<br /><span className="text-[9px] font-medium opacity-75 capitalize mt-1 block">(Upload via System Settings)</span></p>
                    </div>
                    <p className="text-white/80 leading-relaxed font-semibold text-sm max-w-sm">Serving Pet parents cleanly and securely. Tablet-ready clinical charts, custom billing registers, and automated client alerts.</p>
                  </div>
                  <div className="text-white/90 font-semibold tracking-wide text-[10px] uppercase flex flex-col gap-0.5 mt-12 pb-4">
                    <span className="opacity-70 tracking-widest">CeylonPets Medical OS</span>
                    <span className="font-black text-[13px] tracking-widest drop-shadow-sm text-yellow-300">POWERED BY ASH POINT SOLUTIONS</span>
                  </div>
                </div>
                <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-sky-500 rounded-full blur-xl opacity-50" />
              </div>

              <div className="p-8 flex flex-col justify-between space-y-6 font-sans">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Secure Clinician Sign-In</h3>
                    <p className="text-slate-400 mt-1">Select your account and enter your secure 4-digit PIN to access the terminal.</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <form onSubmit={handlePinSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="login-username" className="font-bold text-slate-700 block text-[10px]">Select Staff Member</label>
                      <select id="login-username" name="username" autoComplete="username" value={selectedUsername} onChange={(e) => setSelectedUsername(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs font-semibold text-slate-700" required>
                        <option value="" disabled>-- Choose Staff --</option>
                        <option value="ashpoint_owner">Service Provider (System Root Admin)</option>
                        {users.map((u) => <option key={u.id} value={u.username}>{u.name} ({u.role ? u.role.toUpperCase() : 'UNKNOWN'})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label htmlFor="login-pin" className="font-bold text-slate-700 block text-[10px]">Enter 4-Digit Passcode PIN</label>
                        {pinError && <span className="text-[10px] text-rose-600 font-semibold animate-pulse">Incorrect passcode pin.</span>}
                      </div>
                      <div className="flex gap-2">
                        <input id="login-pin" name="pin" type="password" autoComplete="current-password" maxLength={4} placeholder="••••" value={enteredPin} onChange={(e) => setEnteredPin(e.target.value)} className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-200 text-center font-mono font-bold tracking-widest text-sm rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500" required />
                        <button type="submit" className="px-5 bg-slate-800 hover:bg-slate-900 font-extrabold text-white rounded-xl transition-all font-mono">Verify</button>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {currentUser && (
          <div className="flex h-screen w-full bg-gray-50 overflow-hidden font-sans text-gray-900">
            <aside className="w-64 bg-white border-r border-gray-200 flex flex-col flex-shrink-0 z-20 shadow-sm">
              <div className="h-16 flex items-center px-6 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 p-1.5 rounded-lg shadow-sm"><PawPrint className="w-5 h-5 text-white" /></div>
                  <div>
                    <h1 className="text-lg font-bold leading-none tracking-tight">{systemConfig.appName || 'CeylonPets'}</h1>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">{systemConfig.resellerName || 'Ash Point'}</p>
                  </div>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  if (!item.isLive) return <a key={item.id} href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors opacity-80 cursor-default"><Icon className="w-5 h-5" />{item.label}</a>;
                  const permissionKey = item.id === 'reports' || item.id === 'dashboard' ? 'dashboard' : item.id;
                  if (!isViewPermitted(permissionKey, currentUser)) return null;
                  const isSelected = activeView === item.id || (activeView === 'reports' && item.id === 'dashboard');
                  return (
                    <button key={item.id} onClick={() => { setActiveView(item.id); setViewPayload(null); setHistoryStack([item.id]); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />{item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-gray-100 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-800 text-xs truncate leading-tight">{currentUser.name}</span>
                  <span className="block text-[10px] text-gray-400 capitalize font-medium mt-0.5 truncate">{currentUser.role} console</span>
                </div>
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50/50 space-y-1">
                {isViewPermitted('settings', currentUser) && (
                  <button onClick={() => { setActiveView('settings'); setHistoryStack(['settings']); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeView === 'settings'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <Settings className={`w-5 h-5 ${activeView === 'settings' ? 'text-blue-600' : 'text-gray-500'}`} />
                    Settings
                  </button>
                )}
                <button
                  onClick={() => setCurrentUser(null)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                >
                  <LogOut className="w-5 h-5 text-rose-500" />
                  Lock/Logout
                </button>
              </div>
            </aside>

            {/* MAIN CANVAS */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-gray-100">
              <div className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4 shrink-0 shadow-xs">
                {historyStack.length > 1 && (
                  <button
                    onClick={() => {
                      const prev = historyStack[historyStack.length - 2];
                      setHistoryStack(prev => prev.slice(0, -1));
                      setActiveView(prev);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-3 h-3" /> Back
                  </button>
                )}
                <span className="text-xs font-bold text-slate-500 capitalize">{activeView}</span>
              </div>
              <div className="flex-1 w-full h-full overflow-y-auto">
                {renderCanvas()}
              </div>
            </main>
          </div>
        )}
        <ToastContainer />
      </div>
    </>
  );
}

export default function AppWrapper() {
  return (
    <ClinicErrorBoundary>
      <App />
    </ClinicErrorBoundary>
  );
}