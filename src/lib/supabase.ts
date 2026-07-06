/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase Client Configuration
 * ---------------------------------------------------------------
 * When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are present,
 * a real Supabase client is created and SYNC_ENABLED = true.
 * Otherwise the client is null and sync is completely dormant.
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

const syncSecret = import.meta.env.VITE_SUPABASE_SYNC_SECRET as string | undefined;

export const supabase: SupabaseClient | null = hasValidConfig
  ? createClient(url!, key!, {
      global: {
        headers: {
          // RLS policies check this header to authorize write operations
          ...(syncSecret ? { 'x-sync-secret': syncSecret } : {}),
        },
      },
    })
  : null;

if (!SYNC_ENABLED) {
  console.info('[Supabase] No credentials detected — cloud sync is dormant.');
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
  USERS:         'staff_users',
  SYSTEM_CONFIG: 'system_config',
} as const;

// ---------------------------------------------------------------------------
// Image upload helper
// ---------------------------------------------------------------------------

/**
 * Uploads a file. In this isolated offline mode, it converts the file to base64
 * so it can be rendered from localStorage instantly without a real bucket.
 */
export async function uploadImageToStorage(file: File, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      resolve(e.target?.result as string);
    };
    reader.onerror = (e) => {
      reject(new Error('Failed to read local file into base64'));
    };
    reader.readAsDataURL(file);
  });
}
