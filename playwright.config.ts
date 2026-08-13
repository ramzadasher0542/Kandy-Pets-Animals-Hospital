import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* FIX-1: The app persists to a SINGLE fixed-name IndexedDB that Playwright
   * does not partition per test/context. Parallel workers would clear and write
   * into each other's store mid-run, so tests must run serially. Combined with
   * the per-test isolation in tests/fixtures.ts (store wipe + Supabase network
   * cutoff), a single worker makes every run start from a clean, isolated store
   * and makes a green run trustworthy. */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* FIX-1: Give web-first assertions a little more headroom. Under full-suite
   * serial load the Vite dev server + React re-hydration after a reload can push
   * a legitimate render past the 5s default, causing load-sensitive flakes (e.g.
   * the prescriptions persistence re-check). 10s never turns a real failure green
   * — an assertion that never becomes true still fails, just later. */
  expect: { timeout: 10_000 },
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    // baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    headless: true,
  },

  /* Keep simulated fixture coverage separate from real Supabase Auth proof. */
  projects: [
    {
      name: 'simulated-local',
      testIgnore: '**/staging-auth-login.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'real-supabase-auth',
      testMatch: '**/staging-auth-login.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
