import { test, expect } from '@playwright/test';

async function login(page: any) {
  const pin = page.getByTestId('input-pin');
  const visible = await pin.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  if (visible) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pin.fill('5692');
    await page.getByTestId('btn-verify-pin').click();
  }
}

test.describe('F-7 — Inpatient Log', () => {
  test.setTimeout(120_000);

  test('admitted patients have Inpatient Log tab, outpatients do not', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await login(page);

    // 1. Seed clients and pets
    await page.evaluate(async () => {
      // @ts-ignore
      const db = (window as any)._db;
      await db.clients.setItem('client_f7', {
        client_id: 'client_f7', primary_phone: '+94 773333333', full_name: 'F7 Owner',
        email_address: '', physical_address: '', communication_preference: 'none',
        account_balance: 0, lifetime_value: 0, client_status: 'active', administrative_notes: ''
      });
      await db.pets.setItem('f7_admitted', { id: 'f7_admitted', clientId: 'client_f7', name: 'F7Admit', petType: 'Canine', breed: 'Labrador', age: '2y', weight: 20 });
      await db.pets.setItem('f7_outpatient', { id: 'f7_outpatient', clientId: 'client_f7', name: 'F7Out', petType: 'Feline', breed: 'Persian', age: '1y', weight: 4 });
    });

    await page.reload();
    await login(page);
    
    // 2. Admit F7Admit (Medical Boarding)
    await page.getByTestId('nav-boarding').click();
    
    // Find an empty kennel (e.g. Kennel 10)
    await page.getByText('Kennel 10', { exact: true }).click();
    await page.getByPlaceholder('Search by Patient Name...').fill('F7Admit');
    // Select pet
    await page.getByText('F7Admit').first().click();
    
    // Pick checkout date = tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await page.locator('input[type="date"]').fill(tomorrow);
    await page.getByTestId('estimated-stay-input').fill('2');
    
    // Switch to Medical (Admission)
    await page.locator('button', { hasText: 'Medical' }).click();
    
    // Initiate booking
    await page.locator('button', { hasText: 'Initiate Booking Process' }).click();
    await page.waitForTimeout(500);
    // Collect & Lock
    await page.locator('button', { hasText: 'Collect & Lock Cage' }).click();
    await page.waitForTimeout(800);
    
    // 3. Create normal visit for F7Out (Outpatient)
    // We don't even need a visit, we can just search them in All History
    
    // 4. Go to Examinations
    await page.getByTestId('nav-examinations').click();
    
    // Click All History
    await page.locator('button', { hasText: 'All History' }).click();
    
    // Search F7Admit
    await page.getByPlaceholder('Search pets, owners...').fill('F7Admit');
    await page.waitForTimeout(500);
    await page.getByText('F7Admit').first().click();
    
    // The "Inpatient Log" tab button should be visible
    const inpatientTab = page.locator('button', { hasText: 'Inpatient Log' });
    await expect(inpatientTab).toBeVisible({ timeout: 5000 });
    
    // Click it and add a log entry
    await inpatientTab.click();
    await page.getByPlaceholder('e.g. Ceftriaxone 1g').fill('F7 Test Treatment');
    await page.locator('button', { hasText: 'Add Log Entry' }).click();
    
    // Assert log entry is added
    await expect(page.getByText('F7 Test Treatment')).toBeVisible();
    await expect(page.getByText('IV')).toBeVisible(); // default route
    
    // Close Workspace
    await page.locator('button', { hasText: 'Close Workspace' }).click();
    
    // Verify F7Outpatient does NOT have Inpatient Log
    await page.getByPlaceholder('Search pets, owners...').fill('F7Out');
    await page.waitForTimeout(500);
    await page.getByText('F7Out').first().click();
    
    await expect(inpatientTab).toBeHidden();
  });
});
