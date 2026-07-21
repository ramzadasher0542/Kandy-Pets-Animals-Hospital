const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`); });
  page.on('pageerror', err => { errors.push(`[pageerror] ${err.message}\n${err.stack || ''}`); });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Clear previous DB and seed correct data
  await page.evaluate(async () => {
    const db = window._db;

    // Clear all stores first
    await db.inventory.clear();
    await db.invoices.clear();
    await db.staffProfiles.clear();
    await db.timeEntries.clear();
    await db.scheduleEntries.clear();
    await db.payslips.clear();
    await db.users.clear();
    await db.shiftReconciliations.clear();
    await db.cashAdjustments.clear();
    await db.clients.clear();
    await db.deletionAudit.clear();
    await db.appointments.clear();

    const todayISO = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    // Staff profiles
    await db.staffProfiles.setItem('sp-001', {
      id: 'sp-001', userId: 'user-001', fullName: 'Dr. Amal Silva',
      position: 'Senior Veterinarian', department: 'Clinical',
      employmentType: 'monthly', monthlySalary: 15000000,
      hireDate: '2024-03-15', active: true,
      created_at: now, updated_at: now
    });

    // Time entries with CORRECT field names
    await db.timeEntries.setItem('te-001', {
      id: 'te-001', staffId: 'sp-001',
      date: todayISO,
      clockIn: new Date(Date.now() - 28800000).toISOString(),
      clockOut: now,
      durationMinutes: 480, source: 'manager', enteredBy: 'admin-001',
      created_at: now, updated_at: now, is_deleted: false, _dirty: false
    });

    // Schedule entries with CORRECT field names
    const shiftStartDate = new Date();
    shiftStartDate.setHours(8, 0, 0, 0);
    const shiftEndDate = new Date();
    shiftEndDate.setHours(17, 0, 0, 0);
    await db.scheduleEntries.setItem('sched-001', {
      id: 'sched-001', staffId: 'sp-001',
      shiftStart: shiftStartDate.toISOString(),
      shiftEnd: shiftEndDate.toISOString(),
      role: 'Vet on Call', notes: 'Regular shift',
      created_at: now, updated_at: now, is_deleted: false, _dirty: false
    });

    // Payslips with correct cents-based fields
    await db.payslips.setItem('ps-001', {
      id: 'ps-001', staffId: 'sp-001',
      periodStart: '2026-06-01', periodEnd: '2026-06-30',
      grossPayCents: 15500000, netPayCents: 14000000,
      deductions: [{ id: 'd1', label: 'EPF', amountCents: 1200000, isPercentage: false }],
      additions: [{ id: 'a1', label: 'OT', amountCents: 500000 }],
      totalMinutes: 10560,
      status: 'paid', paidDate: '2026-07-05',
      generatedBy: 'admin-001',
      created_at: now, updated_at: now, is_deleted: false, _dirty: false
    });

    // Users
    await db.users.setItem('user-001', {
      id: 'user-001', name: 'Dr. Amal Silva', username: 'dr_silva',
      role: 'veterinarian', avatarColor: 'bg-green-600 text-white border-green-700',
      pin: 'a1b2c3d4'
    });

    console.log('[SEED] Staff data seeded with correct field names');
  });

  // Reload
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // Login
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '5692');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForTimeout(2000);

  // Navigate to Staff
  errors.length = 0;
  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('staff & payroll')) {
        btn.click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);

  const crashed = await page.evaluate(() => document.body.innerText.includes('Recovery Mode Intercepted'));
  if (crashed) {
    console.log('[CRASH] Staff panel crashed with correct data');
    errors.forEach(e => console.log(e));
  } else {
    console.log('[OK] Staff panel rendered successfully with correct data');
  }

  // Now test with a time entry that has NO date field (simulating corrupt data)
  console.log('\n--- Testing with corrupt time entry (missing date) ---');
  await page.evaluate(async () => {
    const db = window._db;
    await db.timeEntries.setItem('te-corrupt', {
      id: 'te-corrupt', staffId: 'sp-001',
      clockIn: new Date(Date.now() - 3600000).toISOString(),
      clockOut: new Date().toISOString(),
      durationMinutes: 60, source: 'manager', enteredBy: 'admin-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      is_deleted: false, _dirty: false
    });
  });

  // Reload and navigate to staff again
  errors.length = 0;
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '5692');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
    const buttons = document.querySelectorAll('button');
    for (const btn of buttons) {
      if (btn.textContent?.toLowerCase().includes('staff & payroll')) {
        btn.click();
        return;
      }
    }
  });
  await page.waitForTimeout(3000);

  const crashed2 = await page.evaluate(() => document.body.innerText.includes('Recovery Mode Intercepted'));
  if (crashed2) {
    console.log('[CRASH] Staff panel crashes with corrupt time entry');
    errors.forEach(e => console.log(e));
  } else {
    console.log('[OK] Staff panel handles corrupt time entry OK');
  }

  await browser.close();
})();
