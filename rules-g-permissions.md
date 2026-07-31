\# Phase G: Staff Permissions → Supabase

\# Mission: Make permission toggles survive across devices



\## ASSUMPTION

The `system\_config` table has already been created in Supabase with the

exact schema provided by the user.



\## FILE 1: src/lib/db.ts



\### ADD import

Add to the existing imports from '../types':

```typescript

import { SystemConfig } from '../components/SystemSettings';

ADD functions (append to db.ts, after the existing boarding records section)

TypeScript

// ==========================================

// SYSTEM CONFIG (SUPABASE — cross-device permissions)

// ==========================================



export async function fetchSystemConfig(): Promise<SystemConfig | null> {

&#x20; if (!supabase) return null;

&#x20; const { data, error } = await supabase

&#x20;   .from('system\_config')

&#x20;   .select('\*')

&#x20;   .eq('id', 'global')

&#x20;   .maybeSingle();

&#x20; if (error) {

&#x20;   console.error('\[DB] fetchSystemConfig error:', error.message);

&#x20;   return null;

&#x20; }

&#x20; if (!data) return null;



&#x20; return {

&#x20;   appName: data.app\_name || '',

&#x20;   resellerName: data.reseller\_name || '',

&#x20;   hospitalName: data.hospital\_name || '',

&#x20;   hospitalAddress: data.hospital\_address || '',

&#x20;   hospitalPhone: data.hospital\_phone || '',

&#x20;   hospitalEmail: data.hospital\_email || '',

&#x20;   invoiceLogo: data.invoice\_logo || '',

&#x20;   invoiceFooterMessage: data.invoice\_footer\_message || '',

&#x20;   invoiceSubFooterMessage: data.invoice\_sub\_footer\_message || '',

&#x20;   invoiceExtraFooterMessage: data.invoice\_extra\_footer\_message || '',

&#x20;   taxRate: Number(data.tax\_rate) || 0,

&#x20;   currencySymbol: data.currency\_symbol || 'Rs. ',

&#x20;   selectedReceiptPrinter: data.selected\_receipt\_printer || '',

&#x20;   selectedReportPrinter: data.selected\_report\_printer || '',

&#x20;   receiptPaperSize: data.receipt\_paper\_size || '58mm',

&#x20;   connectionType: data.connection\_type || 'usb',

&#x20;   localAutosaveInterval: Number(data.local\_autosave\_interval) || 15,

&#x20;   cloudEndpoint: data.cloud\_endpoint || '',

&#x20;   cloudBackupEnabled: data.cloud\_backup\_enabled || false,

&#x20;   emailDigestEnabled: data.email\_digest\_enabled || false,

&#x20;   recipientEmails: data.recipient\_emails || \[],

&#x20;   digestSchedule: data.digest\_schedule || 'daily\_end',

&#x20;   rolePermissions: data.role\_permissions || {},

&#x20;   masterPin: data.master\_pin || '',

&#x20;   actionPolicies: data.action\_policies || {},

&#x20;   emailjsServiceId: data.emailjs\_service\_id || '',

&#x20;   emailjsTemplateId: data.emailjs\_template\_id || '',

&#x20;   emailjsPublicKey: data.emailjs\_public\_key || '',

&#x20;   boardingRates: data.boarding\_rates || {},

&#x20;   defaultDepositCents: Number(data.default\_deposit\_cents) || 0,

&#x20;   dummyAdminPin: data.dummy\_admin\_pin || '',

&#x20;   idleLogoutMinutes: data.idle\_logout\_minutes ?? 15,

&#x20; } as SystemConfig;

}



export async function upsertSystemConfig(config: SystemConfig): Promise<void> {

&#x20; if (!supabase) throw new Error('No internet connection');

&#x20; const payload = {

&#x20;   id: 'global',

&#x20;   app\_name: config.appName,

&#x20;   reseller\_name: config.resellerName,

&#x20;   hospital\_name: config.hospitalName,

&#x20;   hospital\_address: config.hospitalAddress,

&#x20;   hospital\_phone: config.hospitalPhone,

&#x20;   hospital\_email: config.hospitalEmail,

&#x20;   invoice\_logo: config.invoiceLogo,

&#x20;   invoice\_footer\_message: config.invoiceFooterMessage,

&#x20;   invoice\_sub\_footer\_message: config.invoiceSubFooterMessage,

&#x20;   invoice\_extra\_footer\_message: config.invoiceExtraFooterMessage,

&#x20;   tax\_rate: config.taxRate,

&#x20;   currency\_symbol: config.currencySymbol,

&#x20;   selected\_receipt\_printer: config.selectedReceiptPrinter,

&#x20;   selected\_report\_printer: config.selectedReportPrinter,

&#x20;   receipt\_paper\_size: config.receiptPaperSize,

&#x20;   connection\_type: config.connectionType,

&#x20;   local\_autosave\_interval: config.localAutosaveInterval,

&#x20;   cloud\_endpoint: config.cloudEndpoint,

&#x20;   cloud\_backup\_enabled: config.cloudBackupEnabled,

&#x20;   email\_digest\_enabled: config.emailDigestEnabled,

&#x20;   recipient\_emails: config.recipientEmails,

&#x20;   digest\_schedule: config.digestSchedule,

&#x20;   role\_permissions: config.rolePermissions,

&#x20;   master\_pin: config.masterPin,

&#x20;   action\_policies: config.actionPolicies,

&#x20;   emailjs\_service\_id: config.emailjsServiceId,

&#x20;   emailjs\_template\_id: config.emailjsTemplateId,

&#x20;   emailjs\_public\_key: config.emailjsPublicKey,

&#x20;   boarding\_rates: config.boardingRates,

&#x20;   default\_deposit\_cents: config.defaultDepositCents,

&#x20;   dummy\_admin\_pin: config.dummyAdminPin,

&#x20;   idle\_logout\_minutes: config.idleLogoutMinutes,

&#x20; };

&#x20; const { error } = await supabase.from('system\_config').upsert(payload);

&#x20; if (error) throw new Error(`CLOUD\_SAVE\_FAILED: ${error.message}`);

}

FILE 2: src/App.tsx

UPDATE import from './lib/db'

Find the existing import line that imports functions from ./lib/db (e.g.

fetchAppointments, fetchTodaysRecords, etc.). Add to it:

TypeScript

fetchSystemConfig,

upsertSystemConfig,

UPDATE boot config load

Find this exact line in the boot useEffect:

TypeScript

const hConfig = await db.system.getItem('config');

Replace it with:

TypeScript

const hConfig = (await fetchSystemConfig()) || (await db.system.getItem('config'));

UPDATE onChangeConfig handler

Find the onChangeConfig prop passed to <SystemSettings>. Inside it, find:

TypeScript

await db.system.setItem('config', merged);

Replace that single line with:

TypeScript

await upsertSystemConfig(merged);

await db.system.setItem('config', merged); // local mirror for offline fallback

CONSTRAINTS

Do NOT change SystemSettings.tsx (toggleMatrix/togglePanel are already correct)

Do NOT change the auth.ts functions (leave them as local fallbacks)

Do NOT remove the local IndexedDB write — keep it as offline mirror

Do NOT change the config merge/backfill logic at all

Run npx tsc --noEmit

