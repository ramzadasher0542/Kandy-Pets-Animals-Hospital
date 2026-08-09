import { test as base, expect } from '@playwright/test';

/**
 * FIX-1 / Step 36 — Per-test IndexedDB isolation + a PostgREST-over-IndexedDB bridge.
 *
 * The app is Supabase-first: every read (fetchAppointments/Inventory/Pets/Clients/
 * ClinicQueue/…) and write goes through supabase-js -> /rest/v1/. Earlier the
 * fixture fulfilled all /rest/v1/ with an empty [], so IndexedDB seeds a test
 * wrote never reached React state (this is why cv1 Test A's queue never rendered).
 *
 * The bridge below installs an in-page fetch() shim (before any app code) that
 * answers /rest/v1/ from the app's OWN localforage stores (window._db, whose
 * storeName === the Postgres table name). GET reads the store (with basic
 * eq/neq/is filtering), POST/PATCH/DELETE mutate it, and the checkout RPC is
 * emulated with the same effects the real SQL function has (insert invoice,
 * complete the appointment, decrement stock). This makes the seeds visible and
 * lets real app logic run — without touching any live Supabase project.
 */
const PRESERVE = ['system', 'users'];
const APP_URL = 'http://localhost:3000/';

/**
 * TEST-ONLY staff identity. Production login is Supabase Auth email/password only
 * (Step 32). App has a DEV-only branch reading window.__KP_TEST_AUTH__, guarded by
 * import.meta.env.DEV and stripped from production builds. Role 'provider' is root.
 */
const TEST_AUTH_USER = {
  id: 'kpah_test_provider',
  name: 'KPAH Test Provider',
  username: 'kpah_test_provider',
  role: 'provider',
  avatarColor: 'bg-indigo-600 text-white border-indigo-700',
  active: true,
};

