/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode, useState, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { Session } from '@supabase/supabase-js';

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

import { stampRecord } from './lib/recordMeta';
import { recordFailedAttempt, isLockedOut, resetAttempts } from './lib/credentials';
import { requireAuth, setPolicyOverrides, ROOT_ROLES, canViewSettingsTab } from './lib/requireAuth';

import {
  Calculator, LayoutDashboard, Calendar, PawPrint, Users, Syringe,
  Stethoscope, TestTube, Package, FileText,
  BarChart3, Settings, LogOut, CloudLightning, Lock,
  ChevronLeft, Home, Scissors, Activity, Bell, Eye, EyeOff, AlertTriangle, Truck, Menu
} from 'lucide-react';

import {
  InventoryItem, Appointment, MedicalRecord, ClientNotification,
  SystemAlert, Invoice, AppointmentStatus,
  ActiveShift, ClinicQueueItem, User, ClinicSettings, DEFAULT_CLINIC_PANELS,
  Vaccination, GroomingLog, LabResult, BoardingRecord, StaffProfile, TimeEntry, ScheduleEntry, InvoiceSourceRef
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
import SuppliersManager from './components/SuppliersManager';
import SuperAdminLayout from './components/SuperAdminLayout';

import { 
  fetchAppointments,
  fetchMedicalRecords,
  fetchInventory,
  fetchInvoices,
  fetchTodaysRecords,
  fetchTodaysInvoices,
  fetchShiftMetrics,
  fetchNotifications,
  fetchAlerts,
  fetchClinicQueue,
  fetchPets,
  fetchClients,
  fetchBoardingRecords,
  fetchVaccinations,
  fetchGroomingLogs,
  fetchLabResults,
  upsertClient,
  upsertInventoryItem,
  upsertAppointment, 
  upsertMedicalRecord,
  deleteMedicalRecord, 
  upsertInvoice,
  commitCheckoutInvoiceAndStock,
  processCheckoutEffects,
  processPendingCheckoutEffects,
  upsertAlert,
  upsertVaccination,
  upsertGroomingLog,
  upsertLabResult,
  upsertBoardingRecord,
  upsertClinicQueueItem,
  removeFromClinicQueue,
  atomicStockDecrement,
  deleteInventoryItem,
  deleteClient,
  deletePet,
  voidInvoiceAndReverseRevenue,
  fetchActiveShiftDetails,
   fetchUsers,
   upsertUser,
   deleteUser,
   fetchSystemConfig,
   fetchStaffProfiles,
  fetchTimeEntries,
    fetchScheduleEntries,
    upsertStaffProfile,
  upsertTimeEntry,
  upsertScheduleEntry,
  deleteScheduleEntry,
   insertDeletionAudit,
     setCurrentClinicId
  } from './lib/db';
import { SYNC_ENABLED, supabase, requireSupabase, signInWithPassword, signOut, onAuthStateChange } from './lib/supabase';
import { fetchStaffForSession, upsertSystemConfig as saveSystemConfig } from './lib/auth';

const ACTIVE_VIEW_STORAGE_KEY = 'ceylonpets.activeView';

interface AppProps {
  initialSession: Session | null;
  initialAuthError: Error | null;
}

function getStoredActiveView(): string {
  try {
    return window.sessionStorage.getItem(ACTIVE_VIEW_STORAGE_KEY) || 'dashboard';
  } catch {
    return 'dashboard';
  }
}

function rememberActiveView(view: string): void {
  try {
    window.sessionStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}

function forgetActiveView(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_VIEW_STORAGE_KEY);
  } catch {
    // Session storage can be unavailable in privacy-restricted browsers.
  }
}

