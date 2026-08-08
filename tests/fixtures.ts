import { test as base, expect } from '@playwright/test';

/**
 * FIX-1 — Per-test IndexedDB isolation.
 *
 * The app persists to a single, fixed-name IndexedDB ('CeylonPets_Enterprise_OS',
 * see src/lib/localDb.ts). Playwright does NOT partition that store per test or
 * per run, so records written by one test — or by a previous `playwright test`
 * invocation — leak into later tests. That accumulation is what made the suite's
 * "green" untrustworthy, and it is the real reason f8-emergency-queue failed:
 * it read a STALE emergency queue item left over from an earlier run (matched by
 * petName, whose appointment no longer exists so it can never be cleared), not
 * the item it had just backfilled. The app's queue-clearing logic itself is
 * correct on a clean store.
 *
 * Before every test we load the app once, wipe every data store, and PRESERVE
 * only the auth/config stores ('system', 'users') so the shared login() helper
 * (ashpoint_owner / PIN 5692) keeps working — that account is config-backed and
 * falls back to PIN 5692 when no masterPin is stored (see App.tsx). Demo seeding
 * is already skipped under automation (navigator.webdriver, App.tsx), so the
 * store stays empty until each test seeds its own fixtures. Each spec's own
 * page.goto at the start of the test re-hydrates React state from the clean store.
 *
 * Combined with `workers: 1` in playwright.config.ts (the store is shared across
 * parallel contexts, so concurrent tests would otherwise clear/overwrite each
 * other's data mid-run), every test starts from a clean, isolated store.
 */
const PRESERVE = ['system', 'users'];
const APP_URL = 'http://localhost:3000/';

/**
 * TEST-ONLY staff identity. Production login is Supabase Auth email/password
 * only (Step 32). The app has a DEV-only branch that reads window.__KP_TEST_AUTH__
 * and signs the harness in without a live Auth session — it is guarded by
 * import.meta.env.DEV and stripped from production builds, so this stub can never
 * be a real login path. Role 'provider' is root, so every nav panel is visible.
 */
const TEST_AUTH_USER = {
  id: 'kpah_test_provider',
  name: 'KPAH Test Provider',
  username: 'kpah_test_provider',
  role: 'provider',
  avatarColor: 'bg-indigo-600 text-white border-indigo-700',
  active: true,
};

export const test = base.extend({
  page: async ({ page }, use) => {
    // Inject the test-only signed-in identity before any app script runs, on
    // every navigation (specs call page.goto again inside each test).
    await page.addInitScript((user) => {
      (window as any).__KP_TEST_AUTH__ = user;
    }, TEST_AUTH_USER);

    // 1) Cut the app off from the shared remote Supabase project. The sync
    // engine (src/lib/syncEngine.ts) pulls every mapped table — appointments,
    // clinic_queue, pets, … — and a realtime channel streams remote changes in
    // continuously. Because that project is shared across every run, prior
    // tests' data flows back and re-pollutes local IndexedDB the moment we
    // clear it. Fulfilling REST reads with an empty set and blocking realtime
    // makes each test hermetic and local-only, and stops tests writing more
    // garbage to the cloud. (Login is a local PIN, not Supabase auth, so this
    // does not affect authentication.)
    await page.route('**/rest/v1/**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0' }, body: '[]' })
    );
    await page.routeWebSocket(/realtime/, () => { /* swallow — no realtime in tests */ });

    // 2) Load the app so window._db exists, then wipe every data store,
    // preserving only auth/config ('system', 'users') so login() keeps working.
    await page.goto(APP_URL);
    await page.waitForFunction(() => Boolean((window as any)._db), null, { timeout: 20000 });
    await page.evaluate(async (preserve: string[]) => {
      const db = (window as any)._db;
      for (const key of Object.keys(db)) {
        if (preserve.includes(key)) continue;
        const store = db[key];
        if (store && typeof store.clear === 'function') {
          try { await store.clear(); } catch { /* ignore per-store clear errors */ }
        }
      }
    }, PRESERVE);

    // Every spec navigates (page.goto) at the start of each test, which
    // re-hydrates React state from the now-clean store, so no extra reload here.
    await use(page);
  },
});

export { expect };
