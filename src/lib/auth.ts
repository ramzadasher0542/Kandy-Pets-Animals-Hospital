import { User } from '../types';
import { SystemConfig } from '../components/SystemSettings';
import { db } from './localDb';

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
    posLogoUrl: '',
    taxRate: 0.0825,
    currencySymbol: 'Rs. ',
    masterPin: 'e4f165a2',
    selectedReceiptPrinter: '',
    selectedReportPrinter: '',
    receiptPaperSize: '58mm',
    connectionType: 'usb',
    autoPrintReceipt: true,
    localAutosaveInterval: 15,
    cloudEndpoint: '',
    cloudBackupSchedule: 'manual',
    cloudBackupEnabled: false,
    emailDigestEnabled: false,
    recipientEmails: [],
    digestSchedule: 'daily_end',
    rolePermissions: {
      cashier: [],
      veterinarian: [],
      admin: [],
      owner: []
    }
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