// This function is serialised into the page via addInitScript. It must be fully
// self-contained (no external references).
function installRestBridge() {
  const PK: Record<string, string> = { clients: 'client_id' }; // default 'id'
  const origFetch = window.fetch.bind(window);

  function storeFor(table: string): any {
    const db = (window as any)._db;
    if (!db) return null;
    for (const k of Object.keys(db)) {
      const inst = db[k];
      try {
        const cfg = inst && typeof inst.config === 'function' ? inst.config() : null;
        if (cfg && cfg.storeName === table) return inst;
      } catch { /* ignore */ }
    }
    return null;
  }
  async function readAll(store: any): Promise<any[]> {
    const rows: any[] = [];
    await store.iterate((v: any) => { if (v && !Array.isArray(v)) rows.push(v); });
    return rows;
  }
  function coerce(v: string): any {
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    return v;
  }
  // PostgREST filters: col=eq.x, col=neq.x, col=is.false, col=in.(a,b)
  function makeFilter(params: URLSearchParams): (row: any) => boolean {
    const preds: Array<(r: any) => boolean> = [];
    for (const [col, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(col)) continue;
      const m = /^(eq|neq|is|gt|gte|lt|lte)\.(.*)$/.exec(raw);
      if (!m) continue;
      const op = m[1]; const val = coerce(m[2]);
      preds.push((r) => {
        const cell = r[col];
        switch (op) {
          case 'eq': case 'is': return cell === val || String(cell) === String(val);
          case 'neq': return !(cell === val || String(cell) === String(val));
          case 'gt': return cell > val; case 'gte': return cell >= val;
          case 'lt': return cell < val; case 'lte': return cell <= val;
          default: return true;
        }
      });
    }
    return (row) => preds.every((p) => p(row));
  }
  function json(data: any, status = 200): Response {
    const n = Array.isArray(data) ? data.length : 1;
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', 'Content-Range': `0-${Math.max(0, n - 1)}/${n}` },
    });
  }

  async function handleRpc(fn: string, body: any): Promise<Response> {
    if (fn === 'commit_checkout_invoice_and_stock') {
      const inv = body?.p_invoice || {};
      const stock: any[] = Array.isArray(body?.p_stock_items) ? body.p_stock_items : [];
      const invStore = storeFor('invoices');
      let already = false;
      if (invStore && inv.id) {
        const existing = await invStore.getItem(inv.id);
        if (existing) already = true;
        else await invStore.setItem(inv.id, { is_deleted: false, _dirty: false, ...inv });
      }
      const remaining: Record<string, number> = {};
      if (!already) {
        const apptStore = storeFor('appointments');
        if (apptStore && inv.appointmentId) {
          const apt = await apptStore.getItem(inv.appointmentId);
          if (apt) await apptStore.setItem(inv.appointmentId, { ...apt, status: inv.paymentStatus === 'void' ? 'booked' : 'completed' });
        }
        const invStore2 = storeFor('inventory');
        for (const s of stock) {
          if (invStore2 && s.item_id) {
            const it = await invStore2.getItem(s.item_id);
            if (it) { it.stock = Number(it.stock || 0) - Number(s.qty || 0); await invStore2.setItem(s.item_id, it); remaining[s.item_id] = it.stock; }
          }
        }
      }
      return json({ invoice_id: inv.id, already_committed: already, remaining_stock: remaining });
    }
    // Unemulated RPCs: succeed with an empty object so callers do not throw.
    return json({});
  }

  window.fetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/rest/v1/')) return origFetch(input, init);
    try {
      const u = new URL(url, window.location.origin);
      const method = (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
      const path = u.pathname.split('/rest/v1/')[1] || '';
      const bodyRaw = init?.body ?? (typeof input !== 'string' ? undefined : undefined);
      const body = bodyRaw ? JSON.parse(bodyRaw) : undefined;

      if (path.startsWith('rpc/')) return await handleRpc(path.slice(4), body);

      const table = path.split('?')[0];
      const store = storeFor(table);
      if (!store) return json([]); // unknown table -> empty, never hit the network

      if (method === 'GET') {
        const rows = (await readAll(store)).filter(makeFilter(u.searchParams));
        return json(rows);
      }
      if (method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        const pk = PK[table] || 'id';
        for (const r of rows) { const withDefaults = { is_deleted: false, _dirty: false, ...r }; await store.setItem(String(r[pk]), withDefaults); }
        return json(rows, 201);
      }
      if (method === 'PATCH') {
        const filter = makeFilter(u.searchParams);
        const rows = await readAll(store); const pk = PK[table] || 'id'; const updated: any[] = [];
        for (const r of rows) { if (filter(r)) { const merged = { ...r, ...body }; await store.setItem(String(r[pk]), merged); updated.push(merged); } }
        return json(updated);
      }
      if (method === 'DELETE') {
        const filter = makeFilter(u.searchParams);
        const rows = await readAll(store); const pk = PK[table] || 'id'; const del: any[] = [];
        for (const r of rows) { if (filter(r)) { await store.removeItem(String(r[pk])); del.push(r); } }
        return json(del);
      }
      return json([]);
    } catch (e) {
      // On any bridge error, fail closed to an empty result rather than a live call.
      return json([]);
    }
  };
}

export const test = base.extend({
  page: async ({ page }, use) => {
    // Install the DEV-only signed-in identity and the REST bridge BEFORE any app
    // script runs, on every navigation (specs call page.goto again per test).
    await page.addInitScript((user) => { (window as any).__KP_TEST_AUTH__ = user; }, TEST_AUTH_USER);
    await page.addInitScript(installRestBridge);

    // Realtime is swallowed — the bridge is the single source of truth.
    await page.routeWebSocket(/realtime/, () => { /* no realtime in tests */ });

    // Load the app so window._db exists, then wipe every data store, preserving
    // only auth/config ('system','users') so seeds start clean per test.
    await page.goto(APP_URL);
    await page.waitForFunction(() => Boolean((window as any)._db), null, { timeout: 20000 });
    await page.evaluate(async (preserve: string[]) => {
      const db = (window as any)._db;
      for (const key of Object.keys(db)) {
        if (preserve.includes(key)) continue;
        const store = db[key];
        if (store && typeof store.clear === 'function') {
          try { await store.clear(); } catch { /* ignore */ }
        }
      }
    }, PRESERVE);

    await use(page);
  },
});

export { expect };
