/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Supabase Client Configuration (MOCKED)
 * ---------------------------------------------------------------
 * Isolated local development mode. Cloud sync disabled completely.
 */
/// <reference types="vite/client" />

// Suppress expected console warnings from db.ts and auth.ts falling back to cache
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    args.length >= 2 &&
    typeof args[0] === 'string' &&
    args[0].includes('[CeylonPets]') &&
    args[1]?.message === 'Offline mode'
  ) {
    return;
  }
  originalWarn(...args);
};

// Provide a robust mock offline client that absorbs chained calls
const mockPromise = Promise.resolve({ data: null, error: { message: 'Offline mode' } });
const createMockChain = () => {
  const chain: any = new Proxy(function() {}, {
    get: function(target, prop) {
      if (prop === 'then') return mockPromise.then.bind(mockPromise);
      if (prop === 'catch') return mockPromise.catch.bind(mockPromise);
      if (prop === 'finally') return mockPromise.finally.bind(mockPromise);
      return chain;
    },
    apply: function() {
      return chain;
    }
  });
  return chain;
};

export const supabase = {
  from: () => createMockChain(),
  channel: () => ({
    on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) })
  }),
  storage: {
    from: () => ({
      upload: () => Promise.resolve({ data: null, error: { message: 'Offline mode' } }),
      getPublicUrl: () => ({ data: { publicUrl: '' } })
    })
  }
} as any;

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------
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
