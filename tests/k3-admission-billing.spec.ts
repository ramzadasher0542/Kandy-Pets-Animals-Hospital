import { test, expect } from './fixtures';

async function login(page: any) {
  // Step 32: Supabase Auth is the only login; the DEV test-auth stub in
  // fixtures.ts signs the harness in automatically, so no PIN flow is needed.
  await page.getByTestId('nav-boarding').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('nav-boarding').click();
}

test.describe('K-3 — Admission vs Boarding billing + deposit calculator', () => {
  test.setTimeout(120_000);

  test('deposit flat, badges, doctor rounds, discharge settle math', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('PAGE_ERROR: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('[SyncEngine]') && !m.text().includes('status of 400')) errors.push('CONSOLE_ERROR: ' + m.text()); });

    await page.goto('http://localhost:3000/');
    await login(page);

    // Ensure persisted config carries the new field (simulates a fresh/migrated install
    // where auth.ts default 1500000 applies). Existing installs fall back at runtime.
    await page.evaluate(async () => {
      // @ts-ignore
      const db = (window as any)._db;
      const cfg: any = (await db.system.getItem('config')) || {};
      if (cfg.defaultDepositCents == null) {
        cfg.defaultDepositCents = 1500000;
        await db.system.setItem('config', cfg);
      }
    });

    // Seed clients + pets for a BOARDING pet and an ADMISSION pet
    await page.evaluate(async () => {
      // @ts-ignore
      const db = (window as any)._db;
      await db.clients.setItem('client_k3', {
        client_id: 'client_k3', primary_phone: '+94 772222222', full_name: 'K3 Owner',
        email_address: '', physical_address: '', communication_preference: 'none',
        account_balance: 0, lifetime_value: 0, client_status: 'active', administrative_notes: ''
      });
      await db.pets.setItem('k3_pet_board', { id: 'k3_pet_board', clientId: 'client_k3', name: 'K3Boarder', petType: 'Canine', breed: 'Beagle', weight: 12, sex: 'M', age: '2y' });
      await db.pets.setItem('k3_pet_adm', { id: 'k3_pet_adm', clientId: 'client_k3', name: 'K3Admit', petType: 'Canine', breed: 'Boxer', weight: 25, sex: 'F', age: '4y' });
    });

    await page.reload();
    await login(page);

    // Read defaultDepositCents from live config (now persisted)
    const depositCents = await page.evaluate(async () => {
      // @ts-ignore
      const cfg: any = await (window as any)._db.system.getItem('config');
      return cfg?.defaultDepositCents;
    });
    console.log('CONFIG defaultDepositCents:', depositCents);

    // ---- 2. BOARDING intake (Kennel 1) ----
    // Click the empty Kennel 1 cage. Empty cages have text "Kennel 1" + "Empty"
    await page.getByText('Kennel 1', { exact: true }).click();
    await page.getByPlaceholder('Search by Patient Name...').fill('K3Boarder');
    // Pick checkout date = tomorrow
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    await page.locator('input[type="date"]').fill(tomorrow);
    await page.getByTestId('estimated-stay-input').fill('2');
    // Admission fee inputs must NOT be visible in standard boarding
    const admissionFeesVisibleBoarding = await page.getByTestId('admission-fees').isVisible().catch(() => false);
    // Deposit display
    const depositText = await page.getByTestId('deposit-display').innerText();
    console.log('BOARDING deposit display:', depositText.replace(/\n/g, ' | '));
    console.log('BOARDING admission-fees visible (expect false):', admissionFeesVisibleBoarding);

    await page.locator('button', { hasText: 'Initiate Booking Process' }).click();
    // Deposit guard modal
    await expect(page.getByRole('heading', { name: 'Mandatory Admission Deposit' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'Collect & Lock Cage' }).click();
    await page.waitForTimeout(800);

    // Confirm BOARDING badge + no doctor round button
    const boardBadge = await page.getByTestId('type-badge-Kennel 1').innerText();
    const doctorBtnBoard = await page.getByTestId('doctor-round-btn-Kennel 1').isVisible().catch(() => false);
    console.log('BOARDING badge:', boardBadge, '| doctor-round btn visible (expect false):', doctorBtnBoard);

    // ---- 3. ADMISSION intake (Kennel 2) ----
    await page.getByText('Kennel 2', { exact: true }).click();
    await page.getByPlaceholder('Search by Patient Name...').fill('K3Admit');
    await page.locator('input[type="date"]').fill(tomorrow);
    await page.getByTestId('estimated-stay-input').fill('3');
    // Switch to Medical (Admission)
    await page.locator('button', { hasText: 'Medical' }).click();
    const admissionFeesVisibleAdm = await page.getByTestId('admission-fees').isVisible().catch(() => false);
    console.log('ADMISSION admission-fees visible (expect true):', admissionFeesVisibleAdm);
    await page.getByTestId('doctor-fee-input').fill('5000');   // Rs.5000/round
    await page.getByTestId('cleaning-fee-input').fill('1000'); // Rs.1000/day
    const admDepositText = await page.getByTestId('deposit-display').innerText();
    console.log('ADMISSION deposit display:', admDepositText.replace(/\n/g, ' | '));

    await page.locator('button', { hasText: 'Initiate Booking Process' }).click();
    await expect(page.getByRole('heading', { name: 'Mandatory Admission Deposit' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'Collect & Lock Cage' }).click();
    await page.waitForTimeout(800);

    const admBadge = await page.getByTestId('type-badge-Kennel 2').innerText();
    console.log('ADMISSION badge:', admBadge);

    // ---- 4. Log Doctor Round twice on the admission cage ----
    const chargesBefore = await page.getByTestId('charges-Kennel 2').innerText();
    console.log('ADMISSION charges before rounds:', chargesBefore);
    await page.getByTestId('doctor-round-btn-Kennel 2').click();
    await page.waitForTimeout(500);
    await page.getByTestId('doctor-round-btn-Kennel 2').click();
    await page.waitForTimeout(700);
    const chargesAfter2 = await page.getByTestId('charges-Kennel 2').innerText();
    const balanceAfter2 = await page.getByTestId('balance-Kennel 2').innerText();
    const roundBtnLabel = await page.getByTestId('doctor-round-btn-Kennel 2').innerText();
    console.log('ADMISSION after 2 rounds — charges:', chargesAfter2, '| balance:', balanceAfter2, '| round btn:', roundBtnLabel);

    // Read DB truth for the admission record
    const admRec = await page.evaluate(async () => {
      // @ts-ignore
      const db = (window as any)._db;
      const all: any[] = [];
      await db.boardingRecords.iterate((v: any) => { if (v?.petId === 'k3_pet_adm' && v.status === 'active') all.push(v); });
      return all[0];
    });
    console.log('ADMISSION record billingItems:', JSON.stringify(admRec?.billingItems));
    console.log('ADMISSION depositAmountCents:', admRec?.depositAmountCents, 'totalChargesCents:', admRec?.totalChargesCents, 'doctorFeePerVisitCents:', admRec?.doctorFeePerVisitCents, 'cleaningFeePerDayCents:', admRec?.cleaningFeePerDayCents, 'estimatedStayDays:', admRec?.estimatedStayDays);

    // ---- 5. Discharge & Settle with refund (charges < deposit) ----
    await page.getByTestId('discharge-settle-btn-Kennel 2').click();
    await expect(page.getByTestId('confirm-settle-btn')).toBeVisible({ timeout: 4000 });
    const settleDeposit = await page.getByTestId('settle-deposit').innerText();
    const settleCharges = await page.getByTestId('settle-charges').innerText();
    const settleBalance = await page.getByTestId('settle-balance').innerText();
    console.log('SETTLE (refund case) — deposit:', settleDeposit, '| charges:', settleCharges, '| balance:', settleBalance);
    await page.getByTestId('confirm-settle-btn').click();
    await page.waitForTimeout(800);
    // Cage should now be empty again
    const admCageEmptied = await page.getByTestId('type-badge-Kennel 2').isVisible().catch(() => false);
    console.log('ADMISSION cage emptied after settle (expect false badge):', admCageEmptied);

    // ---- 6. Overshoot deposit → additional charges ----
    // New admission in Kennel 3, high doctor fee, log enough rounds to exceed deposit
    await page.getByText('Kennel 3', { exact: true }).click();
    await page.getByPlaceholder('Search by Patient Name...').fill('K3Admit');
    await page.locator('input[type="date"]').fill(tomorrow);
    await page.locator('button', { hasText: 'Medical' }).click();
    await page.getByTestId('doctor-fee-input').fill('9000'); // Rs.9000/round
    await page.locator('button', { hasText: 'Initiate Booking Process' }).click();
    await expect(page.getByRole('heading', { name: 'Mandatory Admission Deposit' })).toBeVisible({ timeout: 5000 });
    await page.locator('button', { hasText: 'Collect & Lock Cage' }).click();
    await page.waitForTimeout(800);
    // deposit is Rs.15,000 → 2 rounds = 18,000 > deposit
    await page.getByTestId('doctor-round-btn-Kennel 3').click();
    await page.waitForTimeout(400);
    await page.getByTestId('doctor-round-btn-Kennel 3').click();
    await page.waitForTimeout(600);
    const bal3 = await page.getByTestId('balance-Kennel 3').innerText();
    console.log('OVERSHOOT balance on card:', bal3);
    await page.getByTestId('discharge-settle-btn-Kennel 3').click();
    await expect(page.getByTestId('confirm-settle-btn')).toBeVisible({ timeout: 4000 });
    const oShoot = await page.getByTestId('settle-balance').innerText();
    console.log('OVERSHOOT settle balance (expect Collect additional):', oShoot);
    await page.getByTestId('confirm-settle-btn').click();
    await page.waitForTimeout(700);

    // Verify additional_charges item written
    const overRec = await page.evaluate(async () => {
      // @ts-ignore
      const db = (window as any)._db;
      let found: any = null;
      await db.boardingRecords.iterate((v: any) => { if (v?.cageNumber === 'Kennel 3' && v.status === 'discharged') found = v; });
      return found;
    });
    console.log('OVERSHOOT record billingItems:', JSON.stringify(overRec?.billingItems));

    console.log('CONSOLE/PAGE ERRORS:', errors.slice(0, 20));

    // ---------- ASSERTIONS ----------
    expect(depositCents).toBe(1500000);
    expect(depositText).toContain('15,000');
    expect(admissionFeesVisibleBoarding).toBe(false);
    expect(boardBadge.toUpperCase()).toContain('BOARDING');
    expect(doctorBtnBoard).toBe(false);
    expect(admissionFeesVisibleAdm).toBe(true);
    expect(admBadge.toUpperCase()).toContain('ADMISSION');
    // 2 rounds × Rs.5000 = Rs.10,000 charges
    expect(chargesAfter2).toContain('10000.00');
    expect(roundBtnLabel).toContain('(2)');
    expect(admRec.depositAmountCents).toBe(1500000);
    expect(admRec.doctorFeePerVisitCents).toBe(500000);
    expect(admRec.cleaningFeePerDayCents).toBe(100000);
    expect(admRec.billingItems.filter((i: any) => i.itemId === 'doctor_round').length).toBe(2);
    // refund = 15000 - 10000 = 5000
    expect(settleBalance).toContain('5000.00');
    expect(admCageEmptied).toBe(false);
    // overshoot: 2 × 9000 = 18000 > 15000 → collect 3000 additional
    expect(oShoot).toContain('3000.00');
    expect(overRec.billingItems.some((i: any) => i.itemId === 'additional_charges' && i.price === 300000)).toBe(true);
    expect(errors).toEqual([]);
  });
});
