/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

interface PanelErrorBoundaryProps { children: ReactNode; onNavigate?: (view: string) => void; }
interface PanelErrorBoundaryState { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null; showDetails: boolean; }

// @ts-ignore — React 19 class component type narrowing workaround
export class ClinicErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  public state: PanelErrorBoundaryState = { hasError: false, error: null, errorInfo: null, showDetails: false };

  public static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, error, errorInfo: null, showDetails: false };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    (this as any).setState({ errorInfo });
    if (import.meta.env.DEV) {
      console.error('[CeylonPets] Panel error:', error, errorInfo);
    }
  }

  public render() {
    const self = this as any;
    if (self.state.hasError) {
      const { error, errorInfo, showDetails } = self.state;
      return (
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
          <div className="max-w-md w-full bg-white border border-slate-200 p-8 rounded-2xl shadow-sm text-center space-y-5">
            <div className="mx-auto w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-800">This page couldn't load</h3>
              <p className="text-xs font-bold text-slate-500 mt-2 leading-relaxed">
                Something went wrong displaying this panel. Your data is safe — nothing was lost.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => self.setState({ hasError: false, error: null, errorInfo: null })}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-sm cursor-pointer transition-colors uppercase tracking-widest"
              >
                Try Again
              </button>
              <button
                onClick={() => self.props.onNavigate?.('dashboard')}
                className="flex-1 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-black rounded-xl cursor-pointer transition-colors uppercase tracking-widest"
              >
                Go to Dashboard
              </button>
            </div>
            {import.meta.env.DEV && error && (
              <div className="text-left border-t border-slate-100 pt-4 mt-4">
                <button
                  onClick={() => self.setState({ showDetails: !showDetails })}
                  className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 cursor-pointer"
                >
                  {showDetails ? '▾ Hide' : '▸ Show'} Error Details (dev only)
                </button>
                {showDetails && (
                  <pre className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-mono text-rose-700 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                    {error.message}{'\n'}{error.stack}{errorInfo?.componentStack ? '\n\nComponent Stack:' + errorInfo.componentStack : ''}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }
    return self.props.children;
  }
}

import { db, initializeDatabaseVault, stampRecord } from './lib/localDb';
import { seedDemoData } from './lib/demoSeed';
import {
  hashCredential, verifyCredential, verifyCredentialSync, isBcryptHash,
  migrateOldHash, recordFailedAttempt, isLockedOut, resetAttempts
} from './lib/credentials';
import { requireAuth, setPolicyOverrides, ROOT_ROLES } from './lib/requireAuth';
import AuthPromptHost from './components/ui/AuthPrompt';

// @ts-ignore
window._db = db;
// @ts-ignore
window.seedDemoData = seedDemoData;

import {
  Calculator, LayoutDashboard, Calendar, PawPrint, Users, Syringe,
  Stethoscope, TestTube, BriefcaseMedical, Package, FileText,
  BarChart3, Settings, LogOut, CloudLightning, Printer, Lock,
  ChevronLeft, PenTool, Home, Scissors, Activity, Bell, UserCog, Eye, EyeOff, AlertTriangle
} from 'lucide-react';

import {
  InventoryItem, Appointment, MedicalRecord, ClientNotification,
  SystemAlert, Invoice, AppointmentStatus, OfflineSyncItem,
  ShiftReconciliation, ActiveShift, ClinicQueueItem,
  Vaccination, GroomingLog, LabResult, BoardingRecord, StaffProfile, TimeEntry, ScheduleEntry, Payslip
} from './types';

import DashboardAnalytics from './components/DashboardAnalytics';
import ReportsManager from './components/ReportsManager';
import POSRegister from './components/POSRegister';
import AppointmentsManager from './components/AppointmentsManager';
import NotificationsModal from './components/NotificationsModal';
import { Modal } from './components/ui/Modal';
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
import StaffManager from './components/StaffManager';

import { 
  fetchAppointments, 
  fetchMedicalRecords, 
  fetchInventory, 
  fetchInvoices, 
  fetchShiftMetrics,
  fetchNotifications,
  fetchAlerts,
  fetchClinicQueue,
  fetchPets,
  fetchClients,
  fetchBoardingRecords,
  upsertClient, 
  reconstituteSystemState,
  upsertInventoryItem, 
  upsertAppointment, 
  upsertMedicalRecord,
  deleteMedicalRecord, 
  upsertInvoice, 
  upsertAlert,
  upsertVaccination,
  upsertGroomingLog,
  upsertLabResult,
  upsertBoardingRecord,
  addToClinicQueue, 
  updateQueueItemStatus, 
  removeFromClinicQueue, 
  getActiveQueueItems, 
  atomicStockDecrement, 
  deleteInventoryItem,
  fetchTodaysRecords, 
  fetchTodaysInvoices
} from './lib/db';
import { globalMutex } from './lib/mutex';
import { SyncEngine, wipeAllCloudTables } from './lib/syncEngine';
import { SYNC_ENABLED } from './lib/supabase';

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
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clinicQueue, setClinicQueue] = useState<ClinicQueueItem[]>([]);
  const [pets, setPets] = useState<import('./types').Pet[]>([]);
  const [clients, setClients] = useState<import('./types').Client[]>([]);
  const [boardingRecords, setBoardingRecords] = useState<import('./types').BoardingRecord[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [shiftLogs, setShiftLogs] = useState<ShiftReconciliation[]>([]);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [syncQueue, setSyncQueue] = useState<OfflineSyncItem[]>([]);
  const [pinCache, setPinCache] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);

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
      // HOTFIX-1: 'manager' had NO entry anywhere, so isViewPermitted fell through
      // to `|| []` and every manager account could log in but saw zero views.
      // Operational floor above cashier; no 'reminders'/'portal' (owner-only).
      // 'settings' is impossible here regardless — hard-blocked above.
      manager: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'boarding', 'grooming', 'shift'],
      // PROVIDER-1: 'groomer' gets a real floor (grooming + shift) so it does not
      // repeat the manager zero-panels bug. 'admin' is no longer root — this is
      // its ordinary default, based on what 'owner' gets; provider can grant or
      // revoke panels per role from the Panel Access Matrix in Settings.
      groomer: ['grooming', 'shift'],
      admin: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      // 'provider' is root and bypasses isViewPermitted; this value is documentary.
      provider: ['dashboard', 'pos', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming', 'inventory', 'invoices', 'shift', 'staff', 'reminders', 'portal']
    },
    masterPin: hashPin('5692')
  } as SystemConfig);

  // SECURE-1: banner deep-link flag + "default password still in use" detector.
  // True whether masterPin is the shipped legacy default OR its bcrypt upgrade —
  // i.e. whenever '5692' would still authenticate as provider.
  const [autoOpenProviderPw, setAutoOpenProviderPw] = useState(false);
  const isDefaultProviderPassword = useMemo(() => {
    const mp = systemConfig.masterPin;
    if (!mp) return true;
    if (mp === hashPin('5692')) return true;
    try { return verifyCredentialSync('5692', mp); } catch { return false; }
  }, [systemConfig.masterPin]);

  /**
   * HOTFIX: verify a master-PIN attempt against the stored credential in EITHER
   * format. AUTH-2 migrates `masterPin` to bcrypt on first owner login, which
   * silently broke every gate still doing a raw `hashPin(pin) === masterPin`
   * compare (delete inventory / delete record / void invoice). Declared here,
   * above those callbacks, so they can all share one correct check.
   * AUTH-3 replaces these gates with requireAuth() entirely.
   */
  const verifyMasterPin = (pin: string): boolean => {
    const stored = systemConfig.masterPin || hashPin('0000');
    if (!pin) return false;
    if (isBcryptHash(stored)) return verifyCredentialSync(pin, stored);
    return hashPin(pin) === stored;
  };

  // --- THE INDEXED-DB BOOTLOADER & MIGRATION ENGINE ---
  useEffect(() => {
    let isMounted = true;
    async function bootSequence() {
      try {
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().then(granted => {
            if (granted) console.log('[CeylonPets] Persistent storage granted by browser.');
            else console.warn('[CeylonPets] Persistent storage denied. Data may be evicted if disk is full.');
          });
        }

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

        // Phase 1.9: Populate an empty vault with realistic demo data so every
        // screen looks alive on a fresh install. No-op if data exists; skipped
        // under automation (Playwright seeds its own fixtures).
        try {
          if (!(navigator as any).webdriver && !localStorage.getItem('kp_purged')) {
            const seeded = await seedDemoData();
            if (seeded && import.meta.env.DEV) console.log('[Bootloader] Demo data seeded into empty vault.');
          }
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[Bootloader] Demo seed skipped:', e);
        }

        // Phase 2: Hydrate Memory from DB (With Corruption Safety Net)
        // MISSION 2: Only load today's operational data — not the full history
        try {
          const [appts, recs, inv, invs, metrics, queue, fetchedPets, fetchedClients, fetchedBoardingRecords] = await Promise.all([
            fetchAppointments(),
            fetchMedicalRecords(),
            fetchInventory(),
            fetchInvoices(),
            fetchShiftMetrics(),
            fetchClinicQueue(),
            fetchPets(),
            fetchClients(),
            fetchBoardingRecords()
          ]);

          const hShifts: any[] = [];
          await db.shiftReconciliations.iterate((value: any) => { if (value) hShifts.push(value); });

          const hQueue: any[] = [];
          await db.clinicQueue.iterate((value: any) => {
            if (value && !value.is_deleted) hQueue.push(value);
          });

          const hStaffProfiles: any[] = [];
          await db.staffProfiles.iterate((value: any) => {
            if (value && !value.is_deleted) hStaffProfiles.push(value);
          });

          const hTimeEntries: any[] = [];
          await db.timeEntries.iterate((value: any) => {
            if (value && !value.is_deleted) hTimeEntries.push(value);
          });

          const hScheduleEntries: any[] = [];
          await db.scheduleEntries.iterate((value: any) => {
            if (value && !value.is_deleted) hScheduleEntries.push(value);
          });

          const hPayslips: any[] = [];
          await db.payslips.iterate((value: any) => {
            if (value && !value.is_deleted) hPayslips.push(value);
          });

          const hSyncQueue: any[] = [];
          await db.syncQueue.iterate((value: any) => { if (value) hSyncQueue.push(value); });

          const hNotifications = await fetchNotifications();
          const hAlerts = await fetchAlerts();

          const hUsers: any[] = [];
          await db.users.iterate((value: any) => { if (value) hUsers.push(value); });

          const hActiveShift = await db.system.getItem('active_shift') || null;
          const hConfig = await db.system.getItem('config');

          if (isMounted) {
            setInventory(Array.isArray(inv) ? inv as any : []);
            setAppointments(Array.isArray(appts) ? appts as any : []);
            setRecords(Array.isArray(recs) ? recs as any : []);
            setInvoices(Array.isArray(invs) ? invs as any : []);
            setShiftLogs(Array.isArray(hShifts) ? hShifts as any : []);
            setSyncQueue(Array.isArray(hSyncQueue) ? hSyncQueue as any : []);
            setNotifications(Array.isArray(hNotifications) ? hNotifications as any : []);
            setAlerts(Array.isArray(hAlerts) ? hAlerts as any : []);
            setUsers(Array.isArray(hUsers) ? hUsers as any : []);
            setClinicQueue(hQueue.sort((a, b) => {
              const pA = a.priority ?? 2;
              const pB = b.priority ?? 2;
              if (pA !== pB) return pA - pB;
              return new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime();
            }));
            setStaffProfiles(hStaffProfiles);
            setTimeEntries(hTimeEntries);
            setScheduleEntries(hScheduleEntries);
            setPayslips(hPayslips);
            setPets(Array.isArray(fetchedPets) ? fetchedPets as any : []);
            setClients(Array.isArray(fetchedClients) ? fetchedClients as any : []);
            setBoardingRecords(Array.isArray(fetchedBoardingRecords) ? fetchedBoardingRecords as any : []);
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
                // HOTFIX-1: without this backfill, any installation with a config
                // already persisted before 'manager' existed (i.e. every live one)
                // would never gain the key, and managers would stay locked out
                // even after the code fix.
                if (!merged.rolePermissions.manager) merged.rolePermissions.manager = prev.rolePermissions.manager;
                if (!merged.rolePermissions.admin) merged.rolePermissions.admin = prev.rolePermissions.admin;
                if (!merged.rolePermissions.owner) merged.rolePermissions.owner = prev.rolePermissions.owner;
                // PROVIDER-1: backfill new role keys so existing persisted configs
                // gain them instead of silently falling through to zero panels.
                if (!merged.rolePermissions.groomer) merged.rolePermissions.groomer = prev.rolePermissions.groomer;
                if (!merged.rolePermissions.provider) merged.rolePermissions.provider = prev.rolePermissions.provider;
                if (merged.masterPin === prev.masterPin) merged.masterPin = hashPin(merged.masterPin);
                if (merged.dummyAdminPin === prev.dummyAdminPin) merged.dummyAdminPin = hashPin(merged.dummyAdminPin);
                return merged;
              });
            }

            // ── ONE-TIME MIGRATION: Deduplicate ghost clients by phone ──
            try {
              const dedupDone = await db.system.getItem('migration_client_dedup_v1');
              if (!dedupDone) {
                const allClients: any[] = [];
                await db.clients.iterate((v: any) => { if (v && !Array.isArray(v)) allClients.push(v); });
                const phoneMap = new Map<string, any[]>();
                allClients.forEach(c => {
                  const norm = (c.primary_phone || '').replace(/\D/g, '').slice(-9);
                  if (norm.length >= 7) {
                    const existing = phoneMap.get(norm) || [];
                    existing.push(c);
                    phoneMap.set(norm, existing);
                  }
                });
                let deduped = 0;
                for (const [, dupes] of phoneMap) {
                  if (dupes.length <= 1) continue;
                  // Keep the one with the most data (longest administrative_notes or first created)
                  dupes.sort((a, b) => (a.client_id || '').length - (b.client_id || '').length);
                  const keeper = dupes[0];
                  for (let i = 1; i < dupes.length; i++) {
                    await db.clients.removeItem(dupes[i].client_id);
                    deduped++;
                  }
                  console.info(`[Boot] Deduped client "${keeper.full_name}" — removed ${dupes.length - 1} ghost(s)`);
                }
                await db.system.setItem('migration_client_dedup_v1', new Date().toISOString());
                if (deduped > 0) console.info(`[Boot] Client dedup complete: ${deduped} ghost(s) removed.`);
              }
            } catch (dedupErr) {
              console.warn('[Boot] Client dedup migration failed (non-fatal):', dedupErr);
            }

            // Allow 500ms for UI painting to stabilize
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

  // MISSION 1: Background Sync Engine lifecycle
  const syncEngineRef = useRef<SyncEngine | null>(null);
  useEffect(() => {
    // After a deliberate "Erase Entire Database", do NOT start cloud sync —
    // otherwise the engine pulls the old rows straight back from Supabase and
    // the vault is never actually empty. Keeps a purged app blank ("factory" state).
    if (localStorage.getItem('kp_purged')) {
      console.info('[CeylonPets] Vault was purged — cloud sync stays offline so the app remains blank.');
      return;
    }
    const engine = new SyncEngine({ onStatusChange: (online) => setIsOnline(online) });
    engine.start();
    syncEngineRef.current = engine;
    return () => { engine.stop(); };
  }, []);

  // Session states
  const [isOnline, setIsOnline] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [activeView, setActiveView] = useState<string>('pos');
  const [viewPayload, setViewPayload] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<string[]>(['dashboard']);
  const [consentPayload, setConsentPayload] = useState<{ clientName: string, petName: string } | null>(null);
  const [idleMessage, setIdleMessage] = useState<string | null>(null);

  const [enteredPin, setEnteredPin] = useState('');
  const [selectedUsername, setSelectedUsername] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);

  // AUTH-8: Idle timeout tracking
  useEffect(() => {
    if (!currentUser || !systemConfig.idleLogoutMinutes || systemConfig.idleLogoutMinutes <= 0) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setCurrentUser(null);
        setIdleMessage("Logged out due to inactivity");
      }, systemConfig.idleLogoutMinutes * 60 * 1000);
    };

    // Throttle the event listeners so they don't fire continuously
    let isThrottled = false;
    const handleActivity = () => {
      if (isThrottled) return;
      isThrottled = true;
      resetTimer();
      setTimeout(() => { isThrottled = false; }, 1000);
    };

    resetTimer();

    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
    };
  }, [currentUser, systemConfig.idleLogoutMinutes]);

  // AUTH-4: push the admin-edited access matrix into requireAuth whenever config
  // loads or changes. Absent overrides fall back to ACTION_POLICIES defaults.
  useEffect(() => {
    setPolicyOverrides((systemConfig as any).actionPolicies);
  }, [systemConfig]);

  // Owner / provider-admin sign in with a full alphanumeric password; till roles
  // (cashier, vet, groomer) keep the fast 4-digit numeric PIN.
  const selectedRole = selectedUsername === 'ashpoint_owner'
    ? 'admin'
    : (users.find(u => u.username === selectedUsername)?.role || '');
  // AUTH-4: 'manager' is a password role too (it has a Change Password flow), so
  // its login must accept a full alphanumeric password, not a 4-digit PIN.
  const isPasswordAccount = selectedUsername === 'ashpoint_owner'
    || ['admin', 'owner', 'manager'].includes(selectedRole);

  // Live lockout countdown for the selected account — re-enables the form the
  // moment the lockout expires, without needing a page refresh.
  useEffect(() => {
    if (!selectedUsername) { setLockoutSeconds(0); return; }
    const tick = () => {
      const { locked, secondsRemaining } = isLockedOut(selectedUsername);
      setLockoutSeconds(locked ? secondsRemaining : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [selectedUsername]);

  useEffect(() => {
    if (currentUser && !isViewPermitted(activeView, currentUser)) {
      setActiveView(getDefaultViewForUser(currentUser));
    }
  }, [currentUser, activeView, systemConfig]);

  const handleAddProduct = useCallback(async (product: InventoryItem) => {
    try {
      await upsertInventoryItem(product);
      setInventory(prev => [product, ...prev]);
      showToast(`${product.name} added to inventory.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  // AUDIT FIX: Atomic stock decrement — reads from IndexedDB, not stale React state
  const handleUpdateStock = useCallback(async (itemId: string, qtyDelta: number, _expectedStock?: number) => {
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
  }, [inventory]);

  const handleUpdatePrice = useCallback(async (id: string, newPrice: number) => {
    try {
      const item = inventory.find(i => i.id === id);
      if (item) {
        await upsertInventoryItem({ ...item, price: newPrice });
        setInventory(prev => prev.map(i => i.id === id ? { ...i, price: newPrice } : i));
        showToast(`Price updated for item.`);
      }
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, [inventory]);

  const handleAddAppointment = useCallback(async (appointment: Appointment) => {
    try {
      await upsertAppointment(appointment);
      setAppointments(prev => [appointment, ...prev]);
      showToast(`Appointment scheduled for ${appointment.petName}.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  const handleUpdateAppointment = useCallback(async (updated: Appointment) => {
    try {
      await upsertAppointment(updated);
      setAppointments(prev => prev.map(a => a.id === updated.id ? updated : a));

      // F-8: the queue item's emergencyBackfillRequired is a snapshot copied at
      // check-in time (App.tsx queue construction), not a live reference to the
      // appointment. If a backfill just cleared it on the appointment (F-2's
      // "Complete Details" flow), the matching queue item must be cleared too,
      // or every panel would keep showing "DETAILS PENDING" forever. The
      // urgency field is untouched here — the EMERGENCY badge should remain.
      if (updated.emergencyBackfillRequired === false) {
        const queueItem = clinicQueue.find(q => q.appointmentId === updated.id && q.emergencyBackfillRequired);
        if (queueItem) {
          const updatedQueueItem = { ...queueItem, emergencyBackfillRequired: false };
          await db.clinicQueue.setItem(queueItem.id, stampRecord(updatedQueueItem));
          setClinicQueue(prev => prev.map(q => q.id === queueItem.id ? updatedQueueItem : q));
        }
      }

      showToast(`Appointment for ${updated.petName} updated successfully.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, [clinicQueue]);

  const closeVisit = useCallback(async (appointmentId: string) => {
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) return;

    try {
      const updated = { ...apt, status: 'completed' as const, updated_at: new Date().toISOString(), _dirty: true };
      await upsertAppointment(updated);
      setAppointments(prev => prev.map(a => a.id === appointmentId ? updated : a));

      const queueItem = clinicQueue.find(q => q.appointmentId === appointmentId);
      if (queueItem) {
        await removeFromClinicQueue(queueItem.id);
        setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
      }
    } catch (error) {
      console.error('[CeylonPets] closeVisit failed:', error);
      throw error;
    }
  }, [appointments, clinicQueue]);

  const handleUpdateAppointmentStatus = useCallback(async (id: string, status: AppointmentStatus) => {
    let apt: Appointment | undefined = appointments.find(a => a.id === id);
    if (!apt) {
      // F-8 FIX: Emergency Intake calls onAddAppointment then handleCheckIn
      // back-to-back in the same handler, with no re-render between them, so
      // the just-created appointment isn't in this closure's `appointments`
      // state yet and the lookup above misses it. Fall back to the record
      // that was just persisted to IndexedDB so the status transition (and,
      // for 'in-progress', the queue-item construction below) still fires —
      // otherwise an emergency intake's queue item is silently never created.
      const dbApt = await db.appointments.getItem<Appointment>(id);
      if (dbApt) apt = dbApt;
    }
    if (apt) {
      try {
        if (status === 'completed') {
          await closeVisit(id);
        } else {
          const updated = { ...apt, status, updated_at: new Date().toISOString() };
          await upsertAppointment(updated);
          setAppointments(prev => prev.map(a => a.id === id ? updated : a));

          if (status === 'in-progress') {
            const normalize = (p: string) => (p || '').replace(/\D/g, '');
            const matchedPet = pets.find(p => {
              if (p.name.toLowerCase() !== (apt.petName || '').trim().toLowerCase()) return false;
              const client = clients.find(c => c.client_id === p.clientId);
              if (!client) return false;
              return normalize(client.primary_phone) === normalize(apt.ownerPhone) || client.primary_phone === apt.ownerPhone;
            });
            const queueItem: ClinicQueueItem = {
              id: `queue_${apt.id}_${crypto.randomUUID().slice(0,8)}`,
              petId: matchedPet ? matchedPet.id : `${(apt.petName || '').trim().toLowerCase()}_${apt.ownerPhone.replace(/\D/g, '').slice(-9)}`,
              petName: apt.petName,
              ownerName: apt.ownerName,
              ownerPhone: apt.ownerPhone,
              appointmentId: apt.id,
              serviceType: apt.admissionType === 'Vaccination' ? 'Vaccination' : apt.admissionType === 'Pet Boarding' ? 'Boarding' : apt.admissionType === 'Grooming Salon' ? 'Grooming' : 'Examination',
              checkInTime: new Date().toISOString(),
              status: 'active',
              priority: apt.urgency === 'emergency' ? 0 : (apt.urgency === 'non-emergency' ? 1 : 2),
              assignedVet: apt.veterinarian,
              urgency: apt.urgency || 'routine',
              emergencyBackfillRequired: apt.emergencyBackfillRequired || false
            };
            await addToClinicQueue(queueItem);
            setClinicQueue(prev => {
              const next = [queueItem, ...prev];
              return next.sort((a, b) => {
                const pA = a.priority ?? 2;
                const pB = b.priority ?? 2;
                if (pA !== pB) return pA - pB;
                return new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime();
              });
            });
          }

          if (status === 'cancelled') {
            const queueItem = clinicQueue.find(q => q.appointmentId === apt.id);
            if (queueItem) {
              await removeFromClinicQueue(queueItem.id);
              setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
            }
          }
        }

        showToast(`Appointment status updated to ${status}.`);
      } catch (error: any) {
        console.error('[CeylonPets] Appointment status update failed:', error);
        showToast(`Failed to update appointment status: ${error.message}`, 'error');
      }
    }
  }, [appointments, clinicQueue, pets, closeVisit]);

  const handleAddRecord = useCallback(async (newRec: MedicalRecord) => {
    try {
      await upsertMedicalRecord(newRec);
      setRecords(prev => [newRec, ...prev]);
      showToast(`Medical record added successfully.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  const handleUpdateRecord = useCallback(async (updated: MedicalRecord) => {
    try {
      await upsertMedicalRecord(updated);
      setRecords(prev => {
        const exists = prev.some(r => r.id === updated.id);
        if (exists) {
          return prev.map(r => r.id === updated.id ? updated : r);
        } else {
          return [updated, ...prev];
        }
      });
      showToast(`Medical record updated successfully.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  const handleDismissAlert = useCallback(async (id: string) => {
    try {
      const alert = alerts.find(a => a.id === id);
      if (alert) {
        const updated = { ...alert, read: true, updated_at: new Date().toISOString() };
        await db.alerts.setItem(id, updated);
        setAlerts(prev => prev.map(a => a.id === id ? updated : a));
      }
    } catch (error) {
      console.error('Failed to dismiss alert:', error);
    }
  }, [alerts]);

  const handleBulkUpdateRecords = useCallback(async (updatedRecords: MedicalRecord[]) => {
    try {
      const results = await Promise.allSettled(updatedRecords.map(record => upsertMedicalRecord(record)));
      
      setRecords(prev => {
        const newMap = new Map(prev.map(r => [r.id, r]));
        updatedRecords.forEach((ur, idx) => {
          if (results[idx].status === 'fulfilled') newMap.set(ur.id, ur);
        });
        return Array.from(newMap.values());
      });
      
    } catch (error) {
      console.error("Bulk sync failed:", error);
    }
  }, []);

  // FIX 2: Update local state after DB write so UI reflects changes immediately
  const handleUpdateClient = useCallback(async (client: any) => {
    try {
      await upsertClient(client);
      setClients(prev => {
        const exists = prev.some(c => c.client_id === client.client_id);
        if (exists) return prev.map(c => c.client_id === client.client_id ? client : c);
        return [...prev, client];
      });
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);
  // Removed unused handleUpdateInventory

  const handleUpdateInventoryItem = useCallback(async (item: InventoryItem) => {
    try {
      console.log('[App] handleUpdateInventoryItem called for:', item.name, 'stock:', item.stock, 'id:', item.id);
      await upsertInventoryItem(item);
      setInventory(prev => {
        const exists = prev.some(i => i.id === item.id);
        if (exists) {
          return prev.map(i => i.id === item.id ? item : i);
        }
        return [...prev, item];
      });
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
      throw error;
    }
  }, []);

  const handleDeleteInventoryItem = useCallback(async (id: string) => {
    const auth = await requireAuth(currentUser, 'delete_inventory');
    if (!auth.allowed) {
      showToast('Unauthorized. Inventory item was not deleted.', 'error');
      return;
    }
    try {
      await deleteInventoryItem(id);
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, [currentUser]);

  const handleDeleteRecord = useCallback(async (id: string) => {
    const auth = await requireAuth(currentUser, 'delete_medical_record');
    if (!auth.allowed) {
      showToast('Unauthorized. Medical record was not deleted.', 'error');
      return;
    }
    try {
      await deleteMedicalRecord(id);
      setRecords(prev => prev.filter(r => r.id !== id));
      showToast('Medical record permanently deleted.', 'success');
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, [currentUser]);

  // MISSION 2 FIX: Iterates IndexedDB directly instead of stale React state arrays.
  // This ensures ALL historical records are updated, not just today's in-memory subset.
  const handleUpdateCustomer = useCallback(async (oldPhone: string, newPhone: string, newName: string, newEmail: string) => {
    const normOld = oldPhone.replace(/\D/g, '');
    
    // Scan entire DB — not just today's state
    const aptUpdates: Appointment[] = [];
    await db.appointments.iterate((a: any) => {
      if (a && !Array.isArray(a) && a.ownerPhone && a.ownerPhone.replace(/\D/g, '') === normOld) {
        aptUpdates.push({ ...a, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail });
      }
    });
    
    const recUpdates: MedicalRecord[] = [];
    await db.records.iterate((r: any) => {
      if (r && !Array.isArray(r) && !(r as any).is_deleted && r.ownerPhone && r.ownerPhone.replace(/\D/g, '') === normOld) {
        recUpdates.push({ ...r, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail });
      }
    });
    
    const invUpdates: Invoice[] = [];
    await db.invoices.iterate((i: any) => {
      if (i && !Array.isArray(i) && (i.ownerPhone || '').replace(/\D/g, '') === normOld) {
        invUpdates.push({ ...i, ownerName: newName, ownerPhone: newPhone });
      }
    });

    try {
      await Promise.allSettled(aptUpdates.map(u => upsertAppointment(u)));
      await Promise.allSettled(recUpdates.map(u => upsertMedicalRecord(u)));
      await Promise.allSettled(invUpdates.map(u => upsertInvoice(u)));

      // Refresh state without destructive fetches
      setAppointments(prev => prev.map(a => aptUpdates.find(u => u.id === a.id) || a));
      setRecords(prev => prev.map(r => recUpdates.find(u => u.id === r.id) || r));
      setInvoices(prev => prev.map(i => invUpdates.find(u => u.id === i.id) || i));
    } catch (error: any) {
      console.error('[CeylonPets] Customer update failed:', error);
      showToast(`Failed to update customer across records: ${error.message}`, 'error');
    }
  }, []);

  // MISSION 2 FIX: Scan full DB for pet identity updates
  const handleUpdatePet = useCallback(async (oldPatientId: string, newPetName: string, newDetails: any) => {
    try {
      setPets(prev => {
        const exists = prev.find(p => p.id === oldPatientId);
        if (exists) return prev.map(p => p.id === oldPatientId ? { ...p, ...newDetails, name: newPetName } : p);
        return [...prev, { ...newDetails, id: oldPatientId, name: newPetName }];
      });

      const toUpdate: MedicalRecord[] = [];
      await db.records.iterate((r: any) => {
        if (r && !Array.isArray(r) && !(r as any).is_deleted && r.patientId === oldPatientId) {
          toUpdate.push({ ...r, petName: newPetName, ...newDetails });
        }
      });
      if (toUpdate.length === 0) return;
      await Promise.allSettled(toUpdate.map(u => upsertMedicalRecord(u)));
      setRecords(prev => prev.map(r => toUpdate.find(u => u.id === r.id) || r));
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  // F-3: SAFE SOFT-DELETE of a client (cascades to its pets) or a single pet.
  // Invoices / medical records / financial data are intentionally NOT touched —
  // they must remain intact for reporting integrity. Every deletion is audited.
  const writeDeletionAudit = async (audit: import('./types').DeletionAudit) => {
    await db.deletionAudit.setItem(audit.id, stampRecord(audit));
  };

  const handleDeleteClient = useCallback(async (
    client: import('./types').Client,
    meta: { hadHistory: boolean; historySummary: string; overrideConfirmed: boolean }
  ) => {
    try {
      const now = new Date().toISOString();
      // Cascade: soft-delete every pet belonging to this client.
      const clientPets: import('./types').Pet[] = [];
      await db.pets.iterate((p: any) => {
        if (p && !Array.isArray(p) && !p.is_deleted && (p.clientId === client.client_id || client.petIds?.includes(p.id))) {
          clientPets.push(p);
        }
      });
      for (const p of clientPets) {
        await db.pets.setItem(p.id, stampRecord({ ...p, is_deleted: true }));
      }
      await db.clients.setItem(client.client_id, stampRecord({ ...client, is_deleted: true }));

      await writeDeletionAudit({
        id: crypto.randomUUID(),
        entity_type: 'client',
        entity_id: client.client_id,
        entity_name: client.full_name,
        deleted_by: currentUser?.name || 'Unknown',
        deleted_at: now,
        had_history: meta.hadHistory,
        history_summary: meta.historySummary,
        override_confirmed: meta.overrideConfirmed,
        created_at: now,
        is_deleted: false
      });

      setPets(prev => prev.filter(p => !clientPets.some(cp => cp.id === p.id)));
      setClients(prev => prev.filter(c => c.client_id !== client.client_id));
      showToast('Client deleted. Audit logged.', 'success');
    } catch (error: any) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  }, [currentUser]);

  const handleDeletePet = useCallback(async (
    pet: import('./types').Pet,
    meta: { hadHistory: boolean; historySummary: string; overrideConfirmed: boolean }
  ) => {
    try {
      const now = new Date().toISOString();
      await db.pets.setItem(pet.id, stampRecord({ ...pet, is_deleted: true }));

      await writeDeletionAudit({
        id: crypto.randomUUID(),
        entity_type: 'pet',
        entity_id: pet.id,
        entity_name: pet.name,
        deleted_by: currentUser?.name || 'Unknown',
        deleted_at: now,
        had_history: meta.hadHistory,
        history_summary: meta.historySummary,
        override_confirmed: meta.overrideConfirmed,
        created_at: now,
        is_deleted: false
      });

      setPets(prev => prev.filter(p => p.id !== pet.id));
      showToast('Pet deleted. Audit logged.', 'success');
    } catch (error: any) {
      showToast(`Delete failed: ${error.message}`, 'error');
    }
  }, [currentUser]);

  // AUDIT FIX: Removed redundant double-write of appointment completion.
  // upsertInvoice in db.ts already marks the appointment as 'completed'.
  // Added try-catch for error resilience.
  // MISSION 2: Uses fetchTodaysInvoices instead of full fetchInvoices
  const handleAddInvoice = useCallback(async (invoice: any) => {
    try {
      await upsertInvoice(invoice);
      setInvoices(prev => [invoice, ...prev]);

      if (invoice.appointmentId) {
        await closeVisit(invoice.appointmentId);
      }
    } catch (error: any) {
      console.error('[CeylonPets] Invoice creation failed:', error);
      showToast(`Checkout failed: ${error.message}`, 'error');
    }
  }, [closeVisit]);

  // FIXED: No longer mutates React state directly — creates a new object
  // MISSION 2 FIX: Read from DB directly instead of stale state (old invoices aren't in state)
  const handleVoidInvoice = useCallback(async (id: any) => {
    const auth = await requireAuth(currentUser, 'void_invoice');
    if (!auth.allowed) {
      showToast('Unauthorized. Invoice was not voided.', 'error');
      return;
    }
    try {
      // FIX 4: Use functional state update instead of destructive re-fetch
      const target = await db.invoices.getItem<Invoice>(id);
      if (target) {
        if (target.paymentStatus !== 'void') {
          for (const item of target.items) {
            if (!['service', 'lab_service'].includes(item.category)) {
              const newStock = await atomicStockDecrement(item.itemId, +item.quantity);
              setInventory(prev => prev.map(invItem => invItem.id === item.itemId ? { ...invItem, stock: newStock } : invItem));
            }
          }
        }
        const voided = { ...target, paymentStatus: 'void' as const };
        await upsertInvoice(voided);
        setInvoices(prev => {
          const exists = prev.some(i => i.id === id);
          if (exists) return prev.map(i => i.id === id ? voided : i);
          return [voided, ...prev];
        });

        // MISSION 3: Decrement Client Lifetime Value if previously paid
        if (target.paymentStatus === 'paid' && target.patientId && target.patientId !== 'RETAIL') {
          const pet = pets.find(p => p.id === target.patientId);
          if (pet) {
            const client = clients.find(c => c.client_id === pet.clientId);
            if (client) {
              const updatedClient = {
                ...client,
                lifetime_value: Math.max(0, (client.lifetime_value || 0) - target.sales_total),
                updated_at: new Date().toISOString()
              };
              await handleUpdateClient(updatedClient);
            }
          }
        }
      }
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, [currentUser]);

  // MISSION 2: Uses fetchTodaysInvoices instead of full fetchInvoices
  // BUG #1 FIX: Removed outer globalMutex.lock() — atomicStockDecrement already
  // acquires the mutex internally. Double-locking caused a deadlock that froze checkout.
  // FIX 4: Use functional state updates instead of destructive re-fetches
  const handleAtomicCheckout = useCallback(async (invoice: Invoice, cart: any[]) => {
    try {
      await upsertInvoice(invoice);
      setInvoices(prev => [invoice, ...prev]);

      // MISSION 3: Update Client Lifetime Value
      if (invoice.patientId && invoice.patientId !== 'RETAIL') {
        const pet = pets.find(p => p.id === invoice.patientId);
        if (pet) {
          const client = clients.find(c => c.client_id === pet.clientId);
          if (client) {
            const updatedClient = {
              ...client,
              lifetime_value: (client.lifetime_value || 0) + invoice.sales_total,
              updated_at: new Date().toISOString()
            };
            await handleUpdateClient(updatedClient);
          }
        }
      }

      for (const cartItem of cart) {
        if (!['service', 'lab_service'].includes(cartItem.category)) {
          const newStock = await atomicStockDecrement(cartItem.id, -cartItem.cartQuantity);
          setInventory(prev => prev.map(item => item.id === cartItem.id ? { ...item, stock: newStock } : item));
        }
      }

      // Close visit (appointment complete + queue removal) via unified path
      if (invoice.appointmentId) {
        await closeVisit(invoice.appointmentId);
      }

      // Mark swept records as billed
      const uniqueRefs = new Map<string, { type: string; id: string }>();
      for (const cartItem of cart) {
        if (cartItem.sourceRefs) {
          for (const ref of cartItem.sourceRefs) {
            uniqueRefs.set(`${ref.type}-${ref.id}`, ref);
          }
        }
      }

      for (const ref of uniqueRefs.values()) {
        try {
          if (ref.type === 'vaccination') {
            const rec = await db.vaccinations.getItem<Vaccination>(ref.id);
            if (rec) await upsertVaccination({ ...rec, billed: true, updated_at: new Date().toISOString() });
          } else if (ref.type === 'grooming') {
            const rec = await db.groomingLogs.getItem<GroomingLog>(ref.id);
            if (rec) await upsertGroomingLog({ ...rec, billed: true, updated_at: new Date().toISOString() });
          } else if (ref.type === 'lab') {
            const rec = await db.labResults.getItem<LabResult>(ref.id);
            if (rec) await upsertLabResult({ ...rec, billed: true, updated_at: new Date().toISOString() });
          } else if (ref.type === 'boarding') {
            const rec = await db.boardingRecords.getItem<BoardingRecord>(ref.id);
            if (rec) await upsertBoardingRecord({ ...rec, billed: true, updated_at: new Date().toISOString() });
          }
        } catch (e) {
          console.error(`Failed to mark swept record billed:`, e);
        }
      }
    } catch (error: any) {
      console.error('Checkout failed:', error);
      showToast(`Checkout Error: ${error.message}`, 'error');
      throw error;
    }
  }, [closeVisit]);

  const handlePurgeDatabases = useCallback(async () => {
    try {
      // 1. Empty every IndexedDB store generically (clients, pets, appointments,
      //    invoices, inventory, staff, charts, system config — everything).
      await Promise.all(
        Object.values(db).map((store: any) =>
          store && typeof store.clear === 'function' ? store.clear() : Promise.resolve()
        )
      );
      // 2. Wipe web storage, then re-mark the deliberate purge so boot does NOT
      //    auto-repopulate the empty vault with demo data.
      localStorage.clear(); sessionStorage.clear();
      localStorage.setItem('kp_purged', '1');
      // 3. Hard-delete the whole IndexedDB database so nothing can resurrect on
      //    reload. Never hang if a live connection blocks the delete.
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => { if (!done) { done = true; resolve(); } };
        try {
          const req = indexedDB.deleteDatabase('CeylonPets_Enterprise_OS');
          req.onsuccess = finish; req.onerror = finish; req.onblocked = finish;
        } catch { finish(); }
        setTimeout(finish, 2000);
      });
      window.location.reload();
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  // Deletes the cloud copy on Supabase FIRST (irreversible, affects every device
  // sharing this project), then runs the same local purge. If the cloud delete
  // partially fails, we still purge locally but report exactly which tables
  // failed — never silently claim a clean wipe.
  const handleWipeCloudAndPurge = useCallback(async () => {
    try {
      const failures = await wipeAllCloudTables();
      if (failures.length > 0) {
        showToast(`Cloud wipe partially failed on: ${failures.map(f => f.table).join(', ')}. Local data will still be purged.`, 'error');
      }
      await handlePurgeDatabases();
    } catch (error: any) {
      showToast(`Cloud wipe failed: ${error.message}`, 'error');
    }
  }, [handlePurgeDatabases]);

  // Single shared implementation — see verifyMasterPin above. Kept as a named
  // prop-facing wrapper for the panels that receive onVerifyMasterPin.
  const handleVerifyMasterPin = (pin: string): boolean => verifyMasterPin(pin);

  /**
   * AUTH-3: resolve + verify a username's OWN credential (never a shared master
   * PIN). Lives here because App owns systemConfig, which holds the provider's
   * masterPin including its default fallback.
   */
  const checkCredential = useCallback(async (username: string, credential: string) => {
    if (!username || !credential) return { valid: false, user: null };

    // The provider/admin account is config-backed, not a db.users row.
    if (username === 'ashpoint_owner') {
      const stored = systemConfig.masterPin || hashPin('5692');
      const valid = isBcryptHash(stored)
        ? await verifyCredential(credential, stored)
        : await migrateOldHash(stored, credential);
      const user = valid
        ? ({ id: 'ashpoint_owner', name: `${systemConfig.appName} Provider`, username: 'ashpoint_owner', role: 'provider', avatarColor: '' } as any)
        : null;
      return { valid, user };
    }

    let found: any = null;
    await db.users.iterate((u: any) => { if (u && !u.is_deleted && u.username === username && u.active !== false) found = u; });
    const stored = found?.pin || pinCache[username] || '';
    if (!found || !stored) return { valid: false, user: null };

    const valid = isBcryptHash(stored)
      ? await verifyCredential(credential, stored)
      : await migrateOldHash(stored, credential);
    return { valid, user: valid ? found : null };
  }, [systemConfig, pinCache]);

  /**
   * AUTH-6: the ONLY roles any UI may mint. 'provider' (vendor root) and 'admin'
   * (universally permitted today) and 'owner' are deliberately absent — they are
   * seeded/onboarded out-of-band, never issued from a staff screen. This is the
   * real guard; removing them from the dropdowns is only the cosmetic half.
   */
  const ISSUABLE_ROLES = ['cashier', 'veterinarian', 'manager', 'groomer'];
  const assertIssuableRole = (role: string): boolean => {
    if (ISSUABLE_ROLES.includes(role)) return true;
    showToast(`Role "${role}" cannot be issued from this screen.`, 'error');
    console.warn(`[AUTH-6] Blocked attempt to issue privileged role "${role}" via UI.`);
    return false;
  };

  const isViewPermitted = (viewName: string, user: any): boolean => {
    if (!user) return false;
    // AUTH-6: root tier = admin (vendor-root today) and provider (above it).
    // Deliberate and explicit — not the accidental bypass this used to be.
    if (ROOT_ROLES.includes(user.role)) return true;
    if (user.role === 'dummy_admin') return viewName === 'settings';
    if (user.role === 'pet_parent') return viewName === 'portal';
    if (viewName === 'settings') return false;
    const checkedView = (viewName === 'reports' || viewName === 'dashboard') ? 'dashboard' : viewName;
    // NOTE: this literal is only a fallback — systemConfig.rolePermissions is
    // always populated, so it normally wins. Both must stay in sync; a role
    // missing from EITHER falls through to `|| []` (= zero views).
    const defaultPermissions: Record<string, string[]> = {
      cashier: ['pos', 'shift'],
      veterinarian: ['dashboard', 'appointments', 'examinations', 'boarding', 'grooming', 'shift'],
      manager: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'boarding', 'grooming', 'shift'],
      groomer: ['grooming', 'shift'],
      admin: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      provider: ['dashboard', 'pos', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming', 'inventory', 'invoices', 'shift', 'staff', 'reminders', 'portal']
    };
    // HOTFIX-1: the old `as 'cashier'|'veterinarian'|'admin'|'owner'` cast lied to
    // TypeScript — it is why the missing 'manager' key compiled cleanly instead of
    // erroring. Indexing a Record<string, string[]> keeps this honest.
    const rolePerms: Record<string, string[]> = (systemConfig.rolePermissions as any) || defaultPermissions;
    const permissions = rolePerms[user.role] || defaultPermissions[user.role] || [];
    if (checkedView === 'portal') return true;
    return permissions.includes(checkedView);
  };

  const getDefaultViewForUser = (user: any): any => {
    if (!user) return 'portal';
    if (ROOT_ROLES.includes(user.role) || user.role === 'dummy_admin') return 'settings';
    if (user.role === 'pet_parent') return 'portal';
    const priorityViews = ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'portal'] as const;
    for (const view of priorityViews) {
      if (isViewPermitted(view, user)) return view === 'dashboard' ? 'reports' : view;
    }
    return 'portal';
  };

  /**
   * Verify `attempt` against a stored credential that may still be in the OLD
   * homemade hash format. Returns whether it matched, plus the freshly-bcrypted
   * hash to persist when a legacy credential is successfully upgraded.
   */
  const verifyAndUpgrade = async (
    stored: string,
    attempt: string
  ): Promise<{ ok: boolean; upgradedHash?: string }> => {
    if (!stored || !attempt) return { ok: false };
    if (isBcryptHash(stored)) {
      return { ok: await verifyCredential(attempt, stored) };
    }
    // Legacy credential — check it, and if it matches, re-hash with bcrypt so
    // the user silently upgrades without a manual reset.
    if (await migrateOldHash(stored, attempt)) {
      return { ok: true, upgradedHash: await hashCredential(attempt) };
    }
    return { ok: false };
  };

  const registerFailure = (username: string) => {
    recordFailedAttempt(username);
    setPinError(true);
    setTimeout(() => setPinError(false), 2000);
    setEnteredPin('');
    const l = isLockedOut(username);
    setLockoutSeconds(l.locked ? l.secondsRemaining : 0);
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUsername || isVerifying) return;

    // Guess limiter — refuse to even attempt while locked out.
    const lock = isLockedOut(selectedUsername);
    if (lock.locked) { setLockoutSeconds(lock.secondsRemaining); return; }

    setIsVerifying(true);
    try {
      if (selectedUsername === 'ashpoint_owner') {
        const stored = systemConfig.masterPin || hashPin('5692');
        const { ok, upgradedHash } = await verifyAndUpgrade(stored, enteredPin);
        if (!ok) { registerFailure(selectedUsername); return; }

        if (upgradedHash) {
          const nextConfig = { ...systemConfig, masterPin: upgradedHash };
          await db.system.setItem('config', nextConfig);
          setSystemConfig(nextConfig);
        }
        resetAttempts(selectedUsername);
        setCurrentUser({ id: crypto.randomUUID(), name: `${systemConfig.appName} Provider`, username: 'ashpoint_owner', role: 'provider', avatarColor: 'bg-indigo-600 text-white border-indigo-700' });
        setActiveView('settings');
        setEnteredPin(''); setSelectedUsername(''); setLockoutSeconds(0);
        return;
      }

      const foundUser = users.find(u => u.username === selectedUsername && u.active !== false);
      const stored = foundUser?.pin || pinCache[selectedUsername] || '';
      const { ok, upgradedHash } = await verifyAndUpgrade(stored, enteredPin);
      if (!foundUser || !ok) { registerFailure(selectedUsername); return; }

      if (upgradedHash) {
        const persisted = await db.users.getItem<any>(foundUser.id);
        const updated = { ...(persisted || foundUser), pin: upgradedHash };
        await db.users.setItem(foundUser.id, updated);
        setUsers(prev => prev.map(u => u.id === foundUser.id ? { ...u, pin: upgradedHash } : u));
        setPinCache(prev => ({ ...prev, [selectedUsername]: upgradedHash }));
      }
      resetAttempts(selectedUsername);
      setCurrentUser(foundUser);
      setActiveView(getDefaultViewForUser(foundUser));
      setEnteredPin(''); setSelectedUsername(''); setLockoutSeconds(0);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveStaffProfile = useCallback(async (profile: StaffProfile) => {
    await db.staffProfiles.setItem(profile.id, profile);
    setStaffProfiles(prev => {
      const exists = prev.find(p => p.id === profile.id);
      return exists ? prev.map(p => p.id === profile.id ? profile : p)
                    : [...prev, profile];
    });
  }, []);

  const handleDeactivateStaffProfile = useCallback(async (id: string) => {
    const profile = staffProfiles.find(p => p.id === id);
    if (!profile) return;
    const updated = { ...profile, active: false, updated_at: new Date().toISOString(), _dirty: true };
    await db.staffProfiles.setItem(id, updated);
    setStaffProfiles(prev => prev.map(p => p.id === id ? updated : p));
  }, [staffProfiles]);

  const handleSaveTimeEntry = useCallback(async (entry: TimeEntry) => {
    const stamped = { ...entry, updated_at: new Date().toISOString(), _dirty: true };
    await db.timeEntries.setItem(stamped.id, stamped);
    setTimeEntries(prev => {
      const exists = prev.find(t => t.id === stamped.id);
      return exists ? prev.map(t => t.id === stamped.id ? stamped : t)
                    : [...prev, stamped];
    });
  }, []);

  const handleSaveScheduleEntry = useCallback(async (entry: ScheduleEntry) => {
    const stamped = { ...entry, updated_at: new Date().toISOString(), _dirty: true };
    await db.scheduleEntries.setItem(stamped.id, stamped);
    setScheduleEntries(prev => {
      const exists = prev.find(t => t.id === stamped.id);
      return exists ? prev.map(t => t.id === stamped.id ? stamped : t)
                    : [...prev, stamped];
    });
  }, []);

  const handleDeleteScheduleEntry = useCallback(async (id: string) => {
    const entry = scheduleEntries.find(e => e.id === id);
    if (!entry) return;
    const stamped = { ...entry, is_deleted: true, updated_at: new Date().toISOString(), _dirty: true };
    await db.scheduleEntries.setItem(id, stamped);
    setScheduleEntries(prev => prev.filter(e => e.id !== id));
  }, [scheduleEntries]);

  const handleSavePayslip = useCallback(async (payslip: Payslip) => {
    const stamped = { ...payslip, updated_at: new Date().toISOString(), _dirty: true };
    await db.payslips.setItem(stamped.id, stamped);
    setPayslips(prev => {
      const exists = prev.find(p => p.id === stamped.id);
      return exists ? prev.map(p => p.id === stamped.id ? stamped : p)
                    : [...prev, stamped];
    });
  }, []);

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
    { id: 'reports', label: 'Reports', icon: BarChart3, isLive: true },
    { id: 'staff', label: 'Staff & Payroll', icon: UserCog, isLive: true }
  ];

  const renderCanvas = () => {
    switch (activeView) {
      case 'pos': {
        const { masterPin, dummyAdminPin, ...safeSystemConfig } = systemConfig;
        return (
          <POSRegister
            inventory={inventory} 
            appointments={appointments}
            records={records}
            clinicQueue={clinicQueue}
            currentUser={currentUser} invoices={invoices} onUpdateStock={handleUpdateStock}
            onAddInvoice={handleAddInvoice} onVoidInvoice={handleVoidInvoice} systemConfig={safeSystemConfig}
            onVerifyMasterPin={handleVerifyMasterPin} onTriggerInventorySync={async () => { }}
            activeShift={activeShift} activeShiftId={activeShift?.id} incomingClient={viewPayload?.client ? { phone: viewPayload.client.primary_phone || '', name: viewPayload.client.full_name || '', id: viewPayload.client.client_id || '' } : null}
            onUpdateRecord={handleUpdateRecord}
            onAtomicCheckout={handleAtomicCheckout}
            onNavigateToShift={() => { setActiveView('shift'); setHistoryStack(prev => [...prev, 'shift']); }}
          />
        );
      }
      case 'appointments': return <AppointmentsManager appointments={appointments} records={records} onAddAppointment={handleAddAppointment} onUpdateStatus={handleUpdateAppointmentStatus} onAddRecord={handleAddRecord} onUpdateAppointment={handleUpdateAppointment} onUpdateClient={handleUpdateClient} onUpdatePet={handleUpdatePet} preFilledClient={viewPayload?.client} preFilledPet={viewPayload?.pet} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} />;
      case 'boarding': return <BoardingManager systemConfig={systemConfig} clients={clients} pets={pets} records={records} clinicQueue={clinicQueue} inventory={inventory} onUpdateStock={handleUpdateStock} onUpdateRecord={handleUpdateRecord} onDischargeToQueue={async (item) => { await addToClinicQueue(item); setClinicQueue(prev => prev.some(q => q.id === item.id) ? prev : [item, ...prev]); }} />;
      case 'grooming': return <GroomingManager clients={clients} pets={pets} records={records} inventory={inventory} clinicQueue={clinicQueue} onUpdateRecord={handleUpdateRecord} systemConfig={systemConfig} />;
      case 'inventory': return <InventoryManager inventory={inventory} onAddProduct={handleAddProduct} onUpdateStock={handleUpdateStock} onUpdatePrice={handleUpdatePrice} onUpdateInventory={handleUpdateInventoryItem} onDeleteInventory={handleDeleteInventoryItem} systemConfig={systemConfig} />;
      case 'invoices': return <InvoicesManager invoices={invoices} onVoidInvoice={handleVoidInvoice} systemConfig={systemConfig} />;
      case 'shift': return <ShiftManager invoices={invoices} currentUser={currentUser} activeShift={activeShift} setActiveShift={async (s) => { if (s) { await db.system.setItem('active_shift', s); } else { await db.system.removeItem('active_shift'); } setActiveShift(s); }} onSaveShift={async (log) => { await db.shiftReconciliations.setItem(log.id, stampRecord(log)); setShiftLogs(prev => [log, ...prev]); }} onVerifyMasterPin={handleVerifyMasterPin} />;
      case 'dashboard':
        // FIX 8: Pass activeShift and onNavigate props
        return <DashboardAnalytics invoices={invoices} appointments={appointments} records={records} inventory={inventory} activeShift={activeShift} clinicQueue={clinicQueue} scheduleEntries={scheduleEntries} timeEntries={timeEntries} staffProfiles={staffProfiles} currentUser={currentUser} onNavigate={(tab) => { setActiveView(tab); setHistoryStack([tab]); }} />;
      case 'reports':
        return <ReportsManager onVerifyMasterPin={handleVerifyMasterPin} currentUser={currentUser} config={systemConfig} />;
      case 'staff': 
        return <StaffManager staffProfiles={staffProfiles} users={users} currentUser={currentUser} timeEntries={timeEntries} onSaveTimeEntry={handleSaveTimeEntry} scheduleEntries={scheduleEntries} onSaveScheduleEntry={handleSaveScheduleEntry} onDeleteScheduleEntry={handleDeleteScheduleEntry} onSaveProfile={handleSaveStaffProfile} onDeactivateProfile={handleDeactivateStaffProfile} payslips={payslips} onSavePayslip={handleSavePayslip} onSaveUser={async (user) => { if (!assertIssuableRole(user.role)) return; await db.users.setItem(user.id, user); setUsers(prev => { const next = [...prev]; const idx = next.findIndex(u => u.id === user.id); if (idx >= 0) next[idx] = user; else next.push(user); return next; }); }} />;
      case 'examinations': return <MedicalRecordsManager clients={clients} pets={pets} clinicQueue={clinicQueue} records={records} boardingRecords={boardingRecords} inventory={inventory as any} appointments={appointments} systemConfig={systemConfig} viewPayload={viewPayload} onUpdateRecord={handleUpdateRecord} onAddRecord={handleAddRecord} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'settings': {
        const { masterPin, dummyAdminPin, ...safeSystemConfig } = systemConfig;
        return (
          <SystemSettings
            config={safeSystemConfig}
            onChangeConfig={async (config) => {
              // SECURE-1: `config` here is safeSystemConfig (masterPin/dummyAdminPin
              // stripped), so a naive replace would silently reset the provider
              // password to the shipped default on ANY settings save. Merge onto the
              // full config so those secrets survive.
              const merged = { ...systemConfig, ...config } as SystemConfig;
              await db.system.setItem('config', merged);
              setSystemConfig(merged);
            }}
            users={users.map(({ pin, ...safeU }) => safeU)}
            onForceCloudSync={async () => { if (syncEngineRef.current) await syncEngineRef.current.forceSync(); }}
            onRefreshUsers={async () => { }}
            onAddUser={async (user) => {
              // AUTH-4 FIX: new accounts previously stored their PIN in PLAINTEXT,
              // which no verifier accepts — so every account made here could never
              // log in. Hash it with bcrypt on creation, like every other credential.
              if (!assertIssuableRole(user.role)) return; // AUTH-6 guard
              const { pin, ...safeUser } = user;
              const raw = pin || pinCache[user.username];
              const hashed = raw ? await hashCredential(String(raw)) : undefined;
              const userToSave = { ...safeUser, pin: hashed };
              await db.users.setItem(userToSave.id, userToSave);
              setUsers(prev => [...prev, userToSave]);
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
            onUpdateInventory={handleUpdateInventoryItem}
            onDeleteInventory={handleDeleteInventoryItem}
            onRestoreSnapshot={async () => true}
            onChangePassword={async (target: any, newPassword: string) => {
              // AUTH-4/SECURE-1: min length enforced HERE (at set time) and in the
              // UI — never at login/verify time. The provider (root) account needs
              // 12+; staff accounts 8+. Always stored bcrypt-hashed.
              const isProviderTarget = target?.username === 'ashpoint_owner' || target?.id === 'ashpoint_owner';
              const minLen = isProviderTarget ? 12 : 8;
              if (!newPassword || newPassword.length < minLen) {
                showToast(`New password must be at least ${minLen} characters.`, 'error');
                return;
              }
              const hashed = await hashCredential(newPassword);
              if (isProviderTarget) {
                const next = { ...systemConfig, masterPin: hashed };
                await db.system.setItem('config', next);
                setSystemConfig(next);
              } else {
                const persisted = await db.users.getItem<any>(target.id);
                const updated = { ...(persisted || target), pin: hashed };
                await db.users.setItem(target.id, updated);
                setUsers(prev => prev.map(u => u.id === target.id ? { ...u, pin: hashed } : u));
                setPinCache(prev => ({ ...prev, [target.username]: hashed }));
              }
            }}
            onPurgeDatabases={handlePurgeDatabases}
            onWipeCloudAndPurge={handleWipeCloudAndPurge}
            cloudSyncEnabled={SYNC_ENABLED}
            onVerifyMasterPin={handleVerifyMasterPin}
            autoOpenProviderPassword={autoOpenProviderPw}
            onAutoOpenHandled={() => setAutoOpenProviderPw(false)}
            defaultPasswordActive={isDefaultProviderPassword}
          />
        );
      }
      case 'pets': return <PatientPortal clients={clients} pets={pets} records={records} appointments={appointments} clinicQueue={clinicQueue} onBookAppointment={handleAddAppointment} systemConfig={systemConfig} viewPayload={viewPayload} onAddRecord={handleAddRecord} onGoToCustomers={(phone) => { setViewPayload({ selectedPhone: phone }); setActiveView('customers'); setHistoryStack(prev => [...prev, 'customers']); }} onGoToAppointments={(client, pet) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onUpdatePet={handleUpdatePet} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'vaccinations': return <VaccinationsManager clients={clients} pets={pets} clinicQueue={clinicQueue} records={records} inventory={inventory} onUpdateRecord={handleUpdateRecord} onUpdateStock={handleUpdateStock} />;
      // FIX 8: Pass appointments prop to Lab
      case 'laboratory': return <LaboratoryManager clients={clients} pets={pets} records={records} inventory={inventory as any} appointments={appointments} clinicQueue={clinicQueue} onUpdateRecord={handleUpdateRecord} onAddRecord={handleAddRecord} />;
      case 'customers': return <CustomersManager currentUser={currentUser} clients={clients} pets={pets} records={records} invoices={invoices} appointments={appointments} clinicQueue={clinicQueue} onGoToPOS={(client) => { setViewPayload({ client }); setActiveView('pos'); setHistoryStack(prev => [...prev, 'pos']); }} onGoToAppointments={(client, pet?) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onGoToRecords={(patientId) => { setActiveView('examinations'); setHistoryStack(prev => [...prev, 'examinations']); }} onUpdateCustomer={handleUpdateCustomer} onUpdateClient={handleUpdateClient} onUpdatePet={handleUpdatePet} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} onAddRecord={handleAddRecord} onUpdateRecordsBulk={handleBulkUpdateRecords} onVerifyMasterPin={handleVerifyMasterPin} onDeleteClient={handleDeleteClient} onDeletePet={handleDeletePet} />;
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
          <p className="text-slate-400 font-bold text-sm leading-relaxed">
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
        <div className="w-24 h-24 mb-8 bg-slate-800 rounded-2xl flex items-center justify-center animate-pulse border border-slate-700 shadow-2xl">
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
                    <span className="px-3 py-1 bg-white/20 text-white font-bold rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1.5 w-max">
                      <span className="text-sm select-none leading-none">{systemConfig.invoiceLogo}</span> {systemConfig.appName} Core Medical Suite
                    </span>
                    <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-sm border-2 border-white/30 border-dashed inline-block">
                      <p className="text-white/70 font-bold text-xs uppercase tracking-widest text-center">Your Logo Here<br /><span className="text-[10px] font-bold opacity-75 capitalize mt-1 block">(Upload via System Settings)</span></p>
                    </div>
                    <p className="text-white/80 leading-relaxed font-bold text-sm max-w-sm">Serving Pet parents cleanly and securely. Tablet-ready clinical charts, custom billing registers, and automated client alerts.</p>
                  </div>
                  <div className="text-white/90 font-bold tracking-wide text-[10px] uppercase flex flex-col gap-0.5 mt-12 pb-4">
                    <span className="opacity-70 tracking-widest">CeylonPets Medical OS</span>
                    <span className="font-black text-[13px] tracking-widest drop-shadow-sm text-yellow-300">POWERED BY ASH POINT SOLUTIONS</span>
                  </div>
                </div>
                <div className="absolute -bottom-8 -left-8 w-44 h-44 bg-sky-500 rounded-full blur-xl opacity-50" />
              </div>

              <div className="p-8 flex flex-col justify-between space-y-6 font-sans">
                <div className="space-y-4">
                  {idleMessage && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-xs font-bold animate-fade-in flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {idleMessage}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Secure Clinician Sign-In</h3>
                    <p className="text-slate-400 mt-1">{isPasswordAccount ? 'Enter your administrator password to access the terminal.' : 'Select your account and enter your secure 4-digit PIN to access the terminal.'}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <form onSubmit={handlePinSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="login-username" className="font-bold text-slate-700 block text-[10px]">Select Staff Member</label>
                      <select id="login-username" name="username" autoComplete="username" value={selectedUsername} onChange={(e) => setSelectedUsername(e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs font-bold text-slate-700" required>
                        <option value="" disabled>-- Choose Staff --</option>
                        <option value="ashpoint_owner">Service Provider (System Root Admin)</option>
                        {users.filter(u => u.active !== false).map((u) => <option key={u.id} value={u.username}>{u.name} ({u.role ? u.role.toUpperCase() : 'UNKNOWN'})</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label htmlFor="login-pin" className="font-bold text-slate-700 block text-[10px]">{isPasswordAccount ? 'Enter Administrator Password' : 'Enter 4-Digit Passcode PIN'}</label>
                        {pinError && <span data-testid="login-error" className="text-[10px] text-rose-600 font-bold animate-pulse">{isPasswordAccount ? 'Incorrect password.' : 'Incorrect passcode pin.'}</span>}
                      </div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            id="login-pin"
                            data-testid="input-pin"
                            name="pin"
                            type={isPasswordAccount && showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            {...(isPasswordAccount ? { inputMode: 'text' as const } : { inputMode: 'numeric' as const, maxLength: 4, pattern: '[0-9]*' })}
                            placeholder={isPasswordAccount ? 'Password' : '••••'}
                            value={enteredPin}
                            onChange={(e) => setEnteredPin(e.target.value)}
                            disabled={isVerifying || lockoutSeconds > 0}
                            className={`w-full py-2.5 bg-slate-50 border border-slate-200 font-mono font-bold text-sm rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 ${isPasswordAccount ? 'pl-3 pr-10 text-left tracking-normal' : 'px-3 text-center tracking-widest'}`}
                            required
                          />
                          {isPasswordAccount && (
                            <button
                              type="button"
                              data-testid="btn-toggle-password"
                              onClick={() => setShowPassword(v => !v)}
                              tabIndex={-1}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                              aria-label={showPassword ? 'Hide password' : 'Show password'}
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                        <button
                          type="submit"
                          data-testid="btn-verify-pin"
                          disabled={isVerifying || lockoutSeconds > 0}
                          className="px-5 bg-slate-800 hover:bg-slate-900 font-bold text-white rounded-xl transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[76px]"
                        >
                          {isVerifying ? <span data-testid="login-spinner" className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Verify'}
                        </button>
                      </div>
                      {lockoutSeconds > 0 && (
                        <p data-testid="login-lockout" className="text-[10px] text-rose-600 font-black pt-1">
                          Too many attempts, try again in {lockoutSeconds}s
                        </p>
                      )}
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
                  <div className="bg-blue-600 p-1.5 rounded-xl shadow-sm"><PawPrint className="w-5 h-5 text-white" /></div>
                  <div>
                    <h1 className="text-lg font-bold leading-none tracking-tight">{systemConfig.appName || 'CeylonPets'}</h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{systemConfig.resellerName || 'Ash Point'}</p>
                  </div>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  if (!item.isLive) return <a key={item.id} data-testid={`nav-${item.id}`} href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-50 transition-colors opacity-80 cursor-default"><Icon className="w-5 h-5" />{item.label}</a>;
                  const permissionKey = item.id === 'reports' || item.id === 'dashboard' ? 'dashboard' : item.id;
                  if (!isViewPermitted(permissionKey, currentUser)) return null;
                  const isSelected = activeView === item.id || (activeView === 'reports' && item.id === 'dashboard');
                  return (
                    <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => { setActiveView(item.id); setViewPayload(null); setHistoryStack([item.id]); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-blue-600' : 'text-gray-500'}`} />{item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-gray-100 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block font-bold text-gray-800 text-xs truncate leading-tight">{currentUser.name}</span>
                  <span className="block text-[10px] text-gray-400 capitalize font-bold mt-0.5 truncate">{currentUser.role} console</span>
                </div>
              </div>
              <div className="p-3 border-t border-gray-200 bg-gray-50/50 space-y-1">
                {isViewPermitted('settings', currentUser) && (
                  <button
                    data-testid="nav-settings"
                    onClick={() => { setActiveView('settings'); setHistoryStack(['settings']); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeView === 'settings'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <Settings className={`w-5 h-5 ${activeView === 'settings' ? 'text-blue-600' : 'text-gray-500'}`} />
                    Settings
                  </button>
                )}
                <button
                  onClick={() => {
                    setCurrentUser(null);
                    setSelectedUsername('');
                    setEnteredPin('');
                    setIdleMessage(null);
                    setActiveView('pos');
                    setViewPayload(null);
                    setHistoryStack(['dashboard']);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Users className="w-5 h-5 text-slate-400" />
                  Switch User
                </button>
                <button
                  onClick={() => {
                    setCurrentUser(null);
                    setSelectedUsername('');
                    setEnteredPin('');
                    setIdleMessage(null);
                    setActiveView('pos');
                    setViewPayload(null);
                    setHistoryStack(['dashboard']);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                >
                  <LogOut className="w-5 h-5 text-rose-500" />
                  Sign Out
                </button>
              </div>
            </aside>

            {/* MAIN CANVAS */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-gray-100">
              {currentUser?.role === 'provider' && isDefaultProviderPassword && (
                <div data-testid="default-password-banner" className="shrink-0 bg-rose-600 text-white px-6 py-3 flex items-center justify-between gap-4 shadow-md">
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight">DEFAULT PASSWORD IN USE — change it now</p>
                      <p className="text-[11px] font-bold text-rose-100 leading-tight">This deployment still accepts the shipped default provider password. Anyone can log in as root until you change it.</p>
                    </div>
                  </div>
                  <button
                    data-testid="btn-banner-change-password"
                    onClick={() => { setActiveView('settings'); setHistoryStack(['settings']); setAutoOpenProviderPw(true); }}
                    className="shrink-0 px-4 py-2 bg-white text-rose-700 font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-rose-50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Change Password Now
                  </button>
                </div>
              )}
              <div className="bg-white border-b border-gray-200 h-14 flex items-center px-6 gap-4 shrink-0 shadow-xs justify-between">
                <div className="flex items-center gap-4">
                  {historyStack.length > 1 && (
                    <button
                      onClick={() => {
                        // FIX 10: Renamed to avoid variable shadowing with setter callback
                        const prevView = historyStack[historyStack.length - 2];
                        setHistoryStack(s => s.slice(0, -1));
                        setActiveView(prevView);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold rounded-xl transition-all cursor-pointer"
                    >
                      <ChevronLeft className="w-3 h-3" /> Back
                    </button>
                  )}
                  <span className="text-xs font-bold text-slate-500 capitalize">{activeView}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="text-xs font-bold">{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                  <div className="hidden md:block w-px h-5 bg-slate-200" />
                  <button onClick={() => setShowNotifications(true)} className="relative p-2 rounded-full hover:bg-slate-100 transition-colors cursor-pointer">
                    <Bell className="w-5 h-5 text-slate-600" />
                    {alerts.filter(a => !a.read).length > 0 && (
                      <span className="absolute top-0 right-0 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-[10px] font-black text-white border-2 border-white">
                        {alerts.filter(a => !a.read).length}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              <div className="flex-1 w-full min-h-0 overflow-y-auto">
                <ClinicErrorBoundary key={activeView} onNavigate={(view) => { setActiveView(view); setHistoryStack([view]); }}>
                  {renderCanvas()}
                </ClinicErrorBoundary>
              </div>
            </main>
          </div>
        )}
        <ToastContainer />
        {/* AUTH-3: single authorization modal driven by requireAuth() */}
        <AuthPromptHost checkCredential={checkCredential} />
        <Modal
          open={showNotifications}
          onClose={() => setShowNotifications(false)}
          title="Notifications & Alerts"
          size="lg"
        >
          <NotificationsModal
            notifications={notifications}
            alerts={alerts}
            onDismissAlert={handleDismissAlert}
            onSendNotification={(id) => {
              // TODO: wire to real SMS/email provider.
              console.log(`Simulated sending notification ${id}`);
              showToast('Notification dispatched to queue.', 'success');
            }}
          />
        </Modal>
      </div>
    </>
  );
}

export default function AppWrapper() {
  return <App />;
}