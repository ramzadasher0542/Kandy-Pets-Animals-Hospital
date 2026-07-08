import { test, expect } from '@playwright/test';

test.describe('Chunk 12 - Deterministic IDs', () => {
  test('Creates deterministic client and pet IDs, and updates on conflict', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    
    // Login if prompted
    const pinInput = page.locator('input[type="password"]');
    if (await pinInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.locator('select').selectOption('ashpoint_owner');
      await pinInput.fill('5692'); // correct default pin
      await page.getByRole('button', { name: /Verify/i }).click();
    }

    // Wait for the main dashboard to load
    await expect(page.locator('button', { hasText: 'Customers' })).toBeVisible({ timeout: 10000 });

    // 2. Click on Customers tab in the sidebar
    await page.locator('button', { hasText: 'Customers' }).click();

    // Click "Register New Client"
    await page.locator('button', { hasText: 'Register New Client' }).click();

    // Fill Client Info
    await page.locator('input[name="primary_phone"]').fill('(555) 123-4567');
    await page.locator('input[name="full_name"]').fill('John Doe');

    // Fill Pet Info
    await page.locator('input[name="petName"]').fill('Fido');

    // Submit
    await page.locator('button', { hasText: 'Save Identity' }).click();

    // 3. Inspect the DB for the deterministic IDs
    await page.waitForTimeout(1000); // Wait a second for DB write
    const dbData = await page.evaluate(async () => {
      // @ts-ignore
      const clients = await window._db.clients.getItems();
      // @ts-ignore
      const pets = await window._db.pets.getItems();
      
      return {
        clients: clients?.filter((c: any) => c.primary_phone === '(555) 123-4567'),
        pets: pets?.filter((p: any) => p.name === 'Fido')
      };
    });

    console.log('--- Customers DB Data ---');
    console.log(dbData);
    
    // Validate format client_5551234567 and fido_5551234567
    expect(dbData.clients[0].client_id).toBe('client_5551234567');
    expect(dbData.pets[0].id).toBe('fido_5551234567');

    // 4. Test Appointments check-in duplication
    await page.locator('button', { hasText: 'Appointments' }).click();
    
    // Add new appointment
    await page.locator('button', { hasText: 'New Appointment' }).click();
    await page.locator('input[name="ownerName"]').fill('John Doe Edited');
    await page.locator('input[name="ownerPhone"]').fill('(555) 123-4567');
    await page.locator('input[name="petName"]').fill('Fido');
    await page.locator('button', { hasText: 'Schedule Appointment' }).click();
    
    await page.waitForTimeout(1000); // Wait for modal to close

    // Check in the appointment
    await page.locator('div').filter({ hasText: 'John Doe Edited' }).locator('button', { hasText: 'Check In' }).first().click();

    // Give it a second to run the async check-in logic
    await page.waitForTimeout(1000);

    // 5. Check DB again to ensure no duplicates were created
    const finalDbData = await page.evaluate(async () => {
      // @ts-ignore
      const clients = await window._db.clients.getItems();
      // @ts-ignore
      const pets = await window._db.pets.getItems();
      
      return {
        clients: clients?.filter((c: any) => c.primary_phone === '(555) 123-4567'),
        pets: pets?.filter((p: any) => p.name === 'Fido')
      };
    });
    
    console.log('--- Final DB Data ---');
    console.log(finalDbData);
    
    // Should still only be exactly 1 client and 1 pet
    expect(finalDbData.clients.length).toBe(1);
    expect(finalDbData.pets.length).toBe(1);
    
    // The name should have been updated by the check-in process!
    expect(finalDbData.clients[0].full_name).toBe('John Doe Edited');
  });
});