function App({ initialSession, initialAuthError }: AppProps) {
  // SYSTEM BOOT STATE
  const [isBooting, setIsBooting] = useState(true);
  const [dbCorrupted, setDbCorrupted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const authRequestRef = React.useRef(0);
  const initialSessionRef = React.useRef(initialSession);
  const initialAuthErrorRef = React.useRef(initialAuthError);

  // CORE DATA MATRICES (Now initialized empty, hydrated by DB)
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clinicQueue, setClinicQueue] = useState<ClinicQueueItem[]>([]);
  const [pets, setPets] = useState<import('./types').Pet[]>([]);
  const [clients, setClients] = useState<import('./types').Client[]>([]);
  const [boardingRecords, setBoardingRecords] = useState<import('./types').BoardingRecord[]>([]);
  const [vaccinations, setVaccinations] = useState<Vaccination[]>([]);
  const [groomingLogs, setGroomingLogs] = useState<GroomingLog[]>([]);
  const [labResults, setLabResults] = useState<LabResult[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activeShift, setActiveShift] = useState<ActiveShift | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);

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
    localAutosaveInterval: 15,
    cloudEndpoint: '',
    cloudBackupEnabled: false,
    emailDigestEnabled: false,
    recipientEmails: [],
    digestSchedule: 'daily_end',
      rolePermissions: {
        cashier: ['pos', 'appointments', 'pets', 'customers'],
      veterinarian: ['dashboard', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming'],
      // HOTFIX-1: 'manager' had NO entry anywhere, so isViewPermitted fell through
      // to `|| []` and every manager account could log in but saw zero views.
      // Operational floor above cashier; no 'reminders'/'portal' (owner-only).
      // 'settings' is impossible here regardless — hard-blocked above.
      manager: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'suppliers', 'boarding', 'grooming', 'shift'],
       // PROVIDER-1: 'groomer' gets a real grooming floor. 'admin' is no longer root — this is
      // its ordinary default, based on what 'owner' gets; provider can grant or
      // revoke panels per role from the Panel Access Matrix in Settings.
       groomer: ['grooming'],
      admin: ['dashboard', 'reports', 'pos', 'appointments', 'examinations', 'inventory', 'suppliers', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'reports', 'pos', 'appointments', 'inventory', 'suppliers', 'invoices', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      // 'provider' is root and bypasses isViewPermitted; this value is documentary.
       provider: ['dashboard', 'reports', 'pos', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming', 'inventory', 'suppliers', 'invoices', 'shift', 'reminders', 'portal']
    },
  } as SystemConfig);

  // SECURE-1: banner deep-link flag — used to jump Settings straight to the
  // provider password modal when requested.
  const [autoOpenProviderPw, setAutoOpenProviderPw] = useState(false);
  const [enteredPassword, setEnteredPassword] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginMessage, setLoginMessage] = useState('');

  // --- AUTHENTICATED CLOUD BOOTLOADER --------------------------------------
  // Startup restore and later Auth events share one state machine. This avoids
  // the old race where boot and onAuthStateChange hydrated the same user
  // independently and a stale request could restore a signed-out session.
  useEffect(() => {
    let isMounted = true;
    let hasHydrated = false;
    const hydrationRequestRef = { current: 0 };

    const isCurrent = (authRequest: number, hydrationRequest?: number) =>
      isMounted
      && authRequest === authRequestRef.current
      && (hydrationRequest === undefined || hydrationRequest === hydrationRequestRef.current);

    const clearAuthState = (message?: string) => {
      if (!isMounted) return;
      hasHydrated = false;
      setCurrentUser(null);
      setClinicSettings(null);
      setCurrentClinicId(null);
      if (message) setLoginMessage(message);
      setIsBooting(false);
    };

    const hydrateCloudData = async (staff: User, authRequest: number) => {
      if (staff.isSuperadmin) {
        // The clinic-less control plane does not hydrate tenant matrices.
        try {
          const config = await fetchSystemConfig();
          if (isCurrent(authRequest) && config) {
            setSystemConfig(prev => ({ ...prev, ...(config as any) }));
          }
        } catch (error) {
          if (import.meta.env.DEV) console.warn('[SuperAdmin] Global config load failed:', error);
        }
        if (isCurrent(authRequest)) setIsBooting(false);
        return;
      }

      const hydrationRequest = ++hydrationRequestRef.current;
      try {
        try {
          await processPendingCheckoutEffects();
        } catch (effectsError) {
          if (import.meta.env.DEV) console.warn('[CeylonPets] Pending checkout effects will be retried later:', effectsError);
        }

        const [appts, recs, inv, invs, _metrics, queue, fetchedPets, fetchedClients, fetchedBoardingRecords] = await Promise.all([
          fetchAppointments(30),
          fetchTodaysRecords(),
          fetchInventory(),
          fetchTodaysInvoices(),
          fetchShiftMetrics(),
          fetchClinicQueue(),
          fetchPets(),
          fetchClients(),
          fetchBoardingRecords(),
        ]);

        if (!isCurrent(authRequest, hydrationRequest)) return;
        setInventory(Array.isArray(inv) ? inv as any : []);
        setAppointments(Array.isArray(appts) ? appts as any : []);
        setRecords(Array.isArray(recs) ? recs as any : []);
        setInvoices(Array.isArray(invs) ? invs as any : []);
        setPets(Array.isArray(fetchedPets) ? fetchedPets as any : []);
        setClients(Array.isArray(fetchedClients) ? fetchedClients as any : []);
        setBoardingRecords(Array.isArray(fetchedBoardingRecords) ? fetchedBoardingRecords as any : []);
        // Empty core matrices are valid after a purge; do not wait for secondary hydration.
        setIsBooting(false);
        hasHydrated = true;

        const [hStaffProfiles, hTimeEntries, hScheduleEntries] = await Promise.all([
          fetchStaffProfiles(),
          fetchTimeEntries(),
          fetchScheduleEntries(),
        ]);
        const hNotifications = await fetchNotifications();
        const hAlerts = await fetchAlerts();
        const hUsers: any[] = await fetchUsers();
        const { shift: cloudShift } = await fetchActiveShiftDetails();
        const hActiveShift = cloudShift ? {
          id: cloudShift.id,
          openedAt: cloudShift.startTime,
          openedBy: cloudShift.openedBy,
          openedByName: cloudShift.openedBy,
          openingFloat: cloudShift.opening_float || (cloudShift.openingFloatCents || 0) / 100,
        } : null;
        const hConfig = await fetchSystemConfig();

        if (!isCurrent(authRequest, hydrationRequest)) return;
        setNotifications(Array.isArray(hNotifications) ? hNotifications as any : []);
        setAlerts(Array.isArray(hAlerts) ? hAlerts as any : []);
        setUsers(Array.isArray(hUsers) ? hUsers as any : []);
        const activeAppointmentIds = new Set(
          (Array.isArray(appts) ? appts : [])
            .filter((a: any) => !a.is_deleted && !['cancelled', 'completed', 'no-show'].includes(a.status))
            .map((a: any) => a.id),
        );
        const activePetIds = new Set(
          (Array.isArray(fetchedPets) ? fetchedPets : [])
            .filter((p: any) => !p.is_deleted)
            .map((p: any) => p.id),
        );
        const validQueue = (Array.isArray(queue) ? queue : []).filter((q: any) => {
          if (q.status !== 'active' || q.is_deleted) return false;
          return q.appointmentId ? activeAppointmentIds.has(q.appointmentId) : activePetIds.has(q.petId);
        });
        setClinicQueue(validQueue.sort((a: any, b: any) => {
          const pA = a.priority ?? 2;
          const pB = b.priority ?? 2;
          if (pA !== pB) return pA - pB;
          return new Date(a.checkInTime).getTime() - new Date(b.checkInTime).getTime();
        }));
        setStaffProfiles(hStaffProfiles);
        setTimeEntries(hTimeEntries);
        setScheduleEntries(hScheduleEntries);
        setActiveShift(hActiveShift as any);

        if (hConfig) {
          setSystemConfig(prev => {
            const merged = { ...prev, ...(hConfig as any) };
            if (!merged.rolePermissions) merged.rolePermissions = prev.rolePermissions;
            if (!merged.rolePermissions.cashier?.length) merged.rolePermissions.cashier = prev.rolePermissions.cashier;
            if (!merged.rolePermissions.veterinarian) merged.rolePermissions.veterinarian = prev.rolePermissions.veterinarian;
            if (!merged.rolePermissions.veterinarian.includes('dashboard')) {
              merged.rolePermissions.veterinarian = [...merged.rolePermissions.veterinarian, 'dashboard'];
            }
            if (!merged.rolePermissions.manager) merged.rolePermissions.manager = prev.rolePermissions.manager;
            if (!merged.rolePermissions.admin) merged.rolePermissions.admin = prev.rolePermissions.admin;
            if (!merged.rolePermissions.owner) merged.rolePermissions.owner = prev.rolePermissions.owner;
            if (!merged.rolePermissions.groomer) merged.rolePermissions.groomer = prev.rolePermissions.groomer;
            if (!merged.rolePermissions.provider) merged.rolePermissions.provider = prev.rolePermissions.provider;
            return merged;
          });
        }
      } catch (hydrationError) {
        if (import.meta.env.DEV) console.error('[Bootloader] Cloud hydration failed:', hydrationError);
        if (isCurrent(authRequest, hydrationRequest)) {
          setDbCorrupted(true);
          setIsBooting(false);
        }
      }
    };

    const applySession = async (session: Session | null, authRequest: number, shouldHydrate: boolean) => {
      if (!isCurrent(authRequest)) return;
      if (!session?.user) {
        clearAuthState();
        return;
      }

      const staff = await fetchStaffForSession(session);
      if (!isCurrent(authRequest)) return;
      if (!staff) {
        clearAuthState('Staff account is not linked. Contact your administrator.');
        void signOut().catch(error => {
          if (import.meta.env.DEV) console.error('[Auth] Failed to clear an unlinked session:', error);
        });
        return;
      }
      if (!staff.clinicId && !staff.isSuperadmin) {
        clearAuthState('Staff account is not assigned to a clinic. Contact your administrator.');
        void signOut().catch(error => {
          if (import.meta.env.DEV) console.error('[Auth] Failed to clear an unassigned session:', error);
        });
        return;
      }

      setDbCorrupted(false);
      setCurrentClinicId(staff.clinicId ?? null);
      setClinicSettings(staff.clinicSettings ?? null);
      setCurrentUser(staff);
      setEnteredPassword('');
      setLoginEmail('');
      setLockoutSeconds(0);
      setLoginMessage('');

      if (shouldHydrate || !hasHydrated) {
        setIsBooting(true);
        hasHydrated = false;
        await hydrateCloudData(staff, authRequest);
      } else {
        setIsBooting(false);
      }
    };

    const handleAuthEvent = (event: string, session: import('@supabase/supabase-js').Session | null) => {
      // The root bootstrap owns the initial getSession call. Ignoring this event
      // prevents a second initial staff lookup from racing the boot sequence.
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT' || !session?.user) {
        const request = ++authRequestRef.current;
        hydrationRequestRef.current += 1;
        clearAuthState();
        if (request === authRequestRef.current) setRoutePath('/');
        return;
      }
      if (event === 'TOKEN_REFRESHED' && hasHydrated) return;
      if (event !== 'SIGNED_IN' && event !== 'TOKEN_REFRESHED' && event !== 'USER_UPDATED') return;

      const request = ++authRequestRef.current;
      const shouldHydrate = event !== 'TOKEN_REFRESHED' || !hasHydrated;
      // Supabase recommends not awaiting network work inside its auth callback.
      window.setTimeout(() => {
        void applySession(session, request, shouldHydrate).catch(error => {
          if (!isCurrent(request)) return;
          if (import.meta.env.DEV) console.error('[Auth] Session hydration failed:', error);
          clearAuthState('Authentication could not be completed. Try again.');
        });
      }, 0);
    };

    const testAuthUser = import.meta.env.DEV
      ? ((window as any).__KP_TEST_AUTH__ as User | undefined)
      : undefined;
    if (testAuthUser) {
      const request = ++authRequestRef.current;
      setCurrentClinicId(testAuthUser.clinicId ?? null);
      setClinicSettings(testAuthUser.clinicSettings ?? (testAuthUser.clinicId ? {
        clinicId: testAuthUser.clinicId,
        taxEnabled: true,
        groomingEnabled: true,
        boardingEnabled: true,
        enabledPanels: [...DEFAULT_CLINIC_PANELS],
      } : null));
      setCurrentUser(testAuthUser);
      void hydrateCloudData(testAuthUser, request);
      return () => { isMounted = false; hydrationRequestRef.current += 1; };
    }

    if (!SYNC_ENABLED || !supabase) {
      setDbCorrupted(true);
      setIsBooting(false);
      return () => { isMounted = false; };
    }

    const unsubscribe = onAuthStateChange(handleAuthEvent);
    const initialRequest = ++authRequestRef.current;
    if (initialAuthErrorRef.current) {
      if (import.meta.env.DEV) console.error('[Auth] Initial session restore failed:', initialAuthErrorRef.current);
      clearAuthState('Authentication could not be restored. Try again.');
    } else {
      void applySession(initialSessionRef.current, initialRequest, true).catch(error => {
        if (!isCurrent(initialRequest)) return;
        if (import.meta.env.DEV) console.error('[Auth] Initial session restore failed:', error);
        clearAuthState('Authentication could not be restored. Try again.');
      });
    }

    return () => {
      isMounted = false;
      hydrationRequestRef.current += 1;
      unsubscribe();
    };
  }, []);

  // Session states
  const [isOnline, setIsOnline] = useState(false);
  // The authenticated staff record, including clinicId, stays in root React
  // state and is never persisted to browser storage.
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<string>(getStoredActiveView);
  const [viewPayload, setViewPayload] = useState<any>(null);
  const [historyStack, setHistoryStack] = useState<string[]>(['dashboard']);
  const [consentPayload, setConsentPayload] = useState<{ clientName: string, petName: string } | null>(null);
  const [idleMessage, setIdleMessage] = useState<string | null>(null);
  useEffect(() => {
    setCurrentClinicId(currentUser?.clinicId ?? null);
    setClinicSettings(currentUser?.clinicSettings ?? null);
  }, [currentUser]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings | null>(null);
  const [routePath, setRoutePath] = useState(() => window.location.pathname);
  const navigateRoute = (path: string) => {
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    setRoutePath(path);
  };
  useEffect(() => {
    const handlePopState = () => setRoutePath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    if (!currentUser || currentUser.isSuperadmin || !clinicSettings) return;
    const disabledView = activeView !== 'settings' && (!clinicSettings.enabledPanels.includes(activeView)
      || (activeView === 'grooming' && !clinicSettings.groomingEnabled)
      || (activeView === 'boarding' && !clinicSettings.boardingEnabled));
    if (disabledView) {
      rememberActiveView('dashboard');
      setActiveView('dashboard');
    }
  }, [currentUser, clinicSettings, activeView]);
  useEffect(() => {
    if (currentUser?.isSuperadmin && routePath !== '/superadmin') {
      navigateRoute('/superadmin');
    } else if (currentUser && !currentUser.isSuperadmin && routePath === '/superadmin') {
      navigateRoute('/');
    }
  }, [currentUser?.id, currentUser?.isSuperadmin, routePath]);
  // Sync status indicator: reflect browser online/offline state in the existing
  // isOnline flag.
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // AUTH-8: Idle timeout tracking
  useEffect(() => {
    if (!currentUser || !systemConfig.idleLogoutMinutes || systemConfig.idleLogoutMinutes <= 0) return;
    
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void signOut().finally(() => {
          setCurrentUser(null);
          setIdleMessage("Logged out due to inactivity");
        });
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

  // Step 32: staff sign in with their Supabase Auth email + password. The email
  // is the lockout key (there is no staff selector before authentication).
  // Live lockout countdown for the entered email — re-enables the form the
  // moment the lockout expires, without needing a page refresh.
  useEffect(() => {
    const key = loginEmail.trim().toLowerCase();
    if (!key) { setLockoutSeconds(0); return; }
    const tick = () => {
      const { locked, secondsRemaining } = isLockedOut(key);
      setLockoutSeconds(locked ? secondsRemaining : 0);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [loginEmail]);

  useEffect(() => {
    if (currentUser && !isViewPermitted(activeView, currentUser)) {
      const nextView = getDefaultViewForUser(currentUser);
      rememberActiveView(nextView);
      setActiveView(nextView);
    }
  }, [currentUser, activeView, systemConfig]);

  useEffect(() => {
    if (currentUser) rememberActiveView(activeView);
  }, [currentUser, activeView]);

  const handleAddProduct = useCallback(async (product: InventoryItem) => {
    try {
      await upsertInventoryItem(product);
      setInventory(prev => [product, ...prev]);
      showToast(`${product.name} added to inventory.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  // Atomic stock decrement is resolved by the Supabase transaction, not React state.
  const handleUpdateStock = useCallback(async (itemId: string, qtyDelta: number, _expectedStock?: number) => {
    let newStock: number | null = null;
    try {
      newStock = await atomicStockDecrement(itemId, qtyDelta);
    } catch (error: any) {
      // Cloud-only: a failed atomic stock operation must never be reconstructed
      // from browser state. Show the failure and leave React stock state unchanged.
      if (import.meta.env.DEV) console.error('[CeylonPets] Stock update failed:', error);
      showToast(`Stock update failed: ${error.message}`, 'error');
      throw error;
    }
    if (newStock === null) return;
    const finalStock = newStock;

    // Update React state to match the DB truth
    setInventory(prev => prev.map(item => item.id === itemId ? { ...item, stock: finalStock } : item));

    const currentItem = inventory.find(i => i.id === itemId);
    if (currentItem && finalStock <= currentItem.minStock && currentItem.category !== 'service') {
      const alert: SystemAlert = { id: crypto.randomUUID(), severity: 'urgent', category: 'inventory', message: `LOW STOCK: ${currentItem.name} (${finalStock} left).`, timestamp: new Date().toISOString(), read: false };
      await upsertAlert(alert);
      setAlerts(prev => [alert, ...prev]);
    }
    showToast(`Stock updated: ${currentItem?.name || itemId} (${finalStock} remaining).`, 'success');
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
          await upsertClinicQueueItem(updatedQueueItem);
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
      const updated = { ...apt, status: 'completed' as const, updated_at: new Date().toISOString() };
      await upsertAppointment(updated);
      setAppointments(prev => prev.map(a => a.id === appointmentId ? updated : a));

      const queueItem = clinicQueue.find(q => q.appointmentId === appointmentId);
      if (queueItem) {
        await removeFromClinicQueue(queueItem.id, 'completed');
        setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('[CeylonPets] closeVisit failed:', error);
      throw error;
    }
  }, [appointments, clinicQueue]);

  const handleUpdateAppointmentStatus = useCallback(async (id: string, status: AppointmentStatus) => {
    let apt: Appointment | undefined = appointments.find(a => a.id === id);
    if (!apt && supabase) {
      // F-8 FIX: Emergency Intake calls onAddAppointment then handleCheckIn
      // back-to-back in the same handler, with no re-render between them, so
      // the just-created appointment isn't in this closure's `appointments`
      // state yet and the lookup above misses it. Fall back to the record
      // that was just persisted to Supabase so the status transition (and,
      // for 'in-progress', the queue-item construction below) still fires —
      // otherwise an emergency intake's queue item is silently never created.
      // Reads the cloud, not IndexedDB, which is empty after the migration.
      const { data } = await supabase.from('appointments').select('*').eq('id', id).maybeSingle();
      apt = data as Appointment | undefined;
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
            const existingQueueItem = clinicQueue.find(q => q.appointmentId === apt.id && q.status === 'active' && !q.is_deleted);
            const queueItem: ClinicQueueItem = {
              // Re-check-in and double-clicks must update one queue row, not
              // create another visit for the same appointment.
              id: existingQueueItem?.id || `queue_${apt.id}`,
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
              emergencyBackfillRequired: apt.emergencyBackfillRequired || false,
              is_deleted: false
            };
            await upsertClinicQueueItem(queueItem);
            setClinicQueue(prev => {
              const next = prev.some(q => q.id === queueItem.id)
                ? prev.map(q => q.id === queueItem.id ? queueItem : q)
                : [queueItem, ...prev];
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
              await removeFromClinicQueue(queueItem.id, 'cancelled');
              setClinicQueue(prev => prev.filter(q => q.id !== queueItem.id));
            }
          }
        }

        showToast(`Appointment status updated to ${status}.`, 'success');
      } catch (error: any) {
        if (import.meta.env.DEV) console.error('[CeylonPets] Appointment status update failed:', error);
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
      applyUpdatedRecord();
      showToast(`Medical record updated successfully.`);
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
    function applyUpdatedRecord() {
      setRecords(prev => {
        const exists = prev.some(r => r.id === updated.id);
        if (exists) {
          return prev.map(r => r.id === updated.id ? updated : r);
        } else {
          return [updated, ...prev];
        }
      });
    }
  }, []);

  const handleDismissAlert = useCallback(async (id: string) => {
    try {
      const alert = alerts.find(a => a.id === id);
      if (alert) {
        const updated = { ...alert, read: true, updated_at: new Date().toISOString() };
        await upsertAlert(updated);
        setAlerts(prev => prev.map(a => a.id === id ? updated : a));
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to dismiss alert:', error);
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
      if (import.meta.env.DEV) console.error("Bulk sync failed:", error);
    }
  }, []);

  // FIX 2: Update local state after DB write so UI reflects changes immediately
  const handleUpdateClient = useCallback(async (client: any) => {
    try {
      await upsertClient(client);
      applyClient();
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
    function applyClient() {
      setClients(prev => {
        const exists = prev.some(c => c.client_id === client.client_id);
        if (exists) return prev.map(c => c.client_id === client.client_id ? client : c);
        return [...prev, client];
      });
    }
  }, []);
  // Removed unused handleUpdateInventory

  const handleUpdateInventoryItem = useCallback(async (item: InventoryItem) => {
    try {
      if (import.meta.env.DEV) console.log('[App] handleUpdateInventoryItem called for:', item.name, 'stock:', item.stock, 'id:', item.id);
      await upsertInventoryItem(item);
      applyItem();
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
      throw error;
    }
    function applyItem() {
      setInventory(prev => {
        const exists = prev.some(i => i.id === item.id);
        if (exists) {
          return prev.map(i => i.id === item.id ? item : i);
        }
        return [...prev, item];
      });
    }
  }, []);

  const handleDeleteInventoryItem = useCallback(async (id: string) => {
    try {
      await deleteInventoryItem(id);
      setInventory(prev => prev.filter(i => i.id !== id));
      showToast('Deleted', 'success');
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
      throw error; // Re-throw so callers know the delete failed.
    }
  }, []);

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

    // Scan cloud history (not just today's mirror) so identity edits reach older
    // rows. Fail-closed: if any read throws, stop before the propagation writes
    // rather than treating a cloud outage as an empty update set.
    let aptUpdates: Appointment[] = [];
    let recUpdates: MedicalRecord[] = [];
    let invUpdates: Invoice[] = [];
    try {
      // includeDeleted=true: the original scan matched EVERY appointment row,
      // including soft-deleted ones.
      const [allAppts, allRecs, allInvs] = await Promise.all([
        fetchAppointments(undefined, true),
        fetchMedicalRecords(),
        fetchInvoices(),
      ]);
      aptUpdates = allAppts
        .filter((a: any) => a && a.ownerPhone && a.ownerPhone.replace(/\D/g, '') === normOld)
        .map((a: any) => ({ ...a, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail }));
      recUpdates = allRecs
        .filter((r: any) => r && !(r as any).is_deleted && r.ownerPhone && r.ownerPhone.replace(/\D/g, '') === normOld)
        .map((r: any) => ({ ...r, ownerName: newName, ownerPhone: newPhone, ownerEmail: newEmail }));
      invUpdates = allInvs
        .filter((i: any) => i && (i.ownerPhone || '').replace(/\D/g, '') === normOld)
        .map((i: any) => ({ ...i, ownerName: newName, ownerPhone: newPhone }));
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('[CeylonPets] Customer update history read failed:', error);
      showToast(`Failed to update customer across records: ${error.message}`, 'error');
      return;
    }

    try {
      // Attempt every independent write (non-aborting). Only rows whose write
      // fulfilled are merged into React state; rejected rows stay unchanged so
      // the UI never claims a history row was updated when its cloud write failed.
      const aptResults = await Promise.allSettled(aptUpdates.map(u => upsertAppointment(u)));
      const recResults = await Promise.allSettled(recUpdates.map(u => upsertMedicalRecord(u)));
      const invResults = await Promise.allSettled(invUpdates.map(u => upsertInvoice(u)));

      const aptDone = aptUpdates.filter((_, i) => aptResults[i]?.status === 'fulfilled');
      const recDone = recUpdates.filter((_, i) => recResults[i]?.status === 'fulfilled');
      const invDone = invUpdates.filter((_, i) => invResults[i]?.status === 'fulfilled');

      // Refresh state without destructive fetches — fulfilled writes only.
      setAppointments(prev => prev.map(a => aptDone.find(u => u.id === a.id) || a));
      setRecords(prev => prev.map(r => recDone.find(u => u.id === r.id) || r));
      setInvoices(prev => prev.map(i => invDone.find(u => u.id === i.id) || i));

      const anyRejected = [...aptResults, ...recResults, ...invResults]
        .some(r => r.status === 'rejected');
      if (anyRejected) {
        if (import.meta.env.DEV) console.error('[CeylonPets] Some customer history writes failed');
        showToast('Some customer history updates failed and were not saved.', 'error');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('[CeylonPets] Customer update failed:', error);
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

      // Cloud history scan (fail-closed): a thrown read is caught below, showing
      // the error toast and stopping before any propagation write.
      const allRecs = await fetchMedicalRecords();
      const toUpdate: MedicalRecord[] = allRecs
        .filter((r: any) => r && !(r as any).is_deleted && r.patientId === oldPatientId)
        .map((r: any) => ({ ...r, petName: newPetName, ...newDetails }));
      if (toUpdate.length === 0) return;
      // Non-aborting: attempt every record write, merge only fulfilled rows.
      const recResults = await Promise.allSettled(toUpdate.map(u => upsertMedicalRecord(u)));
      const recDone = toUpdate.filter((_, i) => recResults[i]?.status === 'fulfilled');
      setRecords(prev => prev.map(r => recDone.find(u => u.id === r.id) || r));
      if (recResults.some(r => r.status === 'rejected')) {
        showToast('Some pet history updates failed and were not saved.', 'error');
      }
    } catch (error: any) {
      showToast(`Failed: ${error.message}`, 'error');
    }
  }, []);

  // F-3: SAFE SOFT-DELETE of a client (cascades to its pets) or a single pet.
  // Invoices / medical records / financial data are intentionally NOT touched —
  // they must remain intact for reporting integrity. Every deletion is audited.
  const writeDeletionAudit = async (audit: import('./types').DeletionAudit) => {
    await insertDeletionAudit(stampRecord(audit));
  };

  const handleDeleteClient = useCallback(async (
    client: import('./types').Client,
    meta: { hadHistory: boolean; historySummary: string; overrideConfirmed: boolean }
  ) => {
    try {
      const now = new Date().toISOString();
      // Soft-delete the client and CASCADE to all their pets, in Supabase.
      // Invoices and medical records are deliberately left untouched.
      await deleteClient(client.client_id);

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

      setPets(prev => prev.filter(p => p.clientId !== client.client_id));
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
      // Soft-delete in Supabase; medical records and invoices are preserved.
      await deletePet(pet.id);

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
      if (import.meta.env.DEV) console.error('[CeylonPets] Invoice creation failed:', error);
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
      const { data: targetData, error: targetError } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
      if (targetError) throw targetError;
      const target = targetData as Invoice | null;
      if (target) {
        // ATOMIC void boundary: ONE server transaction restores stock for the
        // invoice's non-service items, flips it to void, reverts the linked
        // appointment, and reverses the exact shift revenue — idempotent by invoice
        // status. No client-side pre-RPC restock (that could double-restock on a
        // retry/concurrent void). Throws on failure -> outer catch, so a failed void
        // changes nothing at all.
        const voidResult = await voidInvoiceAndReverseRevenue(id);

        // Reflect the RPC's authoritative restored stock levels, then the voided
        // invoice, in local UI — only after the RPC succeeded.
        const restocked = voidResult.restocked || {};
        setInventory(prev => prev.map(item =>
          Object.prototype.hasOwnProperty.call(restocked, item.id)
            ? { ...item, stock: restocked[item.id] }
            : item
        ));
        const voided = { ...target, paymentStatus: 'void' as const };
        setInvoices(prev => {
          const exists = prev.some(i => i.id === id);
          if (exists) return prev.map(i => i.id === id ? voided : i);
          return [voided, ...prev];
        });

        // MISSION 3: Decrement Client Lifetime Value once, only when THIS call
        // actually voided a previously-paid invoice (RPC reversed flag; false on an
        // idempotent repeat).
        if (voidResult.reversed && target.patientId && target.patientId !== 'RETAIL') {
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

        // A voided sale must release the exact clinical source rows that were
        // marked billed during checkout so they can be rebilled after correction.
        const sourceRefs = (target.items || []).flatMap(item => item.sourceRefs || []) as InvoiceSourceRef[];
        let sourceUnbillingFailed = false;
        const uniqueRefs = new Map<string, InvoiceSourceRef>();
        sourceRefs.forEach(ref => uniqueRefs.set(`${ref.type}-${ref.id}`, ref));
        for (const ref of uniqueRefs.values()) {
          try {
            if (ref.type === 'vaccination') {
              const record = (await fetchVaccinations()).find(row => row.id === ref.id);
              if (record?.billed) await upsertVaccination({ ...record, billed: false, updated_at: new Date().toISOString() });
            } else if (ref.type === 'grooming') {
              const record = (await fetchGroomingLogs()).find(row => row.id === ref.id);
              if (record?.billed) await upsertGroomingLog({ ...record, billed: false, updated_at: new Date().toISOString() });
            } else if (ref.type === 'lab') {
              const record = (await fetchLabResults()).find(row => row.id === ref.id);
              if (record?.billed) await upsertLabResult({ ...record, billed: false, updated_at: new Date().toISOString() });
            } else if (ref.type === 'boarding') {
              const record = (await fetchBoardingRecords()).find(row => row.id === ref.id);
              if (record?.billed) await upsertBoardingRecord({ ...record, billed: false, updated_at: new Date().toISOString() });
            }
          } catch (error) {
            sourceUnbillingFailed = true;
            if (import.meta.env.DEV) console.error('[CeylonPets] Failed to release billed source row:', error);
          }
        }
        if (sourceUnbillingFailed) showToast('Invoice voided, but one or more linked clinical rows could not be released for rebilling.', 'warning');
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
      // The server resolves catalog values, tax, cost, shift ownership, and stock
      // inside one transaction. The outbox records the remaining effects before
      // this call returns, so a lost response is recoverable and idempotent.
      const stockItems = cart
        .filter((ci: any) => !['service', 'lab_service'].includes(ci.category))
        .map((ci: any) => ({ item_id: ci.id, qty: ci.cartQuantity }));
      const commit = await commitCheckoutInvoiceAndStock(invoice, stockItems);
      const committedInvoice = commit.invoice || invoice;
      setInvoices(prev => (prev.some(i => i.id === committedInvoice.id)
        ? prev.map(i => i.id === committedInvoice.id ? committedInvoice : i)
        : [committedInvoice, ...prev]));
      setInventory(prev => prev.map(item =>
        Object.prototype.hasOwnProperty.call(commit.remaining_stock, item.id)
          ? { ...item, stock: commit.remaining_stock[item.id] }
          : item
      ));

      let effects: Awaited<ReturnType<typeof processCheckoutEffects>>;
      try {
        effects = await processCheckoutEffects(committedInvoice.id);
      } catch (effectsError: any) {
        // The invoice, stock, shift, appointment, and queue are already durable.
        // The pending outbox row makes this safe to retry from an operational job.
        showToast('Sale saved, but linked customer/service updates are pending retry.', 'warning');
        if (import.meta.env.DEV) console.error('[CeylonPets] Checkout effects pending:', effectsError);
        return committedInvoice;
      }

      if (effects.processed && effects.client_id && effects.client_value_delta) {
        setClients(prev => prev.map(client => client.client_id === effects.client_id
          ? { ...client, lifetime_value: (client.lifetime_value || 0) + Number(effects.client_value_delta), updated_at: new Date().toISOString() }
          : client));
      }
      if (effects.processed) {
        const sourceRefs = effects.source_refs || [];
        for (const ref of sourceRefs) {
          if (ref.type === 'vaccination') setVaccinations(prev => prev.map(row => row.id === ref.id ? { ...row, billed: true } : row));
          if (ref.type === 'grooming') setGroomingLogs(prev => prev.map(row => row.id === ref.id ? { ...row, billed: true } : row));
          if (ref.type === 'lab') setLabResults(prev => prev.map(row => row.id === ref.id ? { ...row, billed: true } : row));
          if (ref.type === 'boarding') setBoardingRecords(prev => prev.map(row => row.id === ref.id ? { ...row, billed: true } : row));
        }
      }
      if (committedInvoice.appointmentId) {
        setAppointments(prev => prev.map(apt => apt.id === committedInvoice.appointmentId
          ? { ...apt, status: 'completed' as const, updated_at: new Date().toISOString() }
          : apt));
        setClinicQueue(prev => prev.filter(item => item.appointmentId !== committedInvoice.appointmentId));
      }
      return committedInvoice;
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Checkout failed:', error);
      // The invoice+stock RPC rolls back on INSUFFICIENT_STOCK, so nothing was
      // saved. Map that one opaque DB error to a clear POS message; still a hard
      // failed checkout (no local fallback, no success/retry warning).
      const raw = typeof error?.message === 'string' ? error.message : '';
      const msg = raw.includes('INSUFFICIENT_STOCK')
        ? 'Checkout failed: not enough stock for one or more items. No sale was recorded.'
        : `Checkout Error: ${error.message}`;
      showToast(msg, 'error');
      throw error;
    }
  }, []);

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
    if (import.meta.env.DEV) console.warn(`[AUTH-6] Blocked attempt to issue privileged role "${role}" via UI.`);
    return false;
  };

  const isViewPermitted = (viewName: string, user: any): boolean => {
    if (!user) return false;
    // Network entitlements are evaluated before role permissions and root-role
    // shortcuts. A tenant cannot bypass a Super Admin product decision by
    // changing its local role or deep-linking to a disabled route.
    if (!user.isSuperadmin && viewName !== 'settings' && !clinicSettings) return false;
    if (!user.isSuperadmin && viewName !== 'settings' && clinicSettings && !clinicSettings.enabledPanels.includes(viewName)) return false;
    if (!user.isSuperadmin && clinicSettings && viewName === 'grooming' && !clinicSettings.groomingEnabled) return false;
    if (!user.isSuperadmin && clinicSettings && viewName === 'boarding' && !clinicSettings.boardingEnabled) return false;
    // Staff operations are deferred from the active beta release. Keep the
    // underlying records and handlers intact without exposing this view.
    if (viewName === 'staff') return false;
    // Executive reporting and system configuration are never staff-floor
    // surfaces, even if a persisted panel matrix was edited incorrectly.
    if (viewName === 'reports' && ['cashier', 'veterinarian', 'groomer'].includes(user.role)) return false;
    if (viewName === 'settings') {
      return user.isSuperadmin === true || canViewSettingsTab(user.role, 'staff', false);
    }
    if (viewName === 'shift' && ['cashier', 'veterinarian', 'groomer'].includes(user.role)) return false;
    // Application roots can open every application panel. Provider-only
    // settings surfaces are checked separately by SystemSettings.
    if (ROOT_ROLES.includes(user.role)) return true;
    if (user.role === 'dummy_admin') return viewName === 'settings';
    if (user.role === 'pet_parent') return viewName === 'portal';
    if (viewName === 'settings') return false;
    const checkedView = viewName;
    // NOTE: this literal is only a fallback — systemConfig.rolePermissions is
    // always populated, so it normally wins. Both must stay in sync; a role
    // missing from EITHER falls through to `|| []` (= zero views).
    const defaultPermissions: Record<string, string[]> = {
      cashier: ['pos', 'appointments', 'pets', 'customers'],
      veterinarian: ['dashboard', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming'],
      manager: ['dashboard', 'pos', 'appointments', 'examinations', 'inventory', 'boarding', 'grooming', 'shift'],
      groomer: ['grooming'],
      admin: ['dashboard', 'reports', 'pos', 'appointments', 'examinations', 'inventory', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
      owner: ['dashboard', 'reports', 'pos', 'appointments', 'inventory', 'invoices', 'reminders', 'portal', 'boarding', 'grooming', 'shift'],
       provider: ['dashboard', 'reports', 'pos', 'appointments', 'pets', 'customers', 'vaccinations', 'examinations', 'laboratory', 'boarding', 'grooming', 'inventory', 'invoices', 'shift', 'reminders', 'portal']
    };
    // HOTFIX-1: the old `as 'cashier'|'veterinarian'|'admin'|'owner'` cast lied to
    // TypeScript — it is why the missing 'manager' key compiled cleanly instead of
    // erroring. Indexing a Record<string, string[]> keeps this honest.
    const rolePerms: Record<string, string[]> = (systemConfig.rolePermissions as any) || defaultPermissions;
    const permissions = rolePerms[user.role] || defaultPermissions[user.role] || [];
    if (checkedView === 'portal') return true;
    // Dashboard is an operational surface for veterinarians even when an older
    // persisted permission matrix omitted it.
    if (user.role === 'veterinarian' && checkedView === 'dashboard') return true;
    return permissions.includes(checkedView);
  };

  const getDefaultViewForUser = (user: any): any => {
    if (!user) return 'portal';
    if (user.role === 'pet_parent') return 'portal';
    const priorityViews = ['dashboard', 'pos', 'appointments', 'examinations', 'inventory'] as const;
    for (const view of priorityViews) {
      if (isViewPermitted(view, user)) return view;
    }
    if (canViewSettingsTab(user.role, 'staff', user.isSuperadmin === true)) return 'settings';
    if (user.role === 'dummy_admin' && isViewPermitted('settings', user)) return 'settings';
    return 'portal';
  };

  const registerFailure = (username: string) => {
    recordFailedAttempt(username);
    setLoginError(true);
    setTimeout(() => setLoginError(false), 2000);
    setEnteredPassword('');
    const l = isLockedOut(username);
    setLockoutSeconds(l.locked ? l.secondsRemaining : 0);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isVerifying) return;

    const email = loginEmail.trim();
    const key = email.toLowerCase();
    if (!email || !enteredPassword) return;
    if (!supabase) { setLoginMessage('Cloud login is not configured on this device.'); return; }

    // Guess limiter — refuse to even attempt while locked out.
    const lock = isLockedOut(key);
    if (lock.locked) { setLockoutSeconds(lock.secondsRemaining); return; }

    setIsVerifying(true);
    setLoginMessage('');
    try {
      // Step 32: Supabase Auth is the ONLY production login. A real authenticated
      // session is required; there is no local/PIN fallback.
      const { data, error } = await signInWithPassword(email, enteredPassword);
      if (error || !data?.user) {
        registerFailure(key);
        setLoginMessage('Incorrect email or password.');
        return;
      }
      // The single auth bootstrap effect owns identity mapping, route changes,
      // and cloud hydration. Do not fetch staff or reload here: both would race
      // the SIGNED_IN event and could render an incomplete tenant state.
      resetAttempts(key);
      setIsBooting(true);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSaveStaffProfile = useCallback(async (profile: StaffProfile) => {
    await upsertStaffProfile(stampRecord(profile));
    setStaffProfiles(prev => {
      const exists = prev.find(p => p.id === profile.id);
      return exists ? prev.map(p => p.id === profile.id ? profile : p)
                    : [...prev, profile];
    });
  }, []);

  const handleDeactivateStaffProfile = useCallback(async (id: string) => {
    const profile = staffProfiles.find(p => p.id === id);
    if (!profile) return;
    const updated = stampRecord({ ...profile, active: false });
    await upsertStaffProfile(updated);
    setStaffProfiles(prev => prev.map(p => p.id === id ? updated : p));
  }, [staffProfiles]);

  const handleSaveTimeEntry = useCallback(async (entry: TimeEntry) => {
    const stamped = stampRecord(entry);
    await upsertTimeEntry(stamped);
    setTimeEntries(prev => {
      const exists = prev.find(t => t.id === stamped.id);
      return exists ? prev.map(t => t.id === stamped.id ? stamped : t)
                    : [...prev, stamped];
    });
  }, []);

  const handleSaveScheduleEntry = useCallback(async (entry: ScheduleEntry) => {
    const stamped = stampRecord(entry);
    await upsertScheduleEntry(stamped);
    setScheduleEntries(prev => {
      const exists = prev.find(t => t.id === stamped.id);
      return exists ? prev.map(t => t.id === stamped.id ? stamped : t)
                    : [...prev, stamped];
    });
  }, []);

  const handleDeleteScheduleEntry = useCallback(async (id: string) => {
    const entry = scheduleEntries.find(e => e.id === id);
    if (!entry) return;
    const stamped = stampRecord({ ...entry, is_deleted: true });
    await upsertScheduleEntry(stamped);
    setScheduleEntries(prev => prev.filter(e => e.id !== id));
  }, [scheduleEntries]);

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
    { id: 'suppliers', label: 'Suppliers', icon: Truck, isLive: true },
    { id: 'invoices', label: 'Invoices', icon: FileText, isLive: true }, // ACTIVATED
    { id: 'shift', label: 'Shift & Drawer', icon: Lock, isLive: true },
    { id: 'reports', label: 'Reports', icon: BarChart3, isLive: true }
  ];
  const visibleTenantNavItems = navItems.filter(item =>
    isViewPermitted(item.id, currentUser)
  );
  const effectiveSystemConfig = clinicSettings?.taxEnabled === false
    ? { ...systemConfig, taxRate: 0 }
    : systemConfig;

  const renderCanvas = () => {
    if (currentUser && !isViewPermitted(activeView, currentUser)) return null;
    switch (activeView) {
      case 'pos': {
          const safeSystemConfig = effectiveSystemConfig;
        return (
          <POSRegister
            inventory={inventory} 
            appointments={appointments}
            records={records}
            patientRecords={pets}
            clients={clients}
            clinicQueue={clinicQueue}
            currentUser={currentUser} invoices={invoices} onUpdateStock={handleUpdateStock}
            onAddInvoice={handleAddInvoice} onVoidInvoice={handleVoidInvoice} systemConfig={safeSystemConfig}
             onTriggerInventorySync={async () => { }}
            activeShift={activeShift} activeShiftId={activeShift?.id} incomingClient={viewPayload?.client ? { phone: viewPayload.client.primary_phone || '', name: viewPayload.client.full_name || '', id: viewPayload.client.client_id || '' } : null}
            onUpdateRecord={handleUpdateRecord}
            onAtomicCheckout={handleAtomicCheckout}
             onNavigateToShift={() => { if (isViewPermitted('shift', currentUser)) { setActiveView('shift'); setHistoryStack(prev => [...prev, 'shift']); } }}
          />
        );
      }
       case 'appointments': return <AppointmentsManager appointments={appointments} records={records} clinicQueue={clinicQueue} users={users} onAddAppointment={handleAddAppointment} onUpdateStatus={handleUpdateAppointmentStatus} onAddRecord={handleAddRecord} onUpdateAppointment={handleUpdateAppointment} onUpdateClient={handleUpdateClient} onUpdatePet={handleUpdatePet} preFilledClient={viewPayload?.client} preFilledPet={viewPayload?.pet} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} />;
       case 'boarding': return <BoardingManager systemConfig={systemConfig} clients={clients} pets={pets} records={records} clinicQueue={clinicQueue} inventory={inventory} onUpdateStock={handleUpdateStock} onUpdateRecord={handleUpdateRecord} activeShift={activeShift} currentUser={currentUser} onChangeConfig={async (config) => { await saveSystemConfig(config, currentUser as User); setSystemConfig(config); }} />;
       case 'grooming': return <GroomingManager clients={clients} pets={pets} records={records} inventory={inventory} clinicQueue={clinicQueue} onUpdateRecord={handleUpdateRecord} onUpdateInventory={handleUpdateInventoryItem} systemConfig={systemConfig} />;
      case 'inventory': return <InventoryManager inventory={inventory} onAddProduct={handleAddProduct} onUpdateStock={handleUpdateStock} onUpdatePrice={handleUpdatePrice} onUpdateInventory={handleUpdateInventoryItem} onDeleteInventory={handleDeleteInventoryItem} systemConfig={systemConfig} />;
      case 'suppliers': return <SuppliersManager currentUser={currentUser} />;
      case 'invoices': return <InvoicesManager invoices={invoices} onVoidInvoice={handleVoidInvoice} systemConfig={systemConfig} />;
        case 'shift': return <ShiftManager invoices={invoices} currentUser={currentUser as User} activeShift={activeShift} setActiveShift={async (s) => { setActiveShift(s); }} />;
      case 'dashboard':
        // FIX 8: Pass activeShift and onNavigate props
         return <DashboardAnalytics invoices={invoices} appointments={appointments} records={records} inventory={inventory} clinicQueue={clinicQueue} scheduleEntries={scheduleEntries} timeEntries={timeEntries} staffProfiles={staffProfiles} showFinancials={currentUser?.role !== 'veterinarian'} onNavigate={(tab) => { setActiveView(tab); setHistoryStack([tab]); }} />;
      case 'reports':
          return <ReportsManager />;
      case 'staff': 
          return <StaffManager staffProfiles={staffProfiles} users={users} currentUser={currentUser as User} timeEntries={timeEntries} onSaveTimeEntry={handleSaveTimeEntry} scheduleEntries={scheduleEntries} onSaveScheduleEntry={handleSaveScheduleEntry} onDeleteScheduleEntry={handleDeleteScheduleEntry} onSaveProfile={handleSaveStaffProfile} onDeactivateProfile={handleDeactivateStaffProfile} onSaveUser={async (user) => { if (!assertIssuableRole(user.role)) return; await upsertUser(user); setUsers(await fetchUsers()); }} />;
       case 'examinations': return <MedicalRecordsManager clients={clients} pets={pets} clinicQueue={clinicQueue} records={records} boardingRecords={boardingRecords} inventory={inventory as any} appointments={appointments} systemConfig={systemConfig} viewPayload={viewPayload} onUpdateRecord={handleUpdateRecord} onAddRecord={handleAddRecord} onCompleteVisit={closeVisit} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'settings': {
         const safeSystemConfig = systemConfig;
        return (
          <SystemSettings
            config={safeSystemConfig}
             onChangeConfig={async (config) => {
               if (!currentUser?.isSuperadmin) {
                 showToast('Only the Super Admin can update global configuration.', 'error');
                 return;
               }
                // Merge the edited cloud settings onto the current config so fields
               // not visible in the active settings tab are preserved.
              const merged = { ...systemConfig, ...config } as SystemConfig;
               await saveSystemConfig(merged, currentUser as User);
               setSystemConfig(merged);
            }}
             users={users}
            onRefreshUsers={async () => { setUsers(await fetchUsers()); }}
            onAddUser={async (user) => {
               // Staff metadata is stored in Supabase. Passwords belong exclusively
               // to Supabase Auth and are never written to public.users.
               if (!assertIssuableRole(user.role)) return; // AUTH-6 guard
               try {
                 await upsertUser(user);
               } catch (e: any) {
                showToast(`Failed to add user: ${e.message}`, 'error');
                return;
               }
               setUsers(await fetchUsers());
               showToast(`Staff record ${user.name} added. Link its Supabase Auth identity before sign-in.`);
            }}
            onRemoveUser={async (id) => {
              try {
                await deleteUser(id);
              } catch (e: any) {
                showToast(`Failed to remove user: ${e.message}`, 'error');
                return;
              }
              setUsers(await fetchUsers());
            }}
            inventory={inventory}
            invoices={invoices}
            currentUser={currentUser}
            onUpdateInventory={handleUpdateInventoryItem}
            onDeleteInventory={handleDeleteInventoryItem}
            onRestoreSnapshot={async () => true}
            onChangePassword={async (target: any, newPassword: string) => {
               if (!newPassword || newPassword.length < 12) {
                 showToast('New password must be at least 12 characters.', 'error');
                 return;
               }
               const isCurrentAccount = target?.id === currentUser?.id
                 || (currentUser?.role === 'provider' && target?.id === 'ashpoint_owner');
               if (!currentUser || !isCurrentAccount) {
                 throw new Error('Only the currently signed-in user may change a password. Manage other Auth users in Supabase.');
               }
               const { error } = await requireSupabase().auth.updateUser({ password: newPassword });
               if (error) throw error;
            }}
            autoOpenProviderPassword={autoOpenProviderPw}
            onAutoOpenHandled={() => setAutoOpenProviderPw(false)}
          />
        );
      }
      case 'pets': return <PatientPortal clients={clients} pets={pets} records={records} appointments={appointments} clinicQueue={clinicQueue} onBookAppointment={handleAddAppointment} systemConfig={systemConfig} viewPayload={viewPayload} onAddRecord={handleAddRecord} onGoToCustomers={(phone) => { setViewPayload({ selectedPhone: phone }); setActiveView('customers'); setHistoryStack(prev => [...prev, 'customers']); }} onGoToAppointments={(client, pet) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onUpdatePet={handleUpdatePet} onUpdateRecordsBulk={handleBulkUpdateRecords} />;
      case 'vaccinations': return <VaccinationsManager clients={clients} pets={pets} clinicQueue={clinicQueue} records={records} inventory={inventory} onUpdateRecord={handleUpdateRecord} onUpdateStock={handleUpdateStock} />;
      // FIX 8: Pass appointments prop to Lab
      case 'laboratory': return <LaboratoryManager clients={clients} pets={pets} records={records} inventory={inventory as any} appointments={appointments} clinicQueue={clinicQueue} onUpdateRecord={handleUpdateRecord} onAddRecord={handleAddRecord} />;
       case 'customers': return <CustomersManager currentUser={currentUser} clients={clients} pets={pets} records={records} invoices={invoices} appointments={appointments} clinicQueue={clinicQueue} onGoToPOS={(client) => { setViewPayload({ client }); setActiveView('pos'); setHistoryStack(prev => [...prev, 'pos']); }} onGoToAppointments={(client, pet?) => { setViewPayload({ client, pet }); setActiveView('appointments'); setHistoryStack(prev => [...prev, 'appointments']); }} onGoToRecords={(patientId) => { setActiveView('examinations'); setHistoryStack(prev => [...prev, 'examinations']); }} onUpdateCustomer={handleUpdateCustomer} onUpdateClient={handleUpdateClient} onUpdatePet={handleUpdatePet} onGenerateConsent={(clientName, petName) => setConsentPayload({ clientName, petName })} onAddRecord={handleAddRecord} onUpdateRecordsBulk={handleBulkUpdateRecords} onDeleteClient={handleDeleteClient} onDeletePet={handleDeletePet} />;
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
           <h1 className="text-2xl font-black text-amber-400 uppercase tracking-widest">Cloud Data Unavailable</h1>
           <p className="text-slate-300 font-bold text-sm leading-relaxed">
             The application could not load its cloud data, so it has stopped instead of showing incomplete records.
           </p>
           <p className="text-slate-400 font-bold text-xs leading-relaxed">
             Check the connection and Supabase configuration, then try again. No local copy is used.
           </p>
           <button
             onClick={() => window.location.reload()}
            className="w-full py-4 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-lg transition-all cursor-pointer"
          >
             Retry Cloud Connection
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

  if (routePath === '/superadmin' && currentUser?.isSuperadmin) {
    return (
      <SuperAdminLayout
        currentUser={currentUser}
        onSignOut={async () => {
          authRequestRef.current += 1;
          flushSync(() => {
            setCurrentUser(null);
            setCurrentClinicId(null);
          });
          await signOut();
          setCurrentUser(null);
          navigateRoute('/');
        }}
      />
    );
  }

  if ((routePath === '/superadmin' && currentUser && !currentUser.isSuperadmin)
    || (routePath !== '/superadmin' && currentUser?.isSuperadmin)) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-sm font-black text-white">Checking route access...</div>;
  }

  return (
    <>
      <div className="h-screen max-h-screen overflow-hidden bg-slate-50 flex flex-col font-sans relative antialiased leading-none text-xs text-slate-800 print:hidden">
        {!currentUser ? (
          <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-md overflow-y-auto flex items-start md:items-center justify-center p-4">
            <div className="my-4 md:my-8 bg-white rounded-3xl border border-sky-100 max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 overflow-hidden shadow-2xl animate-fade-in text-xs">
              <div className="p-6 md:p-8 bg-sky-600 text-white flex flex-col justify-between space-y-8 relative overflow-hidden">
                <div className="relative z-10 font-sans flex flex-col h-full justify-between">
                  <div className="space-y-6">
                    <span className="px-3 py-1 bg-white/20 text-white font-bold rounded-full text-[10px] uppercase tracking-wider flex items-center gap-1.5 w-max">
                      <span className="text-sm select-none leading-none">{systemConfig.invoiceLogo}</span> {systemConfig.appName} Core Medical Suite
                    </span>
                    <div className="bg-white/10 p-6 rounded-2xl backdrop-blur-sm border border-white/25 shadow-inner inline-flex flex-col items-center gap-3">
                      <img src="/ceylon-logo-512.png" alt="Ceylon Pets Animal Hospital" className="h-16 w-16 rounded-2xl object-contain bg-white p-1 shadow-lg" />
                      <div className="text-center">
                        <p className="text-white font-black text-xs uppercase tracking-widest">Ceylon Pets Animal Hospital</p>
                        <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">Clinical Operations Platform</p>
                      </div>
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
              <div className="p-6 md:p-8 flex flex-col justify-center gap-8 font-sans">
                <div className="space-y-4">
                  {idleMessage && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-xl text-xs font-bold animate-fade-in flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      {idleMessage}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-black text-slate-800">Secure Clinician Sign-In</h3>
                    <p className="text-slate-400 mt-1">Sign in with your staff email and password. Access is granted only to linked staff accounts.</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <form onSubmit={handleLoginSubmit} className="space-y-3">
                    <div className="space-y-1">
                      <label htmlFor="login-email" className="font-bold text-slate-700 block text-[10px]">Staff Email</label>
                      <input
                        id="login-email"
                        data-testid="input-email"
                        name="email"
                        type="email"
                        autoComplete="username"
                        placeholder="you@clinic.example"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        disabled={isVerifying || lockoutSeconds > 0}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-xs font-bold text-slate-700 disabled:opacity-60"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between items-center">
                        <label htmlFor="login-password" className="font-bold text-slate-700 block text-[10px]">Password</label>
                        {(loginError || loginMessage) && <span data-testid="login-error" className="text-[10px] text-rose-600 font-bold animate-pulse">{loginMessage || 'Incorrect email or password.'}</span>}
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <input
                            id="login-password"
                            data-testid="input-password"
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            inputMode="text"
                            placeholder="Password"
                            value={enteredPassword}
                            onChange={(e) => setEnteredPassword(e.target.value)}
                            disabled={isVerifying || lockoutSeconds > 0}
                            className="w-full py-2.5 pl-3 pr-10 bg-slate-50 border border-slate-200 font-mono font-bold text-sm rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-60 text-left tracking-normal"
                            required
                          />
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
                        </div>
                        <button
                          type="submit"
                          data-testid="btn-signin"
                          disabled={isVerifying || lockoutSeconds > 0}
                          className="w-full sm:w-auto px-5 py-2.5 bg-slate-800 hover:bg-slate-900 font-bold text-white rounded-xl transition-all font-mono disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[76px]"
                        >
                          {isVerifying ? <span data-testid="login-spinner" className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Sign In'}
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
          <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
            <aside className={`w-64 bg-white border-r border-slate-200 flex flex-col flex-shrink-0 z-30 shadow-sm fixed md:relative inset-y-0 left-0 transform transition-transform duration-200 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
              <div className="h-16 flex items-center px-6 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 p-1.5 rounded-xl shadow-sm"><PawPrint className="w-5 h-5 text-white" /></div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-lg font-bold leading-none tracking-tight">{systemConfig.appName || 'CeylonPets'}</h1>
                      <span className="text-[8px] font-black uppercase tracking-widest text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">Beta</span>
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{systemConfig.resellerName || 'Ash Point'}</p>
                  </div>
                </div>
              </div>
              <nav className="flex-1 overflow-y-auto p-3 space-y-1">
                 {visibleTenantNavItems.map((item) => {
                  const Icon = item.icon;
                  if (!item.isLive) return <a key={item.id} data-testid={`nav-${item.id}`} href="#" onClick={(e) => e.preventDefault()} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:bg-slate-50 transition-colors opacity-80 cursor-default"><Icon className="w-5 h-5" />{item.label}</a>;
                  const permissionKey = item.id;
                  if (!isViewPermitted(permissionKey, currentUser)) return null;
                  const isSelected = activeView === item.id;
                  return (
                    <button key={item.id} data-testid={`nav-${item.id}`} onClick={() => { rememberActiveView(item.id); setActiveView(item.id); setViewPayload(null); setHistoryStack([item.id]); }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                      <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />{item.label}
                    </button>
                  );
                })}
              </nav>
              <div className="p-4 border-t border-slate-100 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800 text-xs truncate leading-tight">{currentUser.name}</span>
                  <span className="block text-[10px] text-slate-400 capitalize font-bold mt-0.5 truncate">{currentUser.role} console</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${SYNC_ENABLED && isOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${SYNC_ENABLED && isOnline ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {!isOnline ? 'Offline' : SYNC_ENABLED ? 'Cloud Sync Active' : 'Offline'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 bg-slate-50/50 space-y-1">
                {isViewPermitted('settings', currentUser) && (
                  <button
                    data-testid="nav-settings"
                    onClick={() => { setActiveView('settings'); setHistoryStack(['settings']); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${activeView === 'settings'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                  >
                    <Settings className={`w-5 h-5 ${activeView === 'settings' ? 'text-indigo-600' : 'text-slate-500'}`} />
                    Settings
                  </button>
                )}
                <button
                  onClick={async () => {
                    // Switching users ends the Supabase Auth session so the next
                    // person must sign in with their own credentials.
                    authRequestRef.current += 1;
                    flushSync(() => {
                      setCurrentUser(null);
                      setCurrentClinicId(null);
                    });
                    await signOut();
                    forgetActiveView();
                    setCurrentUser(null);
                    setLoginEmail('');
                    setEnteredPassword('');
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
                  onClick={async () => {
                    authRequestRef.current += 1;
                    flushSync(() => {
                      setCurrentUser(null);
                      setCurrentClinicId(null);
                    });
                    await signOut();
                    forgetActiveView();
                    setCurrentUser(null);
                    setLoginEmail('');
                    setEnteredPassword('');
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

            {sidebarOpen && (
              <div
                className="fixed inset-0 bg-black/30 z-20 md:hidden"
                onClick={() => setSidebarOpen(false)}
              />
            )}

            {/* MAIN CANVAS */}
            <main className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-100">
              <div className="bg-white border-b border-slate-200 h-14 flex items-center px-6 gap-4 shrink-0 shadow-xs justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    aria-label="Open navigation"
                    className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100"
                  >
                    <Menu className="w-5 h-5" />
                  </button>
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
                  <span className="text-xs font-bold text-slate-500">{navItems.find(item => item.id === activeView)?.label || activeView}</span>
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
              if (import.meta.env.DEV) console.log(`Simulated sending notification ${id}`);
              showToast('Notification dispatched to queue.', 'success');
            }}
          />
        </Modal>
      </div>
    </>
  );
}

export default function AppWrapper(props: AppProps) {
  return <App {...props} />;
}
