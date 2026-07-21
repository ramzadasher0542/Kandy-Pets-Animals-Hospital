const { chromium } = require('playwright');

const PORT = 3099;

async function nav(page, label) {
  return page.evaluate((t) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.toLowerCase().includes(t)) { btn.click(); return true; }
    }
    return false;
  }, label);
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

  // Seed data
  await page.evaluate(async () => {
    const db = window._db;
    const now = new Date().toISOString();
    const todayISO = now.slice(0, 10);

    await db.inventory.clear();
    await db.inventory.setItem('inv-001', { id: 'inv-001', name: 'Amoxicillin', sku: 'AMX-100', category: 'medication', price: 450, stock: 120, minStock: 10, unit: 'tablets', created_at: now, updated_at: now });
    await db.inventory.setItem('inv-002', { id: 'inv-002', name: 'Collar Large', sku: 'COL-LG', category: 'accessories', price: 1200, cost: 800, stock: 35, minStock: 5, unit: 'pcs', created_at: now, updated_at: now });
    await db.inventory.setItem('inv-003', { id: 'inv-003', name: 'Rabies Vaccine', sku: 'VAX-RAB', category: 'vaccine', price: 2500, cost: 1800, stock: 3, minStock: 5, unit: 'doses', created_at: now, updated_at: now });

    await db.clients.clear();
    await db.clients.setItem('c1', { client_id: 'c1', primary_phone: '0771234567', full_name: 'Kamal Silva', email_address: 'k@test.lk', physical_address: 'Kandy', communication_preference: 'sms', account_balance: 0, lifetime_value: 900, client_status: 'active', administrative_notes: '', created_at: now, updated_at: now });

    await db.pets.clear();
    await db.pets.setItem('pet-001', { id: 'pet-001', name: 'Bruno', petType: 'Canine', breed: 'German Shepherd', sex: 'Male', weight: 32, age: '4 years', clientPhone: '0771234567', created_at: now, updated_at: now });
    await db.pets.setItem('pet-002', { id: 'pet-002', name: 'Whiskers', petType: 'Feline', breed: 'Persian', sex: 'Female', weight: 4.5, age: '2 years', clientPhone: '0771234567', created_at: now, updated_at: now });

    await db.records.clear();
    await db.records.setItem('mr-001', { id: 'mr-001', patientId: 'pet-001', visitDate: todayISO, attendingVet: 'Dr. Silva', diagnosis: 'Routine checkup', prescribedMeds: [{ name: 'Amoxicillin', dosage: '250mg' }], assessment: { diagnosisType: 'Preventive', notes: 'All normal', severity: 'Mild' }, created_at: now, updated_at: now });
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  await login(page);

  // ===== TEST 1: Inventory Panel with PageShell =====
  console.log('\n===== TEST 1: Inventory panel renders with PageShell =====');
  errors.length = 0;
  await nav(page, 'inventory');
  await page.waitForTimeout(2500);

  const invCrashed = await page.evaluate(() =>
    document.body.innerText.includes("This page couldn't load") ||
    document.body.innerText.includes("Recovery Mode")
  );
  if (invCrashed) {
    fail(`Inventory CRASHED: ${errors[0] || 'no error'}`);
  } else {
    pass('Inventory panel rendered OK');
  }

  // Check KPI cards rendered
  const hasKpis = await page.evaluate(() => {
    const text = document.body.innerText.toUpperCase();
    return text.includes('TOTAL REGISTRY') && text.includes('STOCK ALERTS') && text.includes('PHYSICAL ASSET VALUE');
  });
  hasKpis ? pass('KPI cards present') : fail('KPI cards missing');

  // Check filter pills rendered
  const hasFilters = await page.evaluate(() => {
    const text = document.body.innerText.toUpperCase();
    return text.includes('ALL ITEMS') && text.includes('EXPIRING STOCK');
  });
  hasFilters ? pass('Filter pills present') : fail('Filter pills missing');

  // Check table data
  const hasTableData = await page.evaluate(() => {
    return document.body.innerText.includes('Amoxicillin') && document.body.innerText.includes('AMX-100');
  });
  hasTableData ? pass('Table data renders') : fail('Table data missing');

  // Check search input
  const hasSearch = await page.evaluate(() => {
    return !!document.querySelector('input[placeholder*="Search SKU"]');
  });
  hasSearch ? pass('Search input present') : fail('Search input missing');

  // Check Add Item button
  const hasAddBtn = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent?.includes('Add Item')) return true;
    }
    return false;
  });
  hasAddBtn ? pass('Add Item button present') : fail('Add Item button missing');

  // Screenshot inventory
  await page.screenshot({ path: 'screenshots/v3-inventory.png', fullPage: false });
  pass('Inventory screenshot saved');

  // ===== TEST 2: Patient Portal with PageShell + MasterDetailLayout =====
  console.log('\n===== TEST 2: Patient Portal renders with PageShell + MasterDetailLayout =====');
  errors.length = 0;
  await nav(page, 'pets');
  await page.waitForTimeout(2500);

  const patCrashed = await page.evaluate(() =>
    document.body.innerText.includes("This page couldn't load") ||
    document.body.innerText.includes("Recovery Mode")
  );
  if (patCrashed) {
    fail(`Patient Portal CRASHED: ${errors[0] || 'no error'}`);
  } else {
    pass('Patient Portal rendered OK');
  }

  // Check list panel (aside) rendered
  const hasAside = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside && aside.offsetHeight > 100;
  });
  hasAside ? pass('List panel (aside) visible') : fail('List panel missing');

  // Check search in list header
  const hasPatSearch = await page.evaluate(() => {
    return !!document.querySelector('input[placeholder*="Search Pet"]');
  });
  hasPatSearch ? pass('Patient search input present') : fail('Patient search missing');

  // Check toggle buttons
  const hasToggles = await page.evaluate(() => {
    const text = document.body.innerText.toUpperCase();
    return text.includes('IN CLINIC') && text.includes('ALL PETS');
  });
  hasToggles ? pass('In Clinic / All Pets toggles present') : fail('Toggle buttons missing');

  // Check empty state when no patient selected
  const hasEmptyState = await page.evaluate(() => {
    return document.body.innerText.toUpperCase().includes('SELECT A PATIENT');
  });
  hasEmptyState ? pass('Empty state shows correctly') : fail('Empty state missing');

  // Switch to "All Pets" view first
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.toUpperCase().includes('ALL PETS')) { btn.click(); break; }
    }
  });
  await page.waitForTimeout(1500);

  // Click on a pet to test detail view
  const clickedPet = await page.evaluate(() => {
    const cards = document.querySelectorAll('aside div[class*="rounded-2xl cursor-pointer"]');
    if (cards.length > 0) { cards[0].click(); return true; }
    return false;
  });
  if (clickedPet) {
    await page.waitForTimeout(1500);
    const hasDetail = await page.evaluate(() => {
      const t = document.body.innerText.toUpperCase();
      return t.includes('CLINICAL TIMELINE') || t.includes('SYSTEMIC EXAMS');
    });
    hasDetail ? pass('Detail view renders with tabs') : fail('Detail view tabs missing');
  } else {
    fail('No pet cards to click');
  }

  // Screenshot patient portal
  await page.screenshot({ path: 'screenshots/v3-patient-portal.png', fullPage: false });
  pass('Patient Portal screenshot saved');

  // ===== TEST 3: Check for React errors =====
  console.log('\n===== TEST 3: No React errors =====');
  const reactErrors = errors.filter(e => e.includes('React') || e.includes('Cannot read') || e.includes('undefined'));
  if (reactErrors.length === 0) {
    pass('No React errors detected');
  } else {
    reactErrors.forEach(e => fail(`React error: ${e}`));
  }

  // ===== TEST 4: Other panels still work =====
  console.log('\n===== TEST 4: Non-refactored panels still work =====');
  for (const panel of ['invoices', 'shift & drawer', 'reports', 'staff', 'settings']) {
    errors.length = 0;
    await nav(page, panel);
    await page.waitForTimeout(2000);
    const crashed = await page.evaluate(() =>
      document.body.innerText.includes("This page couldn't load")
    );
    if (crashed) {
      fail(`${panel}: CRASHED`);
    } else {
      pass(`${panel}: OK`);
    }
  }

  console.log(`\n===== RESULT: ${allPassed ? 'ALL PASSED' : 'SOME FAILED'} =====`);
  await browser.close();
  process.exit(allPassed ? 0 : 1);
})();
