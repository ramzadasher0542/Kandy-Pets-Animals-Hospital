import { test, expect } from '@playwright/test';

test('Verify Grooming Consent and Instructions', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('http://localhost:3000');

  // Login and seed patient
  const pinInput = page.getByPlaceholder('••••');
  const pinVisible = await pinInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  if (pinVisible) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput.fill('5692');
    await page.getByText('Verify').click();
  }

  // Seed a patient so we can click them
  await page.evaluate(async () => {
    const db = (window as any)._db;
    await db.clients.setItem('test_client_g1', {
      client_id: 'test_client_g1', full_name: 'Test Client Grooming', primary_phone: '123'
    });
    await db.pets.setItem('test_pet_g1', {
      id: 'test_pet_g1', clientId: 'test_client_g1', name: 'Test Pet Grooming', petType: 'Canine'
    });
    await db.clinicQueue.setItem('test_queue_g1', {
      id: 'test_queue_g1', petId: 'test_pet_g1', petName: 'Test Pet Grooming', ownerName: 'Test Client Grooming',
      ownerPhone: '123', serviceType: 'Grooming', status: 'active', checkInTime: new Date().toISOString()
    });
  });
  
  await page.reload();
  const pinInput2 = page.getByPlaceholder('••••');
  const pinVisible2 = await pinInput2.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (pinVisible2) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput2.fill('5692');
    await page.getByText('Verify').click();
  }

  // Go to Grooming Salon
  await page.click('button:has-text("Grooming Salon")');
  
  // Wait for directory and pick a patient
  await expect(page.locator('text=Active Grooming Queue')).toBeVisible();
  
  // Create a patient for testing (or use one in the list)
  const patientRow = page.locator('.space-y-2 > div').first();
  await patientRow.click();
  
  // 1. Grooming Instructions Interactions
  await page.click('text=Bathe');
  await page.click('text=Full Shave');
  
  // Verify Full Shave is checked
  const fullShaveCheckbox = page.locator('label:has-text("Full Shave")').locator('input');
  await expect(fullShaveCheckbox).toBeChecked();
  
  // Click Trim Only
  await page.click('text=Trim Only');
  
  // Verify Full Shave is UNCHECKED and Trim Only is CHECKED
  await expect(fullShaveCheckbox).not.toBeChecked();
  const trimOnlyCheckbox = page.locator('label:has-text("Trim Only")').locator('input');
  await expect(trimOnlyCheckbox).toBeChecked();

  // 2. Add services
  await page.click('label:has-text("Full Groom")');

  // 3. Draw a signature (simulate mouse drag)
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 50, box.y + 20, { steps: 5 });
    await page.mouse.up();
  }
  
  // As a fallback to ensure React state updates, dispatch synthetic events
  await canvas.dispatchEvent('mousedown', { clientX: box?.x || 0 + 10, clientY: box?.y || 0 + 10 });
  await canvas.dispatchEvent('mousemove', { clientX: box?.x || 0 + 20, clientY: box?.y || 0 + 20 });
  await canvas.dispatchEvent('mouseup');

  // 4. Enter owner name "Test Owner"
  await page.fill('input[placeholder="Owner Name"]', 'Test Owner');

  // Fill custom notes
  await page.fill('textarea[placeholder="Any custom notes..."]', 'Handle with care');

  // Save session 1
  await page.click('button:has-text("Finalize & Send to Billing")');

  // Wait for success toast
  await expect(page.locator('text=/Grooming session completed/i').first()).toBeVisible({ timeout: 5000 });

  // 5. Confirm session card shows "CONSENT SIGNED" badge
  await expect(page.locator('text=CONSENT SIGNED')).toBeVisible();

  // Check the view instructions details
  // Wait for details to be visible in DOM, we click the summary
  await page.click('text=View Instructions');
  await expect(page.locator('text=☑ Trim Only')).toBeVisible();
  await expect(page.locator('text=Notes: Handle with care')).toBeVisible();

  // 6. Open a second session without signing
  await page.click('button:has-text("New Session")');
  await page.click('label:has-text("Nail Clipping")');
  await page.click('button:has-text("Finalize & Send to Billing")');
  
  // Confirm warning modal appears
  await expect(page.locator('text=No signature captured. Save anyway?')).toBeVisible();
  await page.click('button:has-text("Confirm Save")');
  
  await expect(page.locator('text=/Grooming session completed/i').first()).toBeVisible({ timeout: 5000 });
  
  // Confirm "NO CONSENT" badge
  await expect(page.locator('text=NO CONSENT').first()).toBeVisible();

  // 7. Reload and verify persistence
  await page.reload();
  const pinInput3 = page.getByPlaceholder('••••');
  const pinVisible3 = await pinInput3.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (pinVisible3) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput3.fill('5692');
    await page.getByText('Verify').click();
  }
  await page.click('button:has-text("Grooming Salon")');
  await expect(page.locator('text=Active Grooming Queue')).toBeVisible();
  
  // We need to click the same patient to see their history
  await patientRow.click();
  await page.click('button:has-text("Grooming History")');
  
  // Verify instructions and owner name persisted
  const viewBtns = page.locator('text=View Instructions');
  for (let i = 0; i < await viewBtns.count(); i++) {
    await viewBtns.nth(i).click();
  }
  await expect(page.locator('text=☑ Trim Only').first()).toBeVisible();
  
  // Base64 signature check via window._db
  const logsCount = await page.evaluate(async () => {
    const db = (window as any)._db;
    const logs = [];
    await db.groomingLogs.iterate((log) => {
      logs.push(log);
    });
    // Check if the signed one has a signature
    const signedLog = logs.find(l => l.consentSignature && l.consentOwnerName === 'Test Owner');
    return signedLog ? 'FOUND' : 'MISSING';
  });
  
  expect(logsCount).toBe('FOUND');
});
