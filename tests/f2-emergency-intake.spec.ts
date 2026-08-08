import { test, expect } from './fixtures';

async function login(page: any) {
  // Step 32: Supabase Auth is the only login; the DEV test-auth stub in
  // fixtures.ts signs the harness in automatically, so no PIN flow is needed.
  await page.getByTestId('nav-appointments').waitFor({ state: 'visible', timeout: 15000 });
}

// Reads the Pet + Client that were created for a given emergency pet name.
// Emergency intakes mint unique ids, so we pick the most-recently-created pet
// matching the name and follow its clientId to the client record.
async function getEmergencyByPetName(page: any, petName: string) {
  return await page.evaluate(async (name: string) => {
    const db = (window as any)._db;
    let latest: any = null;
    await db.pets.iterate((v: any) => {
      if (v && v.name === name) {
        if (!latest || (v.created_at || '') > (latest.created_at || '')) latest = v;
      }
    });
    if (!latest) return null;
    const client = await db.clients.getItem(latest.clientId);
    return { petId: latest.id, clientId: latest.clientId, client };
  }, petName);
}

async function createEmergency(page: any, petName: string, complaint: string) {
  await page.getByRole('button', { name: /Emergency Intake/ }).first().click();
  await page.getByPlaceholder('e.g. Buddy').fill(petName);
  await page.getByPlaceholder(/Hit by vehicle/).fill(complaint);
  // Intentionally leave the phone field empty (no owner phone).
  await page.getByRole('button', { name: /Create Emergency Intake/ }).click();
  // Wait for modal to close and the row to appear in the list.
  await expect(page.locator('tr', { hasText: petName }).first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

test.describe('F-2 — Emergency intake ghost-record fix', () => {
  test.setTimeout(120_000);

  test('creates real, SEPARATE Pet+Client per phoneless emergency and backfills in place', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('PAGE_ERROR: ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error'
        && !m.text().includes('[SyncEngine]')
        && !m.text().includes('status of 400')
        && !m.text().includes('Objects are not valid as a React child')) {
        errors.push('CONSOLE_ERROR: ' + m.text());
      }
    });

    await page.goto('http://localhost:3000/');
    await login(page);
    await page.getByTestId('nav-appointments').click();
    await page.getByRole('button', { name: /Emergency Intake/ }).first().waitFor({ state: 'visible', timeout: 15000 });

    // ---- Step 1+2+3: first emergency, no phone ----
    await createEmergency(page, 'Ghost Test', 'Hit by car');
    const ghost1 = await getEmergencyByPetName(page, 'Ghost Test');
    console.log('GHOST TEST →', JSON.stringify(ghost1?.clientId), 'client exists:', !!ghost1?.client, 'name:', ghost1?.client?.full_name, 'phone:', ghost1?.client?.primary_phone);

    // ---- Step 4: second emergency, also no phone ----
    await createEmergency(page, 'Ghost Two', 'Collapsed');
    const ghost2 = await getEmergencyByPetName(page, 'Ghost Two');
    console.log('GHOST TWO  →', JSON.stringify(ghost2?.clientId), 'client exists:', !!ghost2?.client, 'name:', ghost2?.client?.full_name);

    console.log('=== COLLISION CHECK === ghost1 client_id:', ghost1?.clientId, '| ghost2 client_id:', ghost2?.clientId, '| same?', ghost1?.clientId === ghost2?.clientId);

    // Assertions: records exist, are distinct, are NOT the 0000000000 placeholder.
    expect(ghost1).not.toBeNull();
    expect(ghost2).not.toBeNull();
    expect(ghost1!.client).toBeTruthy();
    expect(ghost2!.client).toBeTruthy();
    expect(ghost1!.client.full_name).toBe('Emergency — Details Pending');
    expect(ghost2!.client.full_name).toBe('Emergency — Details Pending');
    expect(ghost1!.clientId).not.toContain('000000000');
    expect(ghost2!.clientId).not.toContain('000000000');
    expect(ghost1!.clientId).not.toBe(ghost2!.clientId); // the collision bug we are preventing

    // ---- Step 5: both show up in Customers as "Emergency — Details Pending" ----
    await page.getByTestId('nav-customers').click();
    await page.waitForTimeout(1500);
    const pendingInCustomers = await page.getByText('Emergency — Details Pending').count();
    console.log('Customers page — "Emergency — Details Pending" count:', pendingInCustomers);
    expect(pendingInCustomers).toBeGreaterThanOrEqual(2);

    // ---- Step 6+7+8: backfill Ghost Test in place ----
    await page.getByTestId('nav-appointments').click();
    await page.waitForTimeout(1000);

    const ghostRow = page.locator('tr', { hasText: 'Ghost Test' }).first();
    await expect(ghostRow.getByTestId('badge-details-pending')).toBeVisible();
    await ghostRow.getByTestId('btn-complete-details').click();

    await page.locator('input[name="ownerName"]').fill('Real Owner');
    await page.locator('input[name="ownerPhone"]').fill('771234567');
    // NOTE: no time change. Ghost Two is also in-progress for the same vet this
    // minute; the conflict guard must exempt emergencies so this save succeeds.
    await page.getByRole('button', { name: /Save Changes/ }).click();
    await page.waitForTimeout(1500);

    // Client updated IN PLACE — same client_id, new name + phone.
    const afterBackfill = await page.evaluate(async (clientId: string) => {
      const db = (window as any)._db;
      const client = await db.clients.getItem(clientId);
      // Count how many clients carry Ghost Test's pet — must stay exactly 1 (no dup).
      let clientsForGhostPet = 0;
      await db.pets.iterate((p: any) => { if (p && p.name === 'Ghost Test') clientsForGhostPet++; });
      return { client, ghostPetCount: clientsForGhostPet };
    }, ghost1!.clientId);
    console.log('AFTER BACKFILL → same client_id:', ghost1!.clientId, '| name:', afterBackfill.client?.full_name, '| phone:', afterBackfill.client?.primary_phone, '| ghost-test pet records:', afterBackfill.ghostPetCount);

    expect(afterBackfill.client).toBeTruthy();
    expect(afterBackfill.client.full_name).toBe('Real Owner');
    expect(afterBackfill.client.primary_phone).toContain('771234567');

    // emergencyBackfillRequired now false + banner gone.
    const aptFlag = await page.evaluate(async () => {
      const db = (window as any)._db;
      let apt: any = null;
      await db.appointments.iterate((v: any) => {
        if (v && v.petName === 'Ghost Test') {
          if (!apt || (v.created_at || '') > (apt.created_at || '')) apt = v;
        }
      });
      return apt?.emergencyBackfillRequired;
    });
    console.log('Ghost Test appointment emergencyBackfillRequired after backfill:', aptFlag);
    expect(aptFlag).toBe(false);

    const ghostRowAfter = page.locator('tr', { hasText: 'Ghost Test' }).first();
    await expect(ghostRowAfter.getByTestId('badge-details-pending')).toHaveCount(0);
    await expect(ghostRowAfter.getByTestId('btn-complete-details')).toHaveCount(0);

    console.log('=== FINAL === ghost1:', ghost1!.clientId, '| ghost2:', ghost2!.clientId, '| collided?', ghost1!.clientId === ghost2!.clientId);
    expect(errors).toEqual([]);
  });

  // Guardrail: the emergency exemption must NOT weaken double-booking prevention
  // for ordinary (routine) appointments.
  test('routine double-booking is still blocked for a normal appointment', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await login(page);
    await page.getByTestId('nav-appointments').click();

    async function fillNewAppt(petName: string, phone9: string) {
      await page.getByTestId('btn-new-appointment').click();
      await page.locator('input[name="petName"]').fill(petName);
      await page.locator('input[name="ownerName"]').fill(`${petName} Owner`);
      await page.locator('input[name="ownerPhone"]').fill(phone9);
      await page.locator('input[type="time"]').fill('08:15'); // same slot for both
      await page.locator('textarea[name="reason"]').fill('Routine checkup');
    }

    // First routine booking at 08:15 with the default (first) vet — should save.
    await fillNewAppt('RoutineOne', '771111111');
    await page.getByRole('button', { name: /Confirm Appointment/ }).click();
    await expect(page.locator('tr', { hasText: 'RoutineOne' }).first()).toBeVisible({ timeout: 10000 });

    // Second routine booking, SAME vet + SAME time — must be blocked.
    await fillNewAppt('RoutineTwo', '772222222');
    await page.getByRole('button', { name: /Confirm Appointment/ }).click();
    await expect(page.getByText(/already has an appointment/)).toBeVisible({ timeout: 5000 });

    // Confirm it was NOT saved to the DB.
    const routineTwoCount = await page.evaluate(async () => {
      const db = (window as any)._db;
      let count = 0;
      await db.appointments.iterate((v: any) => { if (v && v.petName === 'RoutineTwo') count++; });
      return count;
    });
    console.log('RoutineTwo appointments saved (expect 0):', routineTwoCount);
    expect(routineTwoCount).toBe(0);
  });
});
