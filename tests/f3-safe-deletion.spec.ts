import { test, expect } from '@playwright/test';

async function login(page: any) {
  const pin = page.getByTestId('input-pin');
  const visible = await pin.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  if (visible) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pin.fill('5692');
    await page.getByTestId('btn-verify-pin').click();
  }
  await page.getByTestId('nav-appointments').waitFor({ state: 'visible', timeout: 15000 });
}

async function registerClient(page: any, name: string, phone9: string, petName: string) {
  await page.getByTestId('btn-add-client').click();
  await page.locator('input[name="full_name"]').fill(name);
  await page.locator('input[name="primary_phone"]').fill(phone9);
  await page.locator('input[name="petName"]').fill(petName);
  await page.getByRole('button', { name: /Register Client & Companion/ }).click();
  await page.waitForTimeout(800);
}

test.describe('F-3 — Safe deletion of clients and pets', () => {
  test.setTimeout(120_000);

  test('no-history client: PIN gate blocks wrong PIN, correct PIN soft-deletes + audits', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await login(page);
    await page.getByTestId('nav-customers').click();

    await registerClient(page, 'DelTest A', '779000001', 'PetA');
    const clientId = 'client_779000001';

    // Open delete modal. AUTH-3: the credential is now requested by the shared
    // AuthPrompt on confirm, not by a PIN field inside this modal.
    await page.getByTestId(`btn-delete-client-${clientId}`).click();
    await expect(page.getByTestId('btn-confirm-delete')).toBeVisible();
    // No history → no override checkbox.
    await expect(page.getByTestId('delete-override-checkbox')).toHaveCount(0);

    // STEP 3: wrong credential — delete BLOCKED.
    await page.getByTestId('btn-confirm-delete').click();
    await expect(page.getByTestId('auth-credential')).toBeVisible();
    await page.getByTestId('auth-credential').fill('1111');
    await page.getByTestId('auth-submit').click();
    await page.waitForTimeout(900);
    const blockedState = await page.evaluate(async (id: string) => {
      const c = await (window as any)._db.clients.getItem(id);
      return { exists: !!c, deleted: !!(c && c.is_deleted) };
    }, clientId);
    console.log('STEP 3 (wrong PIN) →', JSON.stringify(blockedState), '| modal still open:', await page.getByTestId('btn-confirm-delete').isVisible());
    expect(blockedState.exists).toBe(true);
    expect(blockedState.deleted).toBe(false); // NOT deleted
    await expect(page.getByTestId('btn-confirm-delete')).toBeVisible(); // modal still open

    // STEP 4: correct credential — client disappears.
    await page.getByTestId('btn-confirm-delete').click();
    await expect(page.getByTestId('auth-credential')).toBeVisible();
    await page.getByTestId('auth-credential').fill('5692');
    await page.getByTestId('auth-submit').click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId(`btn-delete-client-${clientId}`)).toHaveCount(0);

    const afterDelete = await page.evaluate(async (id: string) => {
      const c = await (window as any)._db.clients.getItem(id);
      return c?.is_deleted;
    }, clientId);
    console.log('STEP 4 → client is_deleted in db:', afterDelete);
    expect(afterDelete).toBe(true);

    // STEP 5: audit record written.
    const audit = await page.evaluate(async (id: string) => {
      let found: any = null;
      await (window as any)._db.deletionAudit.iterate((v: any) => { if (v && v.entity_id === id) found = v; });
      return found;
    }, clientId);
    console.log('STEP 5 → audit:', JSON.stringify(audit));
    expect(audit).toBeTruthy();
    expect(audit.entity_type).toBe('client');
    expect(audit.had_history).toBe(false);
    expect(audit.deleted_by).toBeTruthy();
  });

  test('client WITH invoice: warning lists it, button gated by checkbox, invoice survives deletion', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await login(page);
    await page.getByTestId('nav-customers').click();

    await registerClient(page, 'DelTest B', '779000002', 'PetB');
    const clientId = 'client_779000002';

    // Find the real pet id, then seed a PAID invoice for that pet (simulating a POS checkout).
    const petId = await page.evaluate(async (cid: string) => {
      let pid: string | null = null;
      await (window as any)._db.pets.iterate((p: any) => { if (p && p.clientId === cid) pid = p.id; });
      return pid;
    }, clientId);
    console.log('Client B pet id:', petId);
    expect(petId).toBeTruthy();

    await page.evaluate(async ({ petId, phone }: { petId: string; phone: string }) => {
      const inv = {
        id: 'F3-INV-1', patientId: petId, petName: 'PetB', ownerName: 'DelTest B', ownerPhone: phone,
        date: new Date().toISOString(), items: [], subtotal: 5000, tax: 0, discount: 0,
        sales_total: 5000, profit: 2000, paymentStatus: 'paid', paymentMethod: 'cash', createdBy: 'test'
      };
      await (window as any)._db.invoices.setItem(inv.id, inv);
    }, { petId: petId as string, phone: '+94 779000002' });

    // STEP 7: open delete — warning must list "1 invoice".
    await page.getByTestId(`btn-delete-client-${clientId}`).click();
    await expect(page.getByTestId('delete-history-warning')).toBeVisible();
    const warningText = await page.getByTestId('delete-history-warning').innerText();
    console.log('STEP 7 warning text:', warningText.replace(/\n/g, ' '));
    await expect(page.getByTestId('delete-history-warning')).toContainText('1 invoice');

    // STEP 8: Delete button DISABLED until the history-override checkbox is ticked.
    const disabledBefore = await page.getByTestId('btn-confirm-delete').isDisabled();
    console.log('STEP 8 → confirm disabled before checkbox:', disabledBefore);
    expect(disabledBefore).toBe(true);
    await page.getByTestId('delete-override-checkbox').check();
    const enabledAfter = await page.getByTestId('btn-confirm-delete').isEnabled();
    console.log('STEP 8 → confirm enabled after checkbox:', enabledAfter);
    expect(enabledAfter).toBe(true);

    // STEP 9: delete (AUTH-3 credential confirm) — client gone BUT invoice intact.
    await page.getByTestId('btn-confirm-delete').click();
    await expect(page.getByTestId('auth-credential')).toBeVisible();
    await page.getByTestId('auth-credential').fill('5692');
    await page.getByTestId('auth-submit').click();
    await page.waitForTimeout(1200);
    await expect(page.getByTestId(`btn-delete-client-${clientId}`)).toHaveCount(0);

    const invAfter = await page.evaluate(async () => await (window as any)._db.invoices.getItem('F3-INV-1'));
    console.log('STEP 9 → invoice after client delete:', JSON.stringify(invAfter && { id: invAfter.id, patientId: invAfter.patientId, paymentStatus: invAfter.paymentStatus, is_deleted: invAfter.is_deleted }));
    expect(invAfter).toBeTruthy();
    expect(invAfter.is_deleted).toBeFalsy();
    expect(invAfter.paymentStatus).toBe('paid');

    const clientDeleted = await page.evaluate(async (id: string) => (await (window as any)._db.clients.getItem(id))?.is_deleted, clientId);
    expect(clientDeleted).toBe(true);

    // STEP 10: audit shows had_history true; Reports shows the invoice in revenue + audit log.
    const audit = await page.evaluate(async (id: string) => {
      let found: any = null;
      await (window as any)._db.deletionAudit.iterate((v: any) => { if (v && v.entity_id === id) found = v; });
      return found;
    }, clientId);
    console.log('STEP 10 → audit:', JSON.stringify(audit));
    expect(audit.had_history).toBe(true);
    expect(audit.history_summary).toContain('1 invoice');
    expect(audit.override_confirmed).toBe(true);

    await page.getByTestId('nav-reports').click();
    await page.waitForTimeout(2000);
    await expect(page.getByTestId('deletion-audit-table')).toContainText('DelTest B');
    await expect(page.getByTestId('deletion-audit-table')).toContainText('Had history');
    // Reports now defaults to a "This Month" range; the deleted client's invoice is
    // dated now, so it is within range and counted in the range revenue metric.
    const displayedRevenue = parseFloat((await page.getByTestId('metric-total-revenue').getAttribute('data-value')) || '0');
    // Reports sums ALL non-deleted paid invoices; the deleted client's invoice must
    // still be part of that sum (financial integrity — deletion never removes revenue).
    const dbState = await page.evaluate(async () => {
      let sum = 0; let ourInvoicePaidAndPresent = false;
      await (window as any)._db.invoices.iterate((v: any) => {
        if (v && !Array.isArray(v) && !v.is_deleted && (v.paymentStatus === 'paid' || v.status === 'PAID')) {
          sum += v.sales_total || (v.amountCents ? v.amountCents / 100 : 0);
          if (v.id === 'F3-INV-1') ourInvoicePaidAndPresent = true;
        }
      });
      return { sum, ourInvoicePaidAndPresent };
    });
    console.log('STEP 9 (reports revenue) — this-month metric:', displayedRevenue, '| db paid sum (all-time):', dbState.sum, '| deleted client invoice counted:', dbState.ourInvoicePaidAndPresent);
    expect(dbState.ourInvoicePaidAndPresent).toBe(true); // deleted client's invoice is still a paid invoice
    // Revenue is the sum of paid invoices; ours (5,000) is one of them, so the reported
    // total must be at least 5,000 — the deletion did not remove it from revenue.
    expect(displayedRevenue).toBeGreaterThanOrEqual(5000);
  });
});
