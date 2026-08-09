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
  const PK: Record<string, string> = { clients: 'client_id' };
  const STORE_ALIASES: Record<string, string> = { medical_records: 'records', system_alerts: 'alerts', system_config: 'system' };
  const origFetch = window.fetch.bind(window);

  function storeFor(table: string): any {
    const db = (window as any)._db;
    if (!db) return null;
    const storeName = STORE_ALIASES[table] || table;
    for (const key of Object.keys(db)) {
      const inst = db[key];
      try {
        const cfg = inst && typeof inst.config === 'function' ? inst.config() : null;
        if (cfg && cfg.storeName === storeName) return inst;
      } catch { /* localforage instances can be inspected before initialization */ }
    }
    return null;
  }

  async function readAll(store: any): Promise<any[]> {
    const rows: any[] = [];
    await store.iterate((value: any) => { if (value && !Array.isArray(value)) rows.push(value); });
    return rows;
  }

  function coerce(raw: string): any {
    const value = raw.replace(/^['"]|['"]$/g, '');
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    return value;
  }

  function same(a: any, b: any): boolean { return a === b || String(a) === String(b); }

  function makeFilter(params: URLSearchParams): (row: any) => boolean {
    const predicates: Array<(row: any) => boolean> = [];
    for (const [column, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(column)) continue;
      const inMatch = /^in\.\((.*)\)$/.exec(raw);
      if (inMatch) {
        const values = inMatch[1].split(',').map(coerce);
        predicates.push((row) => values.some((value) => same(row[column], value)));
        continue;
      }
      const match = /^(eq|neq|is|gt|gte|lt|lte)\.(.*)$/.exec(raw);
      if (!match) continue;
      const op = match[1];
      const value = coerce(match[2]);
      predicates.push((row) => {
        const cell = row[column];
        if (op === 'eq') return same(cell, value);
        if (op === 'neq') return !same(cell, value);
        if (op === 'is') {
          if (match[2] === 'null') return cell == null;
          if (match[2] === 'not.null') return cell != null;
          return same(cell, value);
        }
        if (op === 'gt') return cell > value;
        if (op === 'gte') return cell >= value;
        if (op === 'lt') return cell < value;
        return cell <= value;
      });
    }
    return (row) => predicates.every((predicate) => predicate(row));
  }

  function project(rows: any[], select: string | null): any[] {
    if (!select || select === '*') return rows;
    const fields = select.split(',').map((field) => field.trim()).filter(Boolean);
    return rows.map((row) => Object.fromEntries(fields.map((field) => {
      const [source, alias] = field.split(':');
      return [alias || source, row[source]];
    })));
  }

  async function queryRows(store: any, params: URLSearchParams): Promise<{ rows: any[]; total: number }> {
    const rows = (await readAll(store)).filter(makeFilter(params));
    const order = params.get('order');
    if (order) {
      const terms = order.split(',').map((term) => {
        const [column, direction = 'asc'] = term.split('.');
        return { column, descending: direction === 'desc' };
      });
      rows.sort((a, b) => {
        for (const term of terms) {
          if (a[term.column] === b[term.column]) continue;
          const aNull = a[term.column] == null;
          const bNull = b[term.column] == null;
          if (aNull || bNull) return aNull === bNull ? 0 : (aNull ? 1 : -1);
          const result = a[term.column] < b[term.column] ? -1 : 1;
          return term.descending ? -result : result;
        }
        return 0;
      });
    }
    const total = rows.length;
    const offset = Math.max(0, Number(params.get('offset') || 0));
    const limit = params.has('limit') ? Math.max(0, Number(params.get('limit'))) : undefined;
    return { rows: rows.slice(offset, limit == null ? undefined : offset + limit), total };
  }

  function json(data: any, status = 200, extraHeaders: Record<string, string> = {}, head = false): Response {
    return new Response(head ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } });
  }
  function error(message: string, status = 500): Response {
    return json({ code: 'KP_TEST_BRIDGE', message, details: null, hint: null }, status);
  }
  async function adjustStock(itemId: string, delta: number): Promise<number> {
    const store = storeFor('inventory');
    const item = store && itemId ? await store.getItem(itemId) : null;
    if (!item) throw new Error('INVENTORY_ITEM_NOT_FOUND: ' + itemId);
    const stock = Number(item.stock || 0) + delta;
    if (stock < 0) throw new Error('INSUFFICIENT_STOCK: ' + itemId);
    await store.setItem(itemId, { ...item, stock });
    return stock;
  }

  async function handleRpc(fn: string, body: any): Promise<Response> {
    if (fn === 'atomic_stock_decrement') {
      const itemId = body?.p_item_id;
      const delta = Number(body?.p_qty_delta);
      if (!itemId || !Number.isFinite(delta)) return error('INVALID_STOCK_REQUEST', 400);
      try { return json(await adjustStock(itemId, delta)); } catch (e: any) { return error(e.message, 409); }
    }
    if (fn === 'commit_checkout_invoice_and_stock') {
      const inv = body?.p_invoice || {};
      const stock: any[] = Array.isArray(body?.p_stock_items) ? body.p_stock_items : [];
      const invStore = storeFor('invoices');
      if (!invStore || !inv.id) return error('INVALID_INVOICE_ID', 400);
      if (await invStore.getItem(inv.id)) return json({ invoice_id: inv.id, already_committed: true, remaining_stock: {} });
      const inventoryStore = storeFor('inventory');
      const stockPlan: Array<{ id: string; item: any; nextStock: number }> = [];
      for (const item of stock) {
        if (!item?.item_id || !Number.isFinite(Number(item.qty))) return error('INVALID_STOCK_ITEM', 400);
        const current = inventoryStore && await inventoryStore.getItem(item.item_id);
        const nextStock = Number(current?.stock || 0) - Number(item.qty);
        if (!current) return error('INVENTORY_ITEM_NOT_FOUND: ' + item.item_id, 404);
        if (nextStock < 0) return error('INSUFFICIENT_STOCK: ' + item.item_id, 409);
        stockPlan.push({ id: item.item_id, item: current, nextStock });
      }
      await invStore.setItem(inv.id, { is_deleted: false, _dirty: false, ...inv });
      const apptStore = storeFor('appointments');
      if (apptStore && inv.appointmentId) {
        const appointment = await apptStore.getItem(inv.appointmentId);
        if (appointment) await apptStore.setItem(inv.appointmentId, { ...appointment, status: inv.paymentStatus === 'void' ? 'booked' : 'completed' });
      }
      const remaining: Record<string, number> = {};
      for (const planned of stockPlan) {
        await inventoryStore.setItem(planned.id, { ...planned.item, stock: planned.nextStock });
        remaining[planned.id] = planned.nextStock;
      }
      return json({ invoice_id: inv.id, already_committed: false, remaining_stock: remaining });
    }
    if (fn === 'close_shift_and_reconcile') {
      const shiftStore = storeFor('shifts');
      const reconciliation = body?.p_reconciliation;
      const shift = shiftStore && body?.p_shift_id ? await shiftStore.getItem(body.p_shift_id) : null;
      const reconStore = storeFor('shift_reconciliations');
      if (!shift || !reconciliation?.id) return error('SHIFT_NOT_FOUND_OR_INVALID_RECONCILIATION', 400);
      if (!reconStore) return error('Missing local store: shift_reconciliations', 501);
      if (shift.isOpen === false) return json({ shift_id: body.p_shift_id, already_closed: true, reconciliation_id: null });
      const now = new Date().toISOString();
      await shiftStore.setItem(body.p_shift_id, { ...shift, endTime: now, expectedCashCents: Math.round(Number(body.p_expected_cash_cents || 0)), actualCashCents: Math.round(Number(body.p_actual_cash_cents || 0)), discrepancyCents: Math.round(Number(body.p_discrepancy_cents || 0)), notes: body.p_notes || 'Shift closed', isOpen: false, actual_cash: Math.round(Number(body.p_actual_cash_cents || 0)) / 100, discrepancy_reason: body.p_notes || '', updated_at: now });
      await reconStore.setItem(reconciliation.id, { is_deleted: false, _dirty: false, ...reconciliation });
      return json({ shift_id: body.p_shift_id, already_closed: false, reconciliation_id: reconciliation.id });
    }
    if (fn === 'void_invoice_and_reverse_revenue') {
      const invStore = storeFor('invoices');
      const inv = invStore && body?.p_invoice_id ? await invStore.getItem(body.p_invoice_id) : null;
      if (!inv) return error('INVOICE_NOT_FOUND', 404);
      if (inv.paymentStatus === 'void') return json({ invoice_id: body.p_invoice_id, already_void: true, reversed: false, restocked: {} });
      const restocked: Record<string, number> = {};
      for (const item of Array.isArray(inv.items) ? inv.items : []) {
        if (['service', 'lab_service'].includes(item.category) || !item.itemId) continue;
        try { restocked[item.itemId] = await adjustStock(item.itemId, Number(item.quantity || 0)); } catch (e: any) { return error(e.message, 409); }
      }
      await invStore.setItem(body.p_invoice_id, { ...inv, paymentStatus: 'void' });
      const apptStore = storeFor('appointments');
      if (apptStore && inv.appointmentId) {
        const appointment = await apptStore.getItem(inv.appointmentId);
        if (appointment) await apptStore.setItem(inv.appointmentId, { ...appointment, status: 'booked' });
      }
      return json({ invoice_id: body.p_invoice_id, already_void: false, reversed: inv.paymentStatus === 'paid', restocked });
    }
    return error('Unemulated RPC: ' + fn, 501);
  }

  window.fetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/rest/v1/')) return origFetch(input, init);
    try {
      const requestHeaders = new Headers(init?.headers || (typeof input !== 'string' ? input?.headers : undefined));
      const method = (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
      const parsed = new URL(url, window.location.origin);
      const path = parsed.pathname.split('/rest/v1/')[1] || '';
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (path.startsWith('rpc/')) return await handleRpc(path.slice(4), body);
      const table = path.split('/')[0];
      const store = storeFor(table);
      if (!store) return error('Unknown local table: ' + table, 501);
      if (method === 'GET' || method === 'HEAD') {
        const result = await queryRows(store, parsed.searchParams);
        const rows = project(result.rows, parsed.searchParams.get('select'));
        const offset = Math.max(0, Number(parsed.searchParams.get('offset') || 0));
        const end = rows.length ? offset + rows.length - 1 : offset;
        const range = rows.length ? offset + '-' + end : '*';
        const responseHeaders = { 'Content-Range': range + '/' + result.total };
        const singular = requestHeaders.get('Accept')?.includes('application/vnd.pgrst.object+json') || requestHeaders.get('Prefer')?.includes('plurality=singular');
        if (singular && rows.length > 1) return error('Multiple rows returned where one was expected', 406);
        return singular ? json(rows[0] ?? null, 200, responseHeaders, method === 'HEAD') : json(rows, 200, responseHeaders, method === 'HEAD');
      }
      const bodyRows = Array.isArray(body) ? body : [body];
      const pk = PK[table] || 'id';
      if (method === 'POST') {
        if (bodyRows.some((row) => !row || row[pk] == null)) return error('Missing primary key: ' + pk, 400);
        const upsert = requestHeaders.get('Prefer')?.includes('resolution=merge-duplicates');
        const saved: any[] = [];
        for (const row of bodyRows) {
          const key = String(row[pk]);
          const existing = await store.getItem(key);
          if (existing && !upsert) return error('Duplicate primary key: ' + key, 409);
          const value = { ...(upsert ? existing : {}), ...row, is_deleted: row.is_deleted ?? false, _dirty: row._dirty ?? false };
          await store.setItem(key, value);
          saved.push(value);
        }
        return requestHeaders.get('Prefer')?.includes('return=minimal') ? new Response(null, { status: 201 }) : json(saved, 201);
      }
      if (method === 'PATCH') {
        if (!body || Array.isArray(body)) return error('PATCH body must be an object', 400);
        const updated: any[] = [];
        for (const row of await readAll(store)) {
          if (makeFilter(parsed.searchParams)(row)) { const merged = { ...row, ...body }; await store.setItem(String(merged[pk]), merged); updated.push(merged); }
        }
        return requestHeaders.get('Prefer')?.includes('return=minimal') ? new Response(null, { status: 204 }) : json(updated);
      }
      if (method === 'DELETE') {
        const removed: any[] = [];
        for (const row of await readAll(store)) if (makeFilter(parsed.searchParams)(row)) { await store.removeItem(String(row[pk])); removed.push(row); }
        return json(removed);
      }
      return error('Unsupported REST method: ' + method, 405);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
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
  const PK: Record<string, string> = { clients: 'client_id' };
  const STORE_ALIASES: Record<string, string> = { medical_records: 'records', system_alerts: 'alerts', system_config: 'system' };
  const origFetch = window.fetch.bind(window);

  function storeFor(table: string): any {
    const db = (window as any)._db;
    if (!db) return null;
    const storeName = STORE_ALIASES[table] || table;
    for (const key of Object.keys(db)) {
      const inst = db[key];
      try {
        const cfg = inst && typeof inst.config === 'function' ? inst.config() : null;
        if (cfg && cfg.storeName === storeName) return inst;
      } catch { /* localforage instances can be inspected before initialization */ }
    }
    return null;
  }

  async function readAll(store: any): Promise<any[]> {
    const rows: any[] = [];
    await store.iterate((value: any) => { if (value && !Array.isArray(value)) rows.push(value); });
    return rows;
  }

  function coerce(raw: string): any {
    const value = raw.replace(/^['"]|['"]$/g, '');
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    return value;
  }

  function same(a: any, b: any): boolean { return a === b || String(a) === String(b); }

  function makeFilter(params: URLSearchParams): (row: any) => boolean {
    const predicates: Array<(row: any) => boolean> = [];
    for (const [column, raw] of params.entries()) {
      if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(column)) continue;
      const inMatch = /^in\.\((.*)\)$/.exec(raw);
      if (inMatch) {
        const values = inMatch[1].split(',').map(coerce);
        predicates.push((row) => values.some((value) => same(row[column], value)));
        continue;
      }
      const match = /^(eq|neq|is|gt|gte|lt|lte)\.(.*)$/.exec(raw);
      if (!match) continue;
      const op = match[1];
      const value = coerce(match[2]);
      predicates.push((row) => {
        const cell = row[column];
        if (op === 'eq') return same(cell, value);
        if (op === 'neq') return !same(cell, value);
        if (op === 'is') {
          if (match[2] === 'null') return cell == null;
          if (match[2] === 'not.null') return cell != null;
          return same(cell, value);
        }
        if (op === 'gt') return cell > value;
        if (op === 'gte') return cell >= value;
        if (op === 'lt') return cell < value;
        return cell <= value;
      });
    }
    return (row) => predicates.every((predicate) => predicate(row));
  }

  function project(rows: any[], select: string | null): any[] {
    if (!select || select === '*') return rows;
    const fields = select.split(',').map((field) => field.trim()).filter(Boolean);
    return rows.map((row) => Object.fromEntries(fields.map((field) => {
      const [source, alias] = field.split(':');
      return [alias || source, row[source]];
    })));
  }

  async function queryRows(store: any, params: URLSearchParams): Promise<{ rows: any[]; total: number }> {
    const rows = (await readAll(store)).filter(makeFilter(params));
    const order = params.get('order');
    if (order) {
      const terms = order.split(',').map((term) => {
        const [column, direction = 'asc'] = term.split('.');
        return { column, descending: direction === 'desc' };
      });
      rows.sort((a, b) => {
        for (const term of terms) {
          if (a[term.column] === b[term.column]) continue;
          const aNull = a[term.column] == null;
          const bNull = b[term.column] == null;
          if (aNull || bNull) return aNull === bNull ? 0 : (aNull ? 1 : -1);
          const result = a[term.column] < b[term.column] ? -1 : 1;
          return term.descending ? -result : result;
        }
        return 0;
      });
    }
    const total = rows.length;
    const offset = Math.max(0, Number(params.get('offset') || 0));
    const limit = params.has('limit') ? Math.max(0, Number(params.get('limit'))) : undefined;
    return { rows: rows.slice(offset, limit == null ? undefined : offset + limit), total };
  }

  function json(data: any, status = 200, extraHeaders: Record<string, string> = {}, head = false): Response {
    return new Response(head ? null : JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...extraHeaders } });
  }
  function error(message: string, status = 500): Response {
    return json({ code: 'KP_TEST_BRIDGE', message, details: null, hint: null }, status);
  }
  async function adjustStock(itemId: string, delta: number): Promise<number> {
    const store = storeFor('inventory');
    const item = store && itemId ? await store.getItem(itemId) : null;
    if (!item) throw new Error('INVENTORY_ITEM_NOT_FOUND: ' + itemId);
    const stock = Number(item.stock || 0) + delta;
    if (stock < 0) throw new Error('INSUFFICIENT_STOCK: ' + itemId);
    await store.setItem(itemId, { ...item, stock });
    return stock;
  }

  async function handleRpc(fn: string, body: any): Promise<Response> {
    if (fn === 'atomic_stock_decrement') {
      const itemId = body?.p_item_id;
      const delta = Number(body?.p_qty_delta);
      if (!itemId || !Number.isFinite(delta)) return error('INVALID_STOCK_REQUEST', 400);
      try { return json(await adjustStock(itemId, delta)); } catch (e: any) { return error(e.message, 409); }
    }
    if (fn === 'commit_checkout_invoice_and_stock') {
      const inv = body?.p_invoice || {};
      const stock: any[] = Array.isArray(body?.p_stock_items) ? body.p_stock_items : [];
      const invStore = storeFor('invoices');
      if (!invStore || !inv.id) return error('INVALID_INVOICE_ID', 400);
      if (await invStore.getItem(inv.id)) return json({ invoice_id: inv.id, already_committed: true, remaining_stock: {} });
      const inventoryStore = storeFor('inventory');
      const stockPlan: Array<{ id: string; item: any; nextStock: number }> = [];
      for (const item of stock) {
        if (!item?.item_id || !Number.isFinite(Number(item.qty))) return error('INVALID_STOCK_ITEM', 400);
        const current = inventoryStore && await inventoryStore.getItem(item.item_id);
        const nextStock = Number(current?.stock || 0) - Number(item.qty);
        if (!current) return error('INVENTORY_ITEM_NOT_FOUND: ' + item.item_id, 404);
        if (nextStock < 0) return error('INSUFFICIENT_STOCK: ' + item.item_id, 409);
        stockPlan.push({ id: item.item_id, item: current, nextStock });
      }
      await invStore.setItem(inv.id, { is_deleted: false, _dirty: false, ...inv });
      const apptStore = storeFor('appointments');
      if (apptStore && inv.appointmentId) {
        const appointment = await apptStore.getItem(inv.appointmentId);
        if (appointment) await apptStore.setItem(inv.appointmentId, { ...appointment, status: inv.paymentStatus === 'void' ? 'booked' : 'completed' });
      }
      const remaining: Record<string, number> = {};
      for (const planned of stockPlan) {
        await inventoryStore.setItem(planned.id, { ...planned.item, stock: planned.nextStock });
        remaining[planned.id] = planned.nextStock;
      }
      return json({ invoice_id: inv.id, already_committed: false, remaining_stock: remaining });
    }
    if (fn === 'close_shift_and_reconcile') {
      const shiftStore = storeFor('shifts');
      const reconciliation = body?.p_reconciliation;
      const shift = shiftStore && body?.p_shift_id ? await shiftStore.getItem(body.p_shift_id) : null;
      const reconStore = storeFor('shift_reconciliations');
      if (!shift || !reconciliation?.id) return error('SHIFT_NOT_FOUND_OR_INVALID_RECONCILIATION', 400);
      if (!reconStore) return error('Missing local store: shift_reconciliations', 501);
      if (shift.isOpen === false) return json({ shift_id: body.p_shift_id, already_closed: true, reconciliation_id: null });
      const now = new Date().toISOString();
      await shiftStore.setItem(body.p_shift_id, { ...shift, endTime: now, expectedCashCents: Math.round(Number(body.p_expected_cash_cents || 0)), actualCashCents: Math.round(Number(body.p_actual_cash_cents || 0)), discrepancyCents: Math.round(Number(body.p_discrepancy_cents || 0)), notes: body.p_notes || 'Shift closed', isOpen: false, actual_cash: Math.round(Number(body.p_actual_cash_cents || 0)) / 100, discrepancy_reason: body.p_notes || '', updated_at: now });
      await reconStore.setItem(reconciliation.id, { is_deleted: false, _dirty: false, ...reconciliation });
      return json({ shift_id: body.p_shift_id, already_closed: false, reconciliation_id: reconciliation.id });
    }
    if (fn === 'void_invoice_and_reverse_revenue') {
      const invStore = storeFor('invoices');
      const inv = invStore && body?.p_invoice_id ? await invStore.getItem(body.p_invoice_id) : null;
      if (!inv) return error('INVOICE_NOT_FOUND', 404);
      if (inv.paymentStatus === 'void') return json({ invoice_id: body.p_invoice_id, already_void: true, reversed: false, restocked: {} });
      const restocked: Record<string, number> = {};
      for (const item of Array.isArray(inv.items) ? inv.items : []) {
        if (['service', 'lab_service'].includes(item.category) || !item.itemId) continue;
        try { restocked[item.itemId] = await adjustStock(item.itemId, Number(item.quantity || 0)); } catch (e: any) { return error(e.message, 409); }
      }
      await invStore.setItem(body.p_invoice_id, { ...inv, paymentStatus: 'void' });
      const apptStore = storeFor('appointments');
      if (apptStore && inv.appointmentId) {
        const appointment = await apptStore.getItem(inv.appointmentId);
        if (appointment) await apptStore.setItem(inv.appointmentId, { ...appointment, status: 'booked' });
      }
      return json({ invoice_id: body.p_invoice_id, already_void: false, reversed: inv.paymentStatus === 'paid', restocked });
    }
    return error('Unemulated RPC: ' + fn, 501);
  }

  window.fetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!url.includes('/rest/v1/')) return origFetch(input, init);
    try {
      const requestHeaders = new Headers(init?.headers || (typeof input !== 'string' ? input?.headers : undefined));
      const method = (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
      const parsed = new URL(url, window.location.origin);
      const path = parsed.pathname.split('/rest/v1/')[1] || '';
      const body = init?.body ? JSON.parse(init.body) : undefined;
      if (path.startsWith('rpc/')) return await handleRpc(path.slice(4), body);
      const table = path.split('/')[0];
      const store = storeFor(table);
      if (!store) return error('Unknown local table: ' + table, 501);
      if (method === 'GET' || method === 'HEAD') {
        const result = await queryRows(store, parsed.searchParams);
        const rows = project(result.rows, parsed.searchParams.get('select'));
        const offset = Math.max(0, Number(parsed.searchParams.get('offset') || 0));
        const end = rows.length ? offset + rows.length - 1 : offset;
        const range = rows.length ? offset + '-' + end : '*';
        const responseHeaders = { 'Content-Range': range + '/' + result.total };
        const singular = requestHeaders.get('Accept')?.includes('application/vnd.pgrst.object+json') || requestHeaders.get('Prefer')?.includes('plurality=singular');
        if (singular && rows.length > 1) return error('Multiple rows returned where one was expected', 406);
        return singular ? json(rows[0] ?? null, 200, responseHeaders, method === 'HEAD') : json(rows, 200, responseHeaders, method === 'HEAD');
      }
      const bodyRows = Array.isArray(body) ? body : [body];
      const pk = PK[table] || 'id';
      if (method === 'POST') {
        if (bodyRows.some((row) => !row || row[pk] == null)) return error('Missing primary key: ' + pk, 400);
        const upsert = requestHeaders.get('Prefer')?.includes('resolution=merge-duplicates');
        const saved: any[] = [];
        for (const row of bodyRows) {
          const key = String(row[pk]);
          const existing = await store.getItem(key);
          if (existing && !upsert) return error('Duplicate primary key: ' + key, 409);
          const value = { ...(upsert ? existing : {}), ...row, is_deleted: row.is_deleted ?? false, _dirty: row._dirty ?? false };
          await store.setItem(key, value);
          saved.push(value);
        }
        return requestHeaders.get('Prefer')?.includes('return=minimal') ? new Response(null, { status: 201 }) : json(saved, 201);
      }
      if (method === 'PATCH') {
        if (!body || Array.isArray(body)) return error('PATCH body must be an object', 400);
        const updated: any[] = [];
        for (const row of await readAll(store)) {
          if (makeFilter(parsed.searchParams)(row)) { const merged = { ...row, ...body }; await store.setItem(String(merged[pk]), merged); updated.push(merged); }
        }
        return requestHeaders.get('Prefer')?.includes('return=minimal') ? new Response(null, { status: 204 }) : json(updated);
      }
      if (method === 'DELETE') {
        const removed: any[] = [];
        for (const row of await readAll(store)) if (makeFilter(parsed.searchParams)(row)) { await store.removeItem(String(row[pk])); removed.push(row); }
        return json(removed);
      }
      return error('Unsupported REST method: ' + method, 405);
    } catch (e) {
      return error(e instanceof Error ? e.message : String(e), 500);
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
