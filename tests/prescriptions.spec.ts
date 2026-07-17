import { test, expect } from './fixtures';

test('Verify Prescribed Meds Route and Frequency', async ({ page }) => {
  await page.goto('http://localhost:3000');
  
  // Login
  const pinInput = page.getByTestId('input-pin');
  const pinVisible = await pinInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
  if (pinVisible) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput.fill('5692');
    await page.getByTestId('btn-verify-pin').click();
  }
  // Seed a patient so we can click them
  await page.evaluate(async () => {
    // @ts-ignore
    const db = (window as any)._db;
    await db.clients.setItem('test_client_1', {
      client_id: 'test_client_1', full_name: 'Test Client', primary_phone: '123'
    });
    await db.pets.setItem('test_pet_1', {
      id: 'test_pet_1', clientId: 'test_client_1', name: 'Test Pet', petType: 'Canine'
    });
    await db.records.setItem('test_record_1', {
      id: 'test_record_1', patientId: 'test_pet_1', petName: 'Test Pet', visitDate: new Date().toISOString().split('T')[0],
      ownerName: 'Test Client', ownerPhone: '123', diagnosis: 'Test Diagnosis', prescribedMeds: [], status: 'draft'
    });
    await db.inventory.setItem('test_med_1', {
      id: 'test_med_1', name: 'Amoxicillin Test', category: 'prescription', unit: 'ml', stock: 100, price: 10, cost: 5, minStock: 0, sku: 'RX-TEST'
    });
  });
  
  await page.reload();
  // We might need to login again after reload if session isn't persisted or just wait for dashboard
  const pinInput2 = page.getByTestId('input-pin');
  const pinVisible2 = await pinInput2.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (pinVisible2) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput2.fill('5692');
    await page.getByTestId('btn-verify-pin').click();
  }
  
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('nav-examinations').click();
  await expect(page.locator('h1:has-text("Charting Dashboard")')).toBeVisible();

  // Switch to "All History" mode to make sure we can find a record to edit if no queue
  await page.click('button:has-text("All History")');

  // Open the first medical record
  const firstPatientRow = page.locator('tbody tr', { hasText: 'Test Pet' }).first();
  await firstPatientRow.waitFor({ state: 'visible', timeout: 10000 });
  await firstPatientRow.locator('button:has-text("Chart Patient")').click();
  
  // Navigate to Pharmacy & Prescriptions tab
  await page.click('button:has-text("Pharmacy")');
  await expect(page.locator('h3:has-text("Pharmacy & Prescriptions")')).toBeVisible();

  // Add a prescribed medication: drug="Amoxicillin"
  await page.fill('input[placeholder="-- Select from Inventory --"]', 'Amoxicillin');

  // Set route="IM", frequency="BD", dosage="0.5ml"
  await page.selectOption('select:has(option[value="IM"])', 'IM'); // Route
  await page.fill('input[placeholder="e.g. 1 Tablet, 5ml"]', '0.5ml'); // Dosage
  await page.selectOption('select:has(option[value="BD"])', 'BD'); // Frequency

  // Click "Add to Prescription"
  await page.click('button:has-text("Add to Prescription")');
  
  // Wait for it to appear in the active prescriptions list
  const activeList = page.locator('.flex-1:has-text("Active Prescriptions List")').first();
  await expect(activeList.getByText('Amoxicillin').first()).toBeVisible();
  await expect(activeList.getByText(/IM \u00B7 BD/).first()).toBeVisible();
  await expect(activeList.getByText(/0\.5ml/).first()).toBeVisible();

  // Save the record
  await page.click('button:has-text("Lock Chart & Save")');
  
  // Wait for success toast
  await expect(page.locator('text=Chart Locked & Saved successfully.')).toBeVisible({ timeout: 5000 });

  // Reload and reopen — confirm route="IM" and frequency="BD" persisted
  await page.reload();
  const pinInput3 = page.getByTestId('input-pin');
  const pinVisible3 = await pinInput3.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (pinVisible3) {
    await page.locator('select').selectOption('ashpoint_owner');
    await pinInput3.fill('5692');
    await page.getByTestId('btn-verify-pin').click();
  }
  await expect(page.locator('text=Dashboard').first()).toBeVisible({ timeout: 10000 });
  await page.getByTestId('nav-examinations').click();
  await expect(page.locator('h1:has-text("Charting Dashboard")')).toBeVisible({ timeout: 10000 });
  await page.click('button:has-text("All History")');
  const firstPatientRowAfter = page.locator('tbody tr', { hasText: 'Test Pet' }).first();
  await firstPatientRowAfter.waitFor({ state: 'visible' });
  await firstPatientRowAfter.locator('button:has-text("Chart Patient")').click();
  
  await page.click('button:has-text("Pharmacy")');
  // Check if it persisted
  const activeListAfter = page.locator('.flex-1:has-text("Active Prescriptions List")').first();
  await expect(activeListAfter.getByText(/IM \u00B7 BD/).first()).toBeVisible();

  // Add another med with frequency="Custom", frequencyCustom="Every 8hrs"
  await page.fill('input[placeholder="-- Select from Inventory --"]', 'a');
  await page.locator('.absolute.z-20 > div').first().click();
  
  // Select custom frequency
  await page.selectOption('select:has(option[value="Custom"])', 'Custom'); // Frequency
  await page.fill('input[placeholder="e.g. Every 8hrs"]', 'Every 8hrs'); // frequencyCustom

  await page.click('button:has-text("Add to Prescription")');

  // Confirm "Every 8hrs" appears in the list for that med
  // Since we don't know the exact route, let's just check if "Every 8hrs" is there. The default route is 'Oral'
  await expect(page.locator('.flex-1:has-text("Active Prescriptions List")').locator('text=Oral · Every 8hrs').first()).toBeVisible();

  console.log("ALL PLAYWRIGHT TESTS PASSED EXACTLY AS EXPECTED.");
});
