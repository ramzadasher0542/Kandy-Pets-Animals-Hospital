const { chromium } = require('playwright');

const PANELS = ['inventory', 'invoices', 'shift', 'reports', 'staff', 'settings'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const allErrors = {};
  PANELS.forEach(p => { allErrors[p] = []; });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      allErrors._current && allErrors._current.push(`[console.error] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    allErrors._current && allErrors._current.push(`[pageerror] ${err.message}\n${err.stack || ''}`);
  });

  console.log('--- Navigating to app ---');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ---- SEED DATA ----
  console.log('--- Seeding realistic data into IndexedDB ---');
  await page.evaluate(async () => {
    const db = window._db;
    if (!db) throw new Error('window._db not available');

    // 1. Inventory items — WITHOUT cost field to trigger the bug
    const inv1 = {
      id: 'inv-001', name: 'Amoxicillin 250mg', sku: 'AMX-250',
      category: 'medication', price: 450, stock: 120, minStock: 10,
      unit: 'tablets',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const inv2 = {
      id: 'inv-002', name: 'Flea Collar Large', sku: 'FC-LG',
      category: 'accessories', price: 1200, cost: 800, stock: 35, minStock: 5,
      unit: 'pieces',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const inv3 = {
      id: 'inv-003', name: 'Consultation', sku: 'CONS-001',
      category: 'service', price: 1500, stock: 0, minStock: 0,
      unit: 'session',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.inventory.setItem('inv-001', inv1);
    await db.inventory.setItem('inv-002', inv2);
    await db.inventory.setItem('inv-003', inv3);

    // 2. Invoices with sales_total
    const invoice1 = {
      id: 'INV-20260714-001', date: new Date().toISOString(),
      ownerName: 'Kamal Perera', petName: 'Bruno', patientId: 'pet-001',
      ownerPhone: '+94771234567',
      items: [
        { itemId: 'inv-003', sku: 'CONS-001', name: 'Consultation', category: 'service', quantity: 1, unitPrice: 1500, totalPrice: 1500 },
        { itemId: 'inv-001', sku: 'AMX-250', name: 'Amoxicillin 250mg', category: 'medication', quantity: 2, unitPrice: 450, totalPrice: 900 }
      ],
      subtotal: 2400, tax: 198, discount: 0, sales_total: 2598,
      paymentMethod: 'cash', paymentStatus: 'paid',
      splitPayments: [],
      createdBy: 'dr_silva', shiftId: 'shift-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const invoice2 = {
      id: 'INV-20260714-002', date: new Date().toISOString(),
      ownerName: 'Nimali Fernando', petName: 'Mimi', patientId: 'pet-002',
      ownerPhone: '+94777654321',
      items: [
        { itemId: 'inv-001', sku: 'AMX-250', name: 'Vaccination - Rabies', category: 'vaccine', quantity: 1, unitPrice: 3500, totalPrice: 3500 }
      ],
      subtotal: 3500, tax: 288.75, discount: 0, sales_total: 3788.75,
      paymentMethod: 'card', paymentStatus: 'paid',
      splitPayments: [],
      createdBy: 'dr_silva', shiftId: 'shift-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const invoice3 = {
      id: 'INV-20260714-003', date: new Date().toISOString(),
      ownerName: 'Saman Kumara', petName: 'Rex', patientId: 'pet-003',
      ownerPhone: '+94712345678',
      items: [
        { itemId: 'inv-002', sku: 'FC-LG', name: 'Flea Collar Large', category: 'accessories', quantity: 1, unitPrice: 1200, totalPrice: 1200 }
      ],
      subtotal: 1200, tax: 99, discount: 0, sales_total: 1299,
      paymentMethod: 'split', paymentStatus: 'paid',
      splitPayments: [{ method: 'cash', amount: 500 }, { method: 'card', amount: 799 }],
      createdBy: 'dr_silva', shiftId: 'shift-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.invoices.setItem(invoice1.id, invoice1);
    await db.invoices.setItem(invoice2.id, invoice2);
    await db.invoices.setItem(invoice3.id, invoice3);

    // 3. Active shift (triggers drawer display in ShiftManager)
    await db.system.setItem('active_shift', {
      id: 'shift-001', openedAt: new Date().toISOString(),
      openedBy: 'dr_silva', openedByName: 'Dr. Silva',
      openingFloat: 5000
    });

    // 4. Shift reconciliation (closed shift history for ShiftManager)
    const shiftRecon = {
      id: 'sr-001', shiftId: 'shift-old', timestamp: new Date(Date.now() - 86400000).toISOString(),
      userId: 'dr_silva', userName: 'Dr. Silva',
      openingFloat: 5000, cashSales: 2598,
      expectedClosing: 7598, actualClosing: 7590,
      discrepancy: -8, status: 'discrepancy',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.shiftReconciliations.setItem(shiftRecon.id, shiftRecon);

    // 5. Cash adjustments (for shift manager)
    const cashAdj = {
      id: 'adj-001', type: 'OUT', amount: 500,
      category: 'Expense', reason: 'Bought cleaning supplies',
      date: new Date().toISOString(), createdBy: 'Dr. Silva',
      shiftId: 'shift-001'
    };
    await db.cashAdjustments.setItem(cashAdj.id, cashAdj);

    // 6. Staff profiles
    const staffProfile = {
      id: 'sp-001', userId: 'user-001', fullName: 'Dr. Amal Silva',
      position: 'Senior Veterinarian', department: 'Clinical',
      employmentType: 'monthly', monthlySalary: 15000000,
      hireDate: '2024-03-15', active: true,
      phone: '+94771234567', email: 'amal@ceylonpets.lk',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    const staffProfile2 = {
      id: 'sp-002', userId: 'user-002', fullName: 'Nimal Bandara',
      position: 'Grooming Technician', department: 'Grooming',
      employmentType: 'hourly', hourlyRate: 50000,
      hireDate: '2025-01-10', active: true,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.staffProfiles.setItem(staffProfile.id, staffProfile);
    await db.staffProfiles.setItem(staffProfile2.id, staffProfile2);

    // 7. Time entries
    const timeEntry = {
      id: 'te-001', staffProfileId: 'sp-002',
      clockIn: new Date(Date.now() - 28800000).toISOString(),
      clockOut: new Date().toISOString(),
      totalMinutes: 480, source: 'manager', enteredBy: 'admin-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.timeEntries.setItem(timeEntry.id, timeEntry);

    // 8. Payslips (using cents-based fields)
    const payslip = {
      id: 'ps-001', staffId: 'sp-001', staffName: 'Dr. Amal Silva',
      periodStart: '2026-06-01', periodEnd: '2026-06-30',
      grossPayCents: 15500000, netPayCents: 14000000,
      deductions: [{ id: 'd1', label: 'EPF', amountCents: 1200000, isPercentage: false }],
      additions: [{ id: 'a1', label: 'OT', amountCents: 500000 }],
      totalMinutes: 10560,
      status: 'paid', paidDate: '2026-07-05',
      generatedBy: 'admin-001',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.payslips.setItem(payslip.id, payslip);

    // 9. Users (login accounts)
    const user1 = {
      id: 'user-001', name: 'Dr. Amal Silva', username: 'dr_silva',
      role: 'veterinarian', avatarColor: 'bg-green-600 text-white border-green-700',
      pin: 'a1b2c3d4'
    };
    const user2 = {
      id: 'user-002', name: 'Nimal Bandara', username: 'nimal',
      role: 'cashier', avatarColor: 'bg-amber-600 text-white border-amber-700',
      pin: 'e5f6g7h8'
    };
    await db.users.setItem(user1.id, user1);
    await db.users.setItem(user2.id, user2);

    // 10. Schedule entries
    const schedEntry = {
      id: 'sched-001', staffProfileId: 'sp-001',
      date: new Date().toISOString().slice(0, 10),
      startTime: '08:00', endTime: '17:00',
      type: 'shift', notes: 'Regular shift',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.scheduleEntries.setItem(schedEntry.id, schedEntry);

    // 11. Clients
    const client1 = {
      client_id: 'cli-001', primary_phone: '+94771234567',
      full_name: 'Kamal Perera', email_address: 'kamal@test.lk',
      physical_address: 'Kandy', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 2598,
      client_status: 'active', administrative_notes: '',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.clients.setItem(client1.client_id, client1);

    // 12. Deletion audit trail (for ReportsManager)
    const deletion = {
      id: 'del-001', entity_type: 'client', entity_id: 'cli-old',
      entity_name: 'Test Removed Client', deleted_by: 'admin',
      deleted_at: new Date().toISOString(), reason: 'Duplicate'
    };
    await db.deletionAudit.setItem(deletion.id, deletion);

    // 13. Appointments
    const appt = {
      id: 'apt-001', petName: 'Bruno', ownerName: 'Kamal Perera',
      date: new Date().toISOString(), time: '10:00',
      type: 'checkup', status: 'completed',
      notes: 'Annual wellness check',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    };
    await db.appointments.setItem(appt.id, appt);

    console.log('[SEED] All test data seeded successfully');
  });

  // Reload so the app hydrates from seeded DB
  console.log('--- Reloading to hydrate ---');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(4000);

  // ---- LOGIN ----
  console.log('--- Logging in as ashpoint_owner ---');
  try {
    await page.selectOption('#login-username', 'ashpoint_owner');
    await page.fill('[data-testid="input-pin"]', '5692');
    await page.click('[data-testid="btn-verify-pin"]');
    await page.waitForTimeout(2000);
  } catch (loginErr) {
    console.log('Login error:', loginErr.message);
  }

  // Check if we're still on recovery mode after login (boot crash)
  const bootCrash = await page.evaluate(() => document.body.innerText.includes('Recovery Mode Intercepted'));
  if (bootCrash) {
    console.log('[FATAL] App crashed during boot/login with seeded data');
    const bootLogs = [];
    page.on('console', msg => { if (msg.type() === 'error') bootLogs.push(msg.text()); });
    await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000);
    console.log('Boot error logs:', bootLogs.join('\n'));
    await browser.close();
    return;
  }

  // ---- TEST EACH PANEL ----
  for (const panel of PANELS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`PANEL: ${panel}`);
    console.log('='.repeat(60));

    allErrors._current = allErrors[panel];

    // Navigate via sidebar
    const clicked = await page.evaluate((viewId) => {
      const mappings = {
        'inventory': 'inventory',
        'invoices': 'invoices',
        'shift': 'shift & drawer',
        'reports': 'reports',
        'staff': 'staff & payroll',
        'settings': 'settings'
      };
      const target = mappings[viewId];
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase().trim() || '';
        if (text.includes(target)) {
          btn.click();
          return `Clicked button with text: "${btn.textContent.trim()}"`;
        }
      }
      // For settings, try the gear icon
      if (viewId === 'settings') {
        const settingsButtons = document.querySelectorAll('button');
        for (const btn of settingsButtons) {
          if (btn.textContent?.toLowerCase().includes('system') || btn.textContent?.toLowerCase().includes('settings') || btn.textContent?.toLowerCase().includes('config')) {
            btn.click();
            return `Clicked settings button: "${btn.textContent.trim()}"`;
          }
        }
      }
      return null;
    }, panel);

    if (!clicked) {
      console.log(`[WARN] Could not find sidebar button for ${panel}`);
      // Try direct React state manipulation
      await page.evaluate((viewId) => {
        // React state can't be directly set from outside, but maybe via URL or other mechanism
        console.log(`Could not navigate to ${viewId}`);
      }, panel);
    } else {
      console.log(`Navigation: ${clicked}`);
    }

    await page.waitForTimeout(3000);

    // Check for crash
    const crashed = await page.evaluate(() => document.body.innerText.includes('Recovery Mode Intercepted'));

    if (crashed) {
      console.log(`[CRASH] Panel "${panel}" shows Recovery Mode Intercepted`);
      console.log(`Errors captured (${allErrors[panel].length}):`);
      allErrors[panel].forEach(e => console.log(e));

      // Reload and re-login for next panel
      allErrors._current = null;
      await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(4000);
      try {
        await page.selectOption('#login-username', 'ashpoint_owner');
        await page.fill('[data-testid="input-pin"]', '5692');
        await page.click('[data-testid="btn-verify-pin"]');
        await page.waitForTimeout(2000);
      } catch (e) {
        console.log('Re-login error:', e.message);
      }
    } else {
      console.log(`[OK] Panel "${panel}" rendered successfully`);
      if (allErrors[panel].length > 0) {
        console.log(`Non-fatal errors (${allErrors[panel].length}):`);
        allErrors[panel].forEach(e => console.log(e));
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY');
  console.log('='.repeat(60));
  for (const panel of PANELS) {
    const status = allErrors[panel].length > 0 ? `ERRORS (${allErrors[panel].length})` : 'OK';
    console.log(`${panel}: ${status}`);
  }

  await browser.close();
})();
