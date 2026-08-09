import { test, expect } from '@playwright/test';

/**
 * Step 32 — STAGING login proof that requires a REAL Supabase Auth account.
 *
 * Unlike the rest of the suite (which uses the DEV-only test-auth stub), this
 * test exercises the actual production login path: it types an email + password
 * into the real form and expects Supabase Auth to return a session that maps to
 * a linked staff record.
 *
 * It runs ONLY when a real, owner-created staging credential is supplied via env:
 *   KPAH_STAGING_URL       (e.g. http://localhost:3000/ or the staging deploy)
 *   KPAH_STAGING_EMAIL     (a real Supabase Auth email for a LINKED staff row)
 *   KPAH_STAGING_PASSWORD  (that account's password — never hard-code it)
 *
 * With no credentials it SKIPS and the login remains OWNER-ACTION-REQUIRED /
 * BLOCKED — never reported as PASS. No password is ever invented here.
 */
const URL = process.env.KPAH_STAGING_URL;
const EMAIL = process.env.KPAH_STAGING_EMAIL;
const PASSWORD = process.env.KPAH_STAGING_PASSWORD;

test.describe('Step 32 — real Supabase Auth staging login', () => {
  test('linked staff can sign in with email + password', async ({ page }) => {
    test.skip(
      !URL || !EMAIL || !PASSWORD,
      'BLOCKED: set KPAH_STAGING_URL/EMAIL/PASSWORD to a real owner-created, linked staff Auth account. No credentials may be invented.'
    );

    await page.goto(URL!);
    await page.getByTestId('input-email').waitFor({ state: 'visible', timeout: 15000 });
    await page.getByTestId('input-email').fill(EMAIL!);
    await page.getByTestId('input-password').fill(PASSWORD!);
    await page.getByTestId('btn-signin').click();

    // Success = a linked staff session lands in the app (nav visible) and the
    // "not linked" message never appears. If the account exists but is NOT linked,
    // this fails loudly (which is the correct signal to link users.auth_user_id).
    await expect(page.getByTestId('nav-appointments')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('login-error')).toHaveCount(0);
  });
});
