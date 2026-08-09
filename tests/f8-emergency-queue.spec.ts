import { test, expect } from './fixtures';

async function login(page: any) {
  // Step 32: Supabase Auth is the only login; the DEV test-auth stub in
  // fixtures.ts signs the harness in automatically, so no PIN flow is needed.
  await page.getByTestId('nav-appointments').waitFor({ state: 'visible', timeout: 15000 });
}

async function bookAndCheckIn(page: any, petName: string, ownerName: string, phone9: string, admissionOptionLabel: string, timeSlot: string) {
  await page.getByTestId('btn-new-appointment').click();
  await page.locator('input[name="petName"]').fill(petName);
  await page.locator('input[name="ownerName"]').fill(ownerName);
  await page.locator('input[name="ownerPhone"]').fill(phone9);
  const admissionSelect = page.locator('select', { has: page.locator('option', { hasText: admissionOptionLabel }) });
  await admissionSelect.selectOption({ label: admissionOptionLabel });
  await page.locator('textarea[name="reason"]').fill('Routine visit');
  await page.locator('input[type="time"]').fill(timeSlot); // distinct slot — avoid the (correct) double-booking guard
  await page.getByRole('button', { name: /Confirm Appointment/ }).click();
  const row = page.locator('tr', { hasText: petName }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByTestId('btn-check-in').click();
  await page.waitForTimeout(500);
}

async function createEmergencyIntake(page: any, petName: string, complaint: string) {
  await page.getByRole('button', { name: /Emergency Intake/ }).first().click();
  await page.getByPlaceholder('e.g. Buddy').fill(petName);
  await page.getByPlaceholder(/Hit by vehicle/).fill(complaint);
  await page.getByRole('button', { name: /Create Emergency Intake/ }).click();
  await expect(page.locator('tr', { hasText: petName }).first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

async function getQueueSnapshot(page: any) {
  return await page.evaluate(async () => {
    const db = (window as any)._db;
    const items: any[] = [];
    await db.clinicQueue.iterate((v: any) => { if (v && !v.is_deleted && v.status === 'active') items.push(v); });
    return items;
  });
}

test.describe('F-8 — emergency urgency reaches the shared clinic queue', () => {
  test.setTimeout(180_000);

  test('urgency + emergencyBackfillRequired flow through App.tsx queue construction into every panel', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message));

    await page.goto('http://localhost:3000/');
    await login(page);
    await page.getByTestId('nav-appointments').click();
    await page.getByTestId('btn-new-appointment').waitFor({ state: 'visible', timeout: 15000 });

    const vaccName = 'F8VaccKid';
    const examName = 'F8ExamKid';
    const emergName = 'F8EmergKid';

    // 1a) routine vaccination, 1b) routine examination, 1c) emergency — in that order.
    await bookAndCheckIn(page, vaccName, 'Vacc Owner', '771110001', 'Vaccination Drop-off', '09:00');
    await bookAndCheckIn(page, examName, 'Exam Owner', '771110002', 'OPD Consultation', '09:15');
    await createEmergencyIntake(page, emergName, 'Hit by car');

    const emergApt = await page.evaluate(async (name: string) => {
      const db = (window as any)._db;
      let found: any = null;
      await db.appointments.iterate((v: any) => { if (v && v.petName === name) found = v; });
      return found;
    }, emergName);
    console.log('DEBUG emergency appointment record:', JSON.stringify(emergApt));

    // 2) Confirm the emergency's ClinicQueueItem has urgency: 'emergency'.
    await page.waitForTimeout(1500);
    const snapshot = await getQueueSnapshot(page);
    console.log('DEBUG full queue snapshot:', JSON.stringify(snapshot.map(q => ({ petName: q.petName, urgency: q.urgency, status: q.status }))));
    const emergQ = snapshot.find(q => q.petName === emergName);
    const vaccQ = snapshot.find(q => q.petName === vaccName);
    const examQ = snapshot.find(q => q.petName === examName);
    console.log('QUEUE ITEM (emergency):', JSON.stringify({ urgency: emergQ?.urgency, emergencyBackfillRequired: emergQ?.emergencyBackfillRequired, serviceType: emergQ?.serviceType }));
    console.log('QUEUE ITEM (vaccination):', JSON.stringify({ urgency: vaccQ?.urgency, serviceType: vaccQ?.serviceType }));
    console.log('QUEUE ITEM (examination):', JSON.stringify({ urgency: examQ?.urgency, serviceType: examQ?.serviceType }));
    expect(emergQ).toBeTruthy();
    expect(emergQ.urgency).toBe('emergency');
    expect(emergQ.emergencyBackfillRequired).toBe(true);
    expect(vaccQ.urgency).toBe('routine');
    expect(examQ.urgency).toBe('routine');

    // ---- 3) Panels where all three coexist (no serviceType filter): Customers, POS, Dashboard ----
    const report: Record<string, string> = {};

    // CUSTOMERS
    await page.getByTestId('nav-customers').click();
    await page.waitForTimeout(1000);
    let names = await page.locator('text=Active Clinic Queue').locator('..').locator('.font-bold.text-sm.truncate').allInnerTexts();
    report['Customers'] = names.join(' | ');
    console.log('CUSTOMERS queue order:', report['Customers']);
    expect(names[0]).toContain(emergName);
    await expect(page.getByText('Active Clinic Queue').locator('..').getByText('EMERGENCY').first()).toBeVisible();
    await expect(page.getByText('Active Clinic Queue').locator('..').getByText('⚠ DETAILS PENDING').first()).toBeVisible();

    // POS
    await page.getByTestId('nav-pos').click();
    await page.waitForTimeout(1000);
    const posSection = page.locator('text=Awaiting Checkout').locator('..');
    names = await posSection.locator('[data-testid="btn-import-ehr"] .font-black.text-sm').allInnerTexts();
    report['POS'] = names.join(' | ');
    console.log('POS queue order:', report['POS']);
    expect(names[0]).toContain(emergName);
    await expect(posSection.getByText('EMERGENCY').first()).toBeVisible();
    await expect(posSection.getByText('⚠ DETAILS PENDING').first()).toBeVisible();

    // DASHBOARD
    await page.getByTestId('nav-dashboard').click();
    await page.waitForTimeout(1000);
    const liveQueueSection = page.locator('text=Live Queue').locator('../..');
    names = (await liveQueueSection.locator('.text-sm.font-black.text-slate-800').allInnerTexts()).filter(t => !t.includes('Live Queue'));
    report['Dashboard'] = names.join(' | ');
    console.log('DASHBOARD queue order:', report['Dashboard']);
    expect(names[0]).toContain(emergName);
    await expect(liveQueueSection.getByText('EMERGENCY').first()).toBeVisible();
    await expect(liveQueueSection.getByText('⚠ DETAILS PENDING').first()).toBeVisible();

    // ---- Type-filtered panels: with ONLY these 3 patients, the emergency (serviceType
    // 'Examination') structurally cannot appear in Boarding/Grooming (Boarding/Grooming
    // only) or Laboratory (Examination + pending lab only, none seeded). Confirming that
    // honestly rather than claiming a false positive. ----
    await page.getByTestId('nav-vaccinations').click();
    await page.waitForTimeout(1000);
    const vaccSection = page.locator('text=Active Vaccination Queue').locator('..');
    const vaccVisible = await vaccSection.isVisible().catch(() => false);
    report['Vaccinations'] = vaccVisible ? (await vaccSection.locator('.font-bold.text-sm.truncate').allInnerTexts()).join(' | ') : '(empty/hidden)';
    console.log('VACCINATIONS queue (only vacc-type patients can appear):', report['Vaccinations']);
    expect(report['Vaccinations']).toContain(vaccName);
    expect(report['Vaccinations']).not.toContain(emergName); // by design — different serviceType

    await page.getByTestId('nav-boarding').click();
    await page.waitForTimeout(1000);
    const boardingHasQueue = await page.getByText('Active Boarding Queue').isVisible().catch(() => false);
    report['Boarding'] = boardingHasQueue ? 'queue section visible' : '(no queue section — none of the 3 test patients are Boarding type)';
    console.log('BOARDING:', report['Boarding']);

    await page.getByTestId('nav-grooming').click();
    await page.waitForTimeout(1000);
    const groomingHasQueue = await page.getByText('Active Grooming Queue').isVisible().catch(() => false);
    report['Grooming'] = groomingHasQueue ? 'queue section visible' : '(no queue section — none of the 3 test patients are Grooming type)';
    console.log('GROOMING:', report['Grooming']);

    await page.getByTestId('nav-laboratory').click();
    await page.waitForTimeout(1000);
    const labHasQueue = await page.getByText('Active Lab Queue').isVisible().catch(() => false);
    report['Laboratory'] = labHasQueue ? 'queue section visible' : '(no queue section — no pending lab results seeded for these patients)';
    console.log('LABORATORY:', report['Laboratory']);

    // ---- Supplementary check: seed matching-type queue entries directly so we can
    // actually exercise sortQueueByUrgency + badges inside Boarding/Grooming/Laboratory,
    // since the literal 3-patient scenario above can't reach those panels. ----
    await page.evaluate(async () => {
      const db = (window as any)._db;
      const now = Date.now();
      const mk = (id: string, name: string, serviceType: string, urgency: string, offsetMs: number) => ({
        id, petId: 'f8_' + id, petName: name, ownerName: 'Supp Owner', ownerPhone: '+94 779999999',
        appointmentId: 'f8_apt_' + id, serviceType, checkInTime: new Date(now + offsetMs).toISOString(),
        status: 'active', urgency
      });
      // Boarding: routine checked in first, emergency checked in second — emergency must sort first.
      await db.clinicQueue.setItem('f8_board_routine', mk('board_routine', 'F8BoardRoutine', 'Boarding', 'routine', 0));
      await db.clinicQueue.setItem('f8_board_emerg', mk('board_emerg', 'F8BoardEmergency', 'Boarding', 'emergency', 1000));
      // Grooming: same pattern.
      await db.clinicQueue.setItem('f8_groom_routine', mk('groom_routine', 'F8GroomRoutine', 'Grooming', 'routine', 0));
      await db.clinicQueue.setItem('f8_groom_emerg', mk('groom_emerg', 'F8GroomEmergency', 'Grooming', 'emergency', 1000));
    });
    // Laboratory also requires a pending LabResult for the petId to show in its queue.
    await page.evaluate(async () => {
      const db = (window as any)._db;
      await db.labResults.setItem('f8_lab_routine_result', { id: 'f8_lab_routine_result', petId: 'f8_lab_routine', testName: 'CBC', requestDate: new Date().toISOString(), status: 'pending' });
      await db.labResults.setItem('f8_lab_emerg_result', { id: 'f8_lab_emerg_result', petId: 'f8_lab_emerg', testName: 'CBC', requestDate: new Date().toISOString(), status: 'pending' });
      const now = Date.now();
      const mk = (id: string, name: string, urgency: string, offsetMs: number) => ({
        id, petId: 'f8_' + id, petName: name, ownerName: 'Supp Owner', ownerPhone: '+94 779999999',
        appointmentId: 'f8_apt_' + id, serviceType: 'Examination', checkInTime: new Date(now + offsetMs).toISOString(),
        status: 'active', urgency
      });
      await db.clinicQueue.setItem('f8_lab_routine', mk('lab_routine', 'F8LabRoutine', 'routine', 0));
      await db.clinicQueue.setItem('f8_lab_emerg', mk('lab_emerg', 'F8LabEmergency', 'emergency', 1000));
    });

    await page.reload();
    await login(page);

    await page.getByTestId('nav-boarding').click();
    await page.waitForTimeout(1000);
    const boardingSection = page.locator('text=Active Boarding Queue').locator('..');
    let suppNames = await boardingSection.locator('.font-bold.text-sm.truncate').allInnerTexts();
    console.log('BOARDING (seeded) order:', suppNames.join(' | '));
    expect(suppNames[0]).toContain('F8BoardEmergency');
    await expect(boardingSection.getByText('EMERGENCY').first()).toBeVisible();

    await page.getByTestId('nav-grooming').click();
    await page.waitForTimeout(1000);
    const groomingSection = page.locator('text=Active Grooming Queue').locator('..');
    suppNames = await groomingSection.locator('.font-bold.text-sm.truncate').allInnerTexts();
    console.log('GROOMING (seeded) order:', suppNames.join(' | '));
    expect(suppNames[0]).toContain('F8GroomEmergency');
    await expect(groomingSection.getByText('EMERGENCY').first()).toBeVisible();

    await page.getByTestId('nav-laboratory').click();
    await page.waitForTimeout(1000);
    const labSection = page.locator('text=Active Lab Queue').locator('..');
    suppNames = await labSection.locator('.font-bold.text-sm.truncate').allInnerTexts();
    console.log('LABORATORY (seeded) order:', suppNames.join(' | '));
    expect(suppNames[0]).toContain('F8LabEmergency');
    await expect(labSection.getByText('EMERGENCY').first()).toBeVisible();

    // ---- 4+5) Complete Details for the real emergency, confirm DETAILS PENDING
    // disappears everywhere but EMERGENCY badge remains ----
    await page.getByTestId('nav-appointments').click();
    await page.waitForTimeout(1000);
    const emergRow = page.locator('tr', { hasText: emergName }).first();
    await emergRow.getByTestId('btn-complete-details').click();
    await page.locator('input[name="ownerName"]').fill('Real Emerg Owner');
    await page.locator('input[name="ownerPhone"]').fill('771234999');
    await page.getByRole('button', { name: /Save Changes/ }).click();
    await page.waitForTimeout(1000);

    const afterBackfillQ = (await getQueueSnapshot(page)).find(q => q.petName === emergName);
    console.log('QUEUE ITEM after Complete Details:', JSON.stringify({ urgency: afterBackfillQ?.urgency, emergencyBackfillRequired: afterBackfillQ?.emergencyBackfillRequired }));
    expect(afterBackfillQ.urgency).toBe('emergency');
    expect(afterBackfillQ.emergencyBackfillRequired).toBe(false);

    await page.getByTestId('nav-customers').click();
    await page.waitForTimeout(1000);
    const custQueueSection = page.getByText('Active Clinic Queue').locator('..');
    const pendingGoneCustomers = await custQueueSection.getByText('⚠ DETAILS PENDING').count();
    const emergBadgeStillCustomers = await custQueueSection.getByText('EMERGENCY').count();
    console.log('CUSTOMERS after backfill — DETAILS PENDING count:', pendingGoneCustomers, '| EMERGENCY badge count:', emergBadgeStillCustomers);
    expect(pendingGoneCustomers).toBe(0);
    expect(emergBadgeStillCustomers).toBeGreaterThan(0);

    await page.getByTestId('nav-pos').click();
    await page.waitForTimeout(1000);
    const posQueueSection = page.locator('text=Awaiting Checkout').locator('..');
    const pendingGonePos = await posQueueSection.getByText('⚠ DETAILS PENDING').count();
    const emergBadgeStillPos = await posQueueSection.getByText('EMERGENCY').count();
    console.log('POS after backfill — DETAILS PENDING count:', pendingGonePos, '| EMERGENCY badge count:', emergBadgeStillPos);
    expect(pendingGonePos).toBe(0);
    expect(emergBadgeStillPos).toBeGreaterThan(0);

    await page.getByTestId('nav-dashboard').click();
    await page.waitForTimeout(1000);
    const dashQueueSection = page.locator('text=Live Queue').locator('../..');
    const pendingGoneDash = await dashQueueSection.getByText('⚠ DETAILS PENDING').count();
    const emergBadgeStillDash = await dashQueueSection.getByText('EMERGENCY').count();
    console.log('DASHBOARD after backfill — DETAILS PENDING count:', pendingGoneDash, '| EMERGENCY badge count:', emergBadgeStillDash);
    expect(pendingGoneDash).toBe(0);
    expect(emergBadgeStillDash).toBeGreaterThan(0);

    console.log('=== FULL ORDER REPORT ===', JSON.stringify(report, null, 2));
    console.log('PAGE ERRORS:', JSON.stringify(errors));
    expect(errors).toEqual([]);
  });
});
