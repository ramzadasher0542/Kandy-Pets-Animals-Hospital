import { test, expect } from '@playwright/test';

test.describe('Emergency Intake Flow', () => {
  test('creates and prioritizes emergency intake', async ({ page }) => {
    // Navigate to the app and login
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    const pinInput = page.getByTestId('input-pin');
    const pinVisible = await pinInput.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (pinVisible) {
      await page.locator('select').selectOption('ashpoint_owner');
      await pinInput.fill('5692');
      await page.getByTestId('btn-verify-pin').click();
    }

    // Reset DB for clean state
    await page.evaluate(async () => {
      await (window as any)._db.appointments.clear();
      await (window as any)._db.clinicQueue.clear();
    });
    await page.reload();

    const pinInput2 = page.getByTestId('input-pin');
    const pinVisible2 = await pinInput2.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
    if (pinVisible2) {
      await page.locator('select').selectOption('ashpoint_owner');
      await pinInput2.fill('5692');
      await page.getByTestId('btn-verify-pin').click();
    }

    // Go to Appointments
    await page.getByRole('button', { name: 'Appointments' }).click();
    
    // 1. Create Routine Appointment
    await page.getByTestId('btn-new-appointment').click();
    await page.locator('input[name="petName"]').fill('RoutineDog');
    await page.locator('input[name="ownerName"]').fill('John Doe');
    await page.locator('input[name="ownerPhone"]').fill('771111111');
    await page.locator('input[type="time"]').fill('10:00');
    await page.locator('textarea[name="reason"]').fill('Routine checkup');
    await page.getByRole('button', { name: 'Routine' }).click();
    await page.getByRole('button', { name: 'Confirm Appointment' }).click();
    
    // Check in RoutineDog
    const routineRow = page.getByRole('row', { name: /RoutineDog/i }).last();
    await routineRow.getByTestId('btn-check-in').click();
    
    // Confirm no badge on routine queue item
    await expect(routineRow.locator('text=EMERGENCY')).not.toBeVisible();
    await expect(routineRow.locator('text=URGENT')).not.toBeVisible();

    // 2. Create Non-Emergency Appointment
    await page.getByTestId('btn-new-appointment').click();
    await page.locator('input[name="petName"]').fill('UrgentDog');
    await page.locator('input[name="ownerName"]').fill('Jane Doe');
    await page.locator('input[name="ownerPhone"]').fill('772222222');
    await page.locator('input[type="time"]').fill('11:00');
    await page.locator('textarea[name="reason"]').fill('Ear infection');
    await page.getByRole('button', { name: 'Non-Emergency' }).click();
    await page.getByRole('button', { name: 'Confirm Appointment' }).click();

    // Confirm amber URGENT badge
    const urgentRow = page.getByRole('row', { name: /UrgentDog/i }).last();
    await expect(urgentRow.locator('text=URGENT')).toBeVisible();

    // Check in UrgentDog
    await urgentRow.getByTestId('btn-check-in').click();

    // 3. Emergency Intake
    await page.getByRole('button', { name: '⚡ Emergency Intake' }).click();
    await page.getByPlaceholder('e.g. Buddy').fill('Buddy');
    await page.getByPlaceholder('e.g. Hit by vehicle').fill('Hit by car');
    await page.getByRole('button', { name: 'Create Emergency Intake' }).click();

    // 4. Confirm Buddy is at the TOP of the queue with rose EMERGENCY badge
    const buddyRow = page.getByRole('row', { name: /Buddy/i }).last();
    await expect(buddyRow.getByText('EMERGENCY', { exact: true })).toBeVisible();
    
    // Verify exact queue order in TODAY'S APPOINTMENTS
    // We get all rows in the first table
    const table = page.locator('table').first();
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    const rowTexts = await rows.allInnerTexts();
    console.log('--- QUEUE ORDER ---');
    console.log(rowTexts.join('\n\n'));
    console.log('-------------------');

    expect(rowTexts[0]).toContain('Buddy');
    expect(rowTexts[0]).toContain('EMERGENCY');
    expect(rowTexts[1]).toContain('UrgentDog');
    expect(rowTexts[1]).toContain('URGENT');
    expect(rowTexts[2]).toContain('RoutineDog');

    // 5. Confirm emergencyBackfillRequired flag on record
    const hasFlag = await page.evaluate(async () => {
      let found = false;
      await (window as any)._db.appointments.iterate((apt: any) => {
        if (apt.petName === 'Buddy' && apt.emergencyBackfillRequired === true) {
          found = true;
        }
      });
      return found;
    });
    expect(hasFlag).toBe(true);
  });
});
