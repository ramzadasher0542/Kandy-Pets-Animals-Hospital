const { chromium } = require('playwright');

const PORT = 3099;
const PANELS = ['inventory', 'invoices', 'shift', 'reports', 'staff', 'settings'];
const PANEL_LABELS = {
  inventory: 'inventory', invoices: 'invoices', shift: 'shift & drawer',
  reports: 'reports', staff: 'staff & payroll', settings: 'settings'
};

async function nav(page, panel) {
  return page.evaluate((t) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.toLowerCase().includes(t)) { btn.click(); return true; }
    }
    return false;
  }, PANEL_LABELS[panel]);
}

async function login(page) {
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '5692');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForTimeout(2000);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => { errors.push(`[pageerror] ${err.message}`); });

  let allPassed = true;
  const fail = (msg) => { console.log(`[FAIL] ${msg}`); allPassed = false; };
  const pass = (msg) => { console.log(`[PASS] ${msg}`); };

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ---- SEED ----
  await page.evaluate(async () => {
    const db = window._db;
    const now = new Date().toISOString();
    const todayISO = now.slice(0, 10);

    await db.inventory.clear(); await db.invoices.clear(); await db.staffProfiles.clear();
    await db.timeEntries.clear(); await db.scheduleEntries.clear(); await db.payslips.clear();
    await db.users.clear(); await db.shiftReconciliations.clear(); await db.cashAdjustments.clear();
    await db.clients.clear(); await db.deletionAudit.clear(); await db.appointments.clear();

    // Inventory — no cost field on first item
    await db.inventory.setItem('inv-001', { id: 'inv-001', name: 'Amoxicillin', sku: 'AMX', category: 'medication', price: 450, stock: 120, minStock: 10, unit: 'tablets', created_at: now, updated_at: now });
    await db.inventory.setItem('inv-002', { id: 'inv-002', name: 'Collar', sku: 'COL', category: 'accessories', price: 1200, cost: 800, stock: 35, minStock: 5, unit: 'pcs', created_at: now, updated_at: now });

    // Invoice
    await db.invoices.setItem('INV-001', { id: 'INV-001', date: now, ownerName: 'Kamal', petName: 'Bruno', patientId: 'p1', ownerPhone: '0771234567', items: [{ itemId: 'inv-001', sku: 'AMX', name: 'Amoxicillin', category: 'medication', quantity: 2, unitPrice: 450, totalPrice: 900 }], subtotal: 900, tax: 0, discount: 0, sales_total: 900, paymentMethod: 'cash', paymentStatus: 'paid', splitPayments: [], createdBy: 'admin', created_at: now, updated_at: now });

    // Shift
    await db.system.setItem('active_shift', { id: 'sh-1', openedAt: now, openedBy: 'admin', openedByName: 'Admin', openingFloat: 5000 });
    await db.shiftReconciliations.setItem('sr-1', { id: 'sr-1', timestamp: now, userId: 'admin', userName: 'Admin', openingFloat: 5000, cashSales: 900, expectedClosing: 5900, actualClosing: 5900, discrepancy: 0, status: 'balanced', created_at: now, updated_at: now });

    // Staff
    await db.staffProfiles.setItem('sp-1', { id: 'sp-1', userId: 'u1', fullName: 'Dr. Silva', position: 'Vet', department: 'Clinical', employmentType: 'monthly', monthlySalary: 15000000, hireDate: '2024-01-01', active: true, created_at: now, updated_at: now });
    // Time entry WITH date + one WITHOUT date (old data)
    await db.timeEntries.setItem('te-1', { id: 'te-1', staffId: 'sp-1', date: todayISO, clockIn: new Date(Date.now()-28800000).toISOString(), clockOut: now, durationMinutes: 480, source: 'manager', enteredBy: 'admin', created_at: now, updated_at: now, is_deleted: false, _dirty: false });
    await db.timeEntries.setItem('te-nodate', { id: 'te-nodate', staffId: 'sp-1', clockIn: new Date(Date.now()-3600000).toISOString(), clockOut: now, durationMinutes: 60, source: 'manager', enteredBy: 'admin', created_at: now, updated_at: now, is_deleted: false, _dirty: false });
    // Schedule
    const ss = new Date(); ss.setHours(8,0,0,0);
    const se = new Date(); se.setHours(17,0,0,0);
    await db.scheduleEntries.setItem('sc-1', { id: 'sc-1', staffId: 'sp-1', shiftStart: ss.toISOString(), shiftEnd: se.toISOString(), role: 'Vet', created_at: now, updated_at: now, is_deleted: false, _dirty: false });
    // Payslip
    await db.payslips.setItem('ps-1', { id: 'ps-1', staffId: 'sp-1', periodStart: '2026-06-01', periodEnd: '2026-06-30', grossPayCents: 15000000, netPayCents: 13500000, deductions: [{ id: 'd1', label: 'EPF', amountCents: 1500000 }], totalMinutes: 10080, status: 'paid', generatedBy: 'admin', created_at: now, updated_at: now, is_deleted: false, _dirty: false });
    // Users
    await db.users.setItem('u1', { id: 'u1', name: 'Dr. Silva', username: 'silva', role: 'veterinarian', avatarColor: 'bg-green-600 text-white', pin: 'abc' });
    // Clients
    await db.clients.setItem('c1', { client_id: 'c1', primary_phone: '0771234567', full_name: 'Kamal', email_address: 'k@t.lk', physical_address: 'Kandy', communication_preference: 'sms', account_balance: 0, lifetime_value: 900, client_status: 'active', administrative_notes: '', created_at: now, updated_at: now });
    // Deletion audit
    await db.deletionAudit.setItem('d1', { id: 'd1', entity_type: 'client', entity_id: 'c-old', entity_name: 'Old', deleted_by: 'admin', deleted_at: now, reason: 'Dup' });
    // Appointments
    await db.appointments.setItem('a1', { id: 'a1', petName: 'Bruno', ownerName: 'Kamal', date: now, time: '10:00', type: 'checkup', status: 'completed', created_at: now, updated_at: now });
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await login(page);

  // ==== TEST 1: All 6 panels render ====
  console.log('\n===== TEST 1: All 6 panels render with data =====');
  for (const panel of PANELS) {
    errors.length = 0;
    await nav(page, panel);
    await page.waitForTimeout(2500);
    const crashed = await page.evaluate(() =>
      document.body.innerText.includes("This page couldn't load") ||
      document.body.innerText.includes("Recovery Mode Intercepted")
    );
    if (crashed) {
      fail(`${panel}: CRASHED — ${errors[0] || 'no error captured'}`);
      await nav(page, panel === 'settings' ? 'invoices' : 'settings');
      await page.waitForTimeout(1000);
    } else {
      pass(`${panel}: Rendered OK`);
    }
  }

  // ==== TEST 2: Error boundary keeps sidebar ====
  console.log('\n===== TEST 2: Error boundary behavior =====');

  // Add a deliberately crashing inventory item
  await page.evaluate(async () => {
    // localforage serializes to IndexedDB, so getter tricks won't work.
    // Instead, set price to a non-number object that will crash .toFixed()
    await window._db.inventory.setItem('inv-bomb', {
      id: 'inv-bomb', name: 'Bomb', sku: 'BOMB', category: 'medication',
      price: { broken: true }, stock: 10, minStock: 5, unit: 'pcs',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    });
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);
  await login(page);

  errors.length = 0;
  await nav(page, 'inventory');
  await page.waitForTimeout(3000);

  const errorMsg = await page.evaluate(() => document.body.innerText.includes("This page couldn't load"));
  const sidebar = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside && aside.offsetHeight > 0;
  });
  const tryAgain = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) { if (b.textContent?.includes('Try Again')) return true; }
    return false;
  });
  const goDash = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) { if (b.textContent?.includes('Go to Dashboard')) return true; }
    return false;
  });

  errorMsg ? pass('Error boundary shows "This page couldn\'t load"') : fail('Error boundary text missing');
  sidebar ? pass('Sidebar stays visible during error') : fail('Sidebar hidden during error');
  tryAgain ? pass('"Try Again" button present') : fail('"Try Again" button missing');
  goDash ? pass('"Go to Dashboard" button present') : fail('"Go to Dashboard" button missing');

  // Navigate away from crashed panel
  await nav(page, 'invoices');
  await page.waitForTimeout(2000);
  const invoicesOK = await page.evaluate(() =>
    !document.body.innerText.includes("This page couldn't load") &&
    (document.body.innerText.includes('Transactions') || document.body.innerText.includes('Invoices'))
  );
  invoicesOK ? pass('Can navigate away from crashed panel') : fail('Cannot navigate away');

  // Remove bomb
  await page.evaluate(async () => { await window._db.inventory.removeItem('inv-bomb'); });

  console.log(`\n===== RESULT: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} =====`);
  await browser.close();
  process.exit(allPassed ? 0 : 1);
})();
