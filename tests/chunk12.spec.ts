import { test, expect } from '@playwright/test';

test.describe('Chunk 12 - Deterministic IDs', () => {
  test('Creates deterministic client and pet IDs, and updates on conflict', async ({ page }) => {
    await page.goto('http://localhost:3000/');

    // Login if prompted (isVisible() does not poll, so use waitFor to survive app boot time)
    const pinInput = page.getByTestId('input-pin');
    const pinVisible = await pinInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (pinVisible) {
      await page.locator('select').selectOption('ashpoint_owner');
      await pinInput.fill('5692'); // correct default pin
      await page.getByTestId('btn-verify-pin').click();
    }

    // Wait for the main dashboard to load
    await expect(page.getByTestId('nav-customers')).toBeVisible({ timeout: 10000 });

    // 2. Click on Customers tab in the sidebar
    await page.getByTestId('nav-customers').click();

    // Click "Register New Client"
    await page.getByTestId('btn-add-client').click();

    // Fill Client Info
    await page.locator('input[name="primary_phone"]').fill('771234567');
    await page.locator('input[name="full_name"]').fill('John Doe');

    // Fill Pet Info
    await page.locator('input[name="petName"]').fill('Fido');

    // Submit
    await page.locator('button', { hasText: 'Register Client & Companion' }).click();

    // 3. Inspect the DB for the deterministic IDs
    await page.waitForTimeout(1000); // Wait a second for DB write
    const dbData = await page.evaluate(async () => {
      // @ts-ignore
      const getAll = async (store: any) => {
        const items: any[] = [];
        await store.iterate((value: any) => { items.push(value); });
        return items;
      };
      // @ts-ignore
      const clients = await getAll(window._db.clients);
      // @ts-ignore
      const pets = await getAll(window._db.pets);
      
      return {
        clients: clients?.filter((c: any) => c.primary_phone === '+94 771234567'),
        pets: pets?.filter((p: any) => p.name === 'Fido')
      };
    });

    console.log('--- Customers DB Data ---');
    console.log(dbData);
    
    // Validate deterministic ID format derived from the normalized 9-digit phone
    expect(dbData.clients[0].client_id).toBe('client_771234567');
    expect(dbData.pets[0].id).toBe('fido_771234567');

    // 4. Test Appointments check-in duplication
    await page.getByTestId('nav-appointments').click();

    // Add new appointment
    await page.getByTestId('btn-new-appointment').click();
    await page.locator('input[name="ownerName"]').fill('John Doe Edited');
    await page.locator('input[name="ownerPhone"]').fill('771234567');
    await page.locator('input[name="petName"]').fill('Fido');
    await page.locator('textarea[name="reason"]').fill('Annual check-up');
    await page.locator('button', { hasText: 'Confirm Appointment' }).click();

    await page.waitForTimeout(1000); // Wait for modal to close

    // Check in the appointment
    await page.locator('tr').filter({ hasText: 'John Doe Edited' }).getByTestId('btn-check-in').click();

    // Give it a second to run the async check-in logic
    await page.waitForTimeout(1000);

    // 5. Check DB again to ensure no duplicates were created
    const finalDbData = await page.evaluate(async () => {
      // @ts-ignore
      const getAll = async (store: any) => {
        const items: any[] = [];
        await store.iterate((value: any) => { items.push(value); });
        return items;
      };
      // @ts-ignore
      const clients = await getAll(window._db.clients);
      // @ts-ignore
      const pets = await getAll(window._db.pets);
      
      return {
        clients: clients?.filter((c: any) => c.primary_phone === '+94 771234567'),
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
