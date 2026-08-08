import { User } from '../types';
import { SystemConfig } from '../components/SystemSettings';
import { db } from './localDb';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// Supabase Auth (Phase C1)
// ---------------------------------------------------------------------------

/** The current Supabase Auth user, or null when unauthenticated/unconfigured. */
export async function getSupabaseUser() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

/** True when there is an active Supabase Auth session. */
export async function isSupabaseAuthenticated(): Promise<boolean> {
  return (await getSupabaseUser()) !== null;
}

export async function fetchStaffRegistry(): Promise<User[]> {
  const users: User[] = [];
  try {
    await db.users.iterate((value: User) => {
      if (value && !Array.isArray(value)) users.push(value);
    });
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[CeylonPets POS] Corrupted storage payload encountered during user registry parse:', err);
    }
  }
  return users;
}

export async function fetchSystemConfig(): Promise<SystemConfig> {
  try {
    const config = await db.system.getItem<SystemConfig>('config');
    if (config && typeof config === 'object') return config;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.error('[CeylonPets POS] Corrupted storage payload encountered during config parse:', err);
    }
  }
  
  // Immutable constitutional fallback state to guarantee runtime continuity
  return {
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
    masterPin: '',
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
      cashier: [],
      veterinarian: [],
      manager: [],
      owner: [],
      admin: [],
      groomer: [],
      provider: []
    },
    boardingRates: {
      catNofoodCents: 100000,
      catWithfoodCents: 190000,
      dogNofoodCents: 180000,
      dogWithfoodCents: 260000,
      catLitterCents: 30000,
      dogLitterCents: 40000,
      milkCupCents: 10000,
    },
    defaultDepositCents: 1500000,
  };
}

export async function fetchStaffUsers(): Promise<User[]> {
  return await fetchStaffRegistry();
}

export async function upsertStaffUser(user: User, currentUser: User): Promise<void> {
  if (currentUser.role !== 'admin' && currentUser.role !== 'owner') {
    throw new Error('Unauthorized: Only administrators can modify staff records.');
  }
  if (!user || !user.id) return;
  await db.users.setItem(user.id, user);
}

export async function deleteStaffUser(userId: string, currentUser: User): Promise<void> {
  if (currentUser.role !== 'admin' && currentUser.role !== 'owner') {
    throw new Error('Unauthorized: Only administrators can delete staff records.');
  }
  if (!userId) return;
  await db.users.removeItem(userId);
}

// Deprecated async wrapper - no longer needed since fetchSystemConfig provides synchronous immutable fallbacks

export async function upsertSystemConfig(config: SystemConfig, currentUser: User): Promise<void> {
  if (currentUser.role !== 'admin' && currentUser.role !== 'owner') {
    throw new Error('Unauthorized: Only administrators can update global configuration.');
  }
  await db.system.setItem('config', config);
}

// ---------------------------------------------------------------------------
// Step 32 — Supabase Auth identity → staff mapping (free-tier login)
// ---------------------------------------------------------------------------

/**
 * Resolve the signed-in Supabase Auth identity to its staff record via
 * public.users.auth_user_id. This is the ONLY authoritative link between an
 * Auth session and app role — never a PIN, sync header, or client-supplied
 * role. The PIN column is column-locked at the DB (see 20260808_free_auth_rls)
 * and is deliberately NOT selected here.
 *
 * Returns null when unconfigured, unauthenticated, or when the identity is not
 * yet linked to an active staff row (OWNER ACTION REQUIRED: set users.auth_user_id
 * for the real staff Auth account). A null result must be treated as "no access".
 */
export async function fetchStaffForAuthUser(authUserId: string | null | undefined): Promise<User | null> {
  if (!supabase || !authUserId) return null;
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, role, avatar_color, active, is_deleted, auth_user_id')
    .eq('auth_user_id', authUserId)
    .eq('active', true)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as User;
}
