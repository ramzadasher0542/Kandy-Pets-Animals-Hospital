/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase Client Configuration
 * ---------------------------------------------------------------
 * The application is cloud-only. A missing configuration is a deployment
 * error, never a reason to fall back to a local data store.
 */
/// <reference types="vite/client" />

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const hasValidConfig =
  typeof url === 'string' && url.length > 0 &&
  typeof key === 'string' && key.length > 0;

// ---------------------------------------------------------------------------
// Client & flag exports
// ---------------------------------------------------------------------------
export const SYNC_ENABLED: boolean = hasValidConfig;

export const supabase: SupabaseClient | null = hasValidConfig
  ? createClient(url!, key!)
  : null;

export class CloudConfigurationError extends Error {
  constructor(message = 'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.') {
    super(message);
    this.name = 'CloudConfigurationError';
  }
}

/** Return the configured cloud client or fail closed. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new CloudConfigurationError();
  return supabase;
}

// ---------------------------------------------------------------------------
// Auth helpers — Supabase Auth is the only login and session authority.
// ---------------------------------------------------------------------------

/** Sign in against Supabase Auth. Returns a null-user result when unconfigured. */
export async function signInWithPassword(email: string, password: string) {
  return requireSupabase().auth.signInWithPassword({ email, password });
}

/** Sign out of the Supabase Auth session. */
export async function signOut() {
  await requireSupabase().auth.signOut();
}

/** The current Auth session (for restore-on-load). */
export async function getAuthSession() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

/**
 * Subscribe to Supabase Auth state changes (SIGNED_IN / SIGNED_OUT / token
 * refresh). App uses this to hydrate/clear the current staff user.
 */
export function onAuthStateChange(
  cb: (event: string, session: import('@supabase/supabase-js').Session | null) => void
): () => void {
  const { data } = requireSupabase().auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DB_TABLES = {
  INVENTORY:     'inventory',
  APPOINTMENTS:  'appointments',
  RECORDS:       'medical_records',
  INVOICES:      'invoices',
  NOTIFICATIONS: 'notifications',
  ALERTS:        'system_alerts',
  USERS:         'users',
  SYSTEM_CONFIG: 'system_config',
  STAFF_PROFILES: 'staff_profiles',
  TIME_ENTRIES: 'time_entries',
  SCHEDULE_ENTRIES: 'schedule_entries',
  PAYSLIPS: 'payslips',
  DELETION_AUDIT: 'deletion_audit',
  AUTH_AUDIT: 'auth_audit',
} as const;

// ---------------------------------------------------------------------------
// Image upload helper
// ---------------------------------------------------------------------------

/**
 * Upload media to the configured Supabase Storage bucket. The bucket must be
 * provisioned by an administrator; data is never stored in browser storage.
 */
export async function uploadImageToStorage(file: File, path: string): Promise<string> {
  if (!file || file.size === 0) throw new Error('Cannot upload an empty file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Image must be 5 MB or smaller.');
  if (!file.type.startsWith('image/')) throw new Error('Only image files are supported.');

  const client = requireSupabase();
  const { error } = await client.storage.from('clinic-assets').upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) throw error;

  const { data } = client.storage.from('clinic-assets').getPublicUrl(path);
  return data.publicUrl;
}
