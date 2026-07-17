const { chromium } = require('@playwright/test');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'http://localhost:3000';
const OUT = path.resolve(__dirname);

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function login(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('#login-username', { timeout: 15000 });
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '1234');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForSelector('[data-testid="nav-pos"]', { timeout: 15000 });
  await sleep(1000);
}

async function nav(page, id) {
  try {
    if (id === 'settings') {
      const btn = page.locator('button:has-text("Settings")').last();
      await btn.scrollIntoViewIfNeeded({ timeout: 5000 });
      await btn.click({ timeout: 5000 });
    } else {
      const el = page.locator(`[data-testid="nav-${id}"]`);
      await el.scrollIntoViewIfNeeded({ timeout: 5000 });
      await el.click({ timeout: 5000 });
    }
    await sleep(1500);
  } catch (e) {
    console.log(`  WARN: Could not navigate to ${id}: ${e.message.split('\n')[0]}`);
  }
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  captured: ${name}.png`);
}

async function seedData(page) {
  console.log('Seeding demo data via window._db...');
  await page.evaluate(async () => {
    const db = window._db;
    if (!db) { console.warn('No window._db'); return; }

    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);

    // Clients
    const clients = [
      { client_id: 'client_771234567', name: 'Kumara Perera', primary_phone: '+94771234567', email: 'kumara@test.lk', address: '45 Temple Rd, Kandy', created_at: now, petIds: ['buddy_771234567', 'milo_771234567'], is_deleted: false, _dirty: true },
      { client_id: 'client_772345678', name: 'Saman Silva', primary_phone: '+94772345678', email: 'saman@test.lk', address: '12 Lake Dr, Kandy', created_at: now, petIds: ['rex_772345678'], is_deleted: false, _dirty: true },
      { client_id: 'client_773456789', name: 'Nimal Fernando', primary_phone: '+94773456789', email: 'nimal@test.lk', address: '78 Hill St, Kandy', created_at: now, petIds: ['whiskers_773456789'], is_deleted: false, _dirty: true },
    ];
    for (const c of clients) await db.clients.setItem(c.client_id, c);

    // Pets
    const pets = [
      { id: 'buddy_771234567', name: 'Buddy', species: 'Dog', breed: 'Golden Retriever', age: '3 years', weight: '28', sex: 'Male', color: 'Golden', clientId: 'client_771234567', created_at: now, is_deleted: false, _dirty: true },
      { id: 'milo_771234567', name: 'Milo', species: 'Cat', breed: 'Persian', age: '2 years', weight: '4', sex: 'Male', color: 'White', clientId: 'client_771234567', created_at: now, is_deleted: false, _dirty: true },
      { id: 'rex_772345678', name: 'Rex', species: 'Dog', breed: 'German Shepherd', age: '5 years', weight: '35', sex: 'Male', color: 'Black & Tan', clientId: 'client_772345678', created_at: now, is_deleted: false, _dirty: true },
      { id: 'whiskers_773456789', name: 'Whiskers', species: 'Cat', breed: 'Siamese', age: '1 year', weight: '3.5', sex: 'Female', color: 'Cream', clientId: 'client_773456789', created_at: now, is_deleted: false, _dirty: true },
    ];
    for (const p of pets) await db.pets.setItem(p.id, p);

    // Appointments
    const appointments = [
      { id: 'apt_001', petName: 'Buddy', petId: 'buddy_771234567', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', date: today, time: '09:00', type: 'checkup', vet: 'Dr. Kamal', status: 'checked-in', urgency: 'non-emergency', notes: 'Annual checkup', created_at: now, _dirty: true },
      { id: 'apt_002', petName: 'Rex', petId: 'rex_772345678', ownerName: 'Saman Silva', ownerPhone: '+94772345678', date: today, time: '10:30', type: 'vaccination', vet: 'Dr. Nisha', status: 'scheduled', urgency: 'non-emergency', notes: 'Rabies booster', created_at: now, _dirty: true },
      { id: 'apt_003', petName: 'Whiskers', petId: 'whiskers_773456789', ownerName: 'Nimal Fernando', ownerPhone: '+94773456789', date: today, time: '11:00', type: 'emergency', vet: 'Dr. Kamal', status: 'checked-in', urgency: 'emergency', emergencyBackfillRequired: true, notes: 'Difficulty breathing', created_at: now, _dirty: true },
    ];
    for (const a of appointments) await db.appointments.setItem(a.id, a);

    // Invoices
    const invoices = [
      { id: 'inv_001', invoiceNumber: 'INV-2024-001', patientName: 'Buddy', patientId: 'buddy_771234567', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', date: now, items: [{ id: '1', name: 'Consultation Fee', quantity: 1, unitPrice: 2500, total: 2500, category: 'service' }, { id: '2', name: 'Blood Test', quantity: 1, unitPrice: 3500, total: 3500, category: 'lab' }], subtotal: 6000, tax: 0, discount: 0, total: 6000, paymentStatus: 'paid', paymentMethod: 'cash', created_at: now, _dirty: true },
      { id: 'inv_002', invoiceNumber: 'INV-2024-002', patientName: 'Rex', patientId: 'rex_772345678', ownerName: 'Saman Silva', ownerPhone: '+94772345678', date: now, items: [{ id: '1', name: 'Rabies Vaccine', quantity: 1, unitPrice: 1500, total: 1500, category: 'vaccination' }], subtotal: 1500, tax: 0, discount: 0, total: 1500, paymentStatus: 'pending', paymentMethod: '', created_at: now, _dirty: true },
    ];
    for (const i of invoices) await db.invoices.setItem(i.id, i);

    // Inventory
    const inventory = [
      { id: 'item_001', name: 'Amoxicillin 250mg', category: 'medication', sku: 'MED-001', quantity: 150, reorderLevel: 20, costPrice: 50, sellingPrice: 120, supplier: 'MediPharma', location: 'Shelf A1', expiryDate: '2027-06-15', lastRestocked: now, created_at: now, _dirty: true },
      { id: 'item_002', name: 'Rabies Vaccine', category: 'vaccine', sku: 'VAC-001', quantity: 30, reorderLevel: 10, costPrice: 800, sellingPrice: 1500, supplier: 'VetBio', location: 'Fridge B2', expiryDate: '2026-12-01', lastRestocked: now, created_at: now, _dirty: true },
      { id: 'item_003', name: 'Surgical Gloves (Box)', category: 'supplies', sku: 'SUP-001', quantity: 5, reorderLevel: 10, costPrice: 350, sellingPrice: 500, supplier: 'MedSupply', location: 'Cabinet C3', expiryDate: '2028-01-01', lastRestocked: now, created_at: now, _dirty: true },
      { id: 'item_004', name: 'Ear Drops', category: 'medication', sku: 'MED-002', quantity: 0, reorderLevel: 5, costPrice: 200, sellingPrice: 450, supplier: 'MediPharma', location: 'Shelf A2', expiryDate: '2026-08-01', lastRestocked: now, created_at: now, _dirty: true },
    ];
    for (const i of inventory) await db.inventory.setItem(i.id, i);

    // Medical Records
    const records = [
      { id: 'rec_001', patientId: 'buddy_771234567', patientName: 'Buddy', date: now, vet: 'Dr. Kamal', type: 'examination', complaint: 'Lethargy and loss of appetite', diagnosis: 'Mild gastritis', treatment: 'Prescribed antacids and bland diet for 5 days', vitals: { weight: '28', temperature: '39.2', heartRate: '90', respiratoryRate: '22' }, followUp: '2024-12-20', notes: 'Monitor hydration levels', created_at: now, _dirty: true },
    ];
    for (const r of records) await db.records.setItem(r.id, r);

    // Vaccinations
    const vaccinations = [
      { id: 'vax_001', petId: 'buddy_771234567', petName: 'Buddy', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', vaccineName: 'Rabies', date: today, nextDueDate: '2027-07-13', batchNumber: 'RB-2024-445', administeredBy: 'Dr. Nisha', notes: 'No adverse reactions', status: 'completed', created_at: now, _dirty: true },
      { id: 'vax_002', petId: 'rex_772345678', petName: 'Rex', ownerName: 'Saman Silva', ownerPhone: '+94772345678', vaccineName: 'DHPP', date: today, nextDueDate: '2027-01-13', batchNumber: 'DH-2024-112', administeredBy: 'Dr. Nisha', notes: '', status: 'scheduled', created_at: now, _dirty: true },
    ];
    for (const v of vaccinations) await db.vaccinations.setItem(v.id, v);

    // Boarding (store is boardingRecords)
    const boarding = [
      { id: 'board_001', petId: 'milo_771234567', petName: 'Milo', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', checkIn: today, checkOut: '2026-07-18', cage: 'Suite A', status: 'checked-in', specialInstructions: 'Likes warm blanket. Feed twice daily.', dailyRate: 1500, totalCharge: 7500, created_at: now, _dirty: true },
    ];
    for (const b of boarding) await db.boardingRecords.setItem(b.id, b);

    // Grooming (store is groomingLogs)
    const grooming = [
      { id: 'groom_001', petId: 'buddy_771234567', petName: 'Buddy', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', date: today, time: '14:00', services: ['Full Bath', 'Nail Trim', 'Ear Cleaning'], groomer: 'Amali', status: 'scheduled', notes: 'Sensitive skin — use hypoallergenic shampoo', totalCharge: 3500, created_at: now, _dirty: true },
    ];
    for (const g of grooming) await db.groomingLogs.setItem(g.id, g);

    // Lab Results (store is labResults)
    const labs = [
      { id: 'lab_001', petId: 'buddy_771234567', petName: 'Buddy', ownerName: 'Kumara Perera', testName: 'Complete Blood Count', date: today, status: 'completed', results: 'WBC: 12.5, RBC: 6.8, Hgb: 15.2 — all within normal range', vet: 'Dr. Kamal', notes: 'No abnormalities detected', created_at: now, _dirty: true },
      { id: 'lab_002', petId: 'whiskers_773456789', petName: 'Whiskers', ownerName: 'Nimal Fernando', testName: 'X-Ray Chest', date: today, status: 'pending', results: '', vet: 'Dr. Kamal', notes: 'Priority — respiratory distress', created_at: now, _dirty: true },
    ];
    for (const l of labs) await db.labResults.setItem(l.id, l);

    // Clinic Queue
    const queue = [
      { id: 'q_001', appointmentId: 'apt_001', petName: 'Buddy', ownerName: 'Kumara Perera', vet: 'Dr. Kamal', checkInTime: new Date(Date.now() - 30 * 60000).toISOString(), status: 'waiting', urgency: 'non-emergency', type: 'checkup' },
      { id: 'q_003', appointmentId: 'apt_003', petName: 'Whiskers', ownerName: 'Nimal Fernando', vet: 'Dr. Kamal', checkInTime: new Date(Date.now() - 5 * 60000).toISOString(), status: 'waiting', urgency: 'emergency', emergencyBackfillRequired: true, type: 'emergency' },
    ];
    for (const q of queue) await db.clinicQueue.setItem(q.id, q);

    console.log('Seed data written successfully');
  });
  console.log('Seed complete. Reloading...');
  await page.reload({ waitUntil: 'networkidle' });
  await login(page);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Login
  console.log('Step 1: Login...');
  await login(page);

  // Seed data
  await seedData(page);

  // All nav panels
  const panels = [
    'pos', 'dashboard', 'appointments', 'pets', 'customers',
    'vaccinations', 'examinations', 'laboratory', 'boarding',
    'grooming', 'inventory', 'invoices', 'shift', 'reports', 'staff', 'settings'
  ];

  console.log('\nStep 2: Capturing all panels with data...');
  for (const p of panels) {
    await nav(page, p);
    await shot(page, `panel-${p}`);
  }

  // Sidebar screenshot (with a panel selected)
  console.log('\nStep 3: Sidebar...');
  await nav(page, 'appointments');
  await sleep(500);
  await shot(page, 'sidebar-selected');

  // Capture modals
  console.log('\nStep 4: Modals...');

  // Modal 1: POS receipt — go to POS, try to find receipt/invoice button
  await nav(page, 'pos');
  await sleep(500);
  // Try clicking on first invoice row if exists
  const posReceiptBtn = await page.$('button:has-text("Receipt"), button:has-text("View"), button:has-text("Print")');
  if (posReceiptBtn) {
    await posReceiptBtn.click();
    await sleep(1000);
    await shot(page, 'modal-pos-receipt');
    // Close it
    const closeBtn = await page.$('button:has-text("Close"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No POS receipt button found — skipping');
  }

  // Modal 2: Boarding intake
  await nav(page, 'boarding');
  await sleep(500);
  const boardingAddBtn = await page.$('button:has-text("New Boarding"), button:has-text("Add Boarding"), button:has-text("Check In"), button:has-text("New")');
  if (boardingAddBtn) {
    await boardingAddBtn.click();
    await sleep(1000);
    await shot(page, 'modal-boarding-intake');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No boarding add button found — skipping');
  }

  // Modal 3: Grooming add
  await nav(page, 'grooming');
  await sleep(500);
  const groomAddBtn = await page.$('button:has-text("New Grooming"), button:has-text("Add Grooming"), button:has-text("Book"), button:has-text("New")');
  if (groomAddBtn) {
    await groomAddBtn.click();
    await sleep(1000);
    await shot(page, 'modal-grooming-add');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No grooming add button found — skipping');
  }

  // Modal 4: Staff add
  await nav(page, 'staff');
  await sleep(500);
  const staffAddBtn = await page.$('button:has-text("Add Staff"), button:has-text("New Staff"), button:has-text("Add Employee"), button:has-text("New")');
  if (staffAddBtn) {
    await staffAddBtn.click();
    await sleep(1000);
    await shot(page, 'modal-staff-add');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No staff add button found — skipping');
  }

  // Modal 5: Appointment add
  await nav(page, 'appointments');
  await sleep(500);
  const aptAddBtn = await page.$('button:has-text("New Appointment"), button:has-text("Add Appointment"), button:has-text("Book"), button:has-text("New")');
  if (aptAddBtn) {
    await aptAddBtn.click();
    await sleep(1000);
    await shot(page, 'modal-appointment-add');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No appointment add button found — skipping');
  }

  // Modal 6: Delete confirmation (go to customers, click trash)
  await nav(page, 'customers');
  await sleep(500);
  const trashBtn = await page.$('button:has(svg.lucide-trash-2), button[aria-label*="delete"], button[aria-label*="Delete"]');
  if (trashBtn) {
    await trashBtn.click();
    await sleep(1000);
    await shot(page, 'modal-delete-confirm');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No delete button found — skipping');
  }

  // Modal 7: Inventory add
  await nav(page, 'inventory');
  await sleep(500);
  const invAddBtn = await page.$('button:has-text("Add Item"), button:has-text("New Item"), button:has-text("Add Product"), button:has-text("New")');
  if (invAddBtn) {
    await invAddBtn.click();
    await sleep(1000);
    await shot(page, 'modal-inventory-add');
    const closeBtn = await page.$('button:has-text("Cancel"), button:has-text("✕"), [aria-label="Close"]');
    if (closeBtn) await closeBtn.click();
    await sleep(500);
  } else {
    console.log('  No inventory add button found — skipping');
  }

  // Now clear all data for empty state screenshots
  console.log('\nStep 5: Clearing data for empty state screenshots...');
  await page.evaluate(async () => {
    const db = window._db;
    if (!db) return;
    const stores = ['clients', 'pets', 'appointments', 'invoices', 'inventory', 'records', 'vaccinations', 'boardingRecords', 'groomingLogs', 'labResults', 'clinicQueue'];
    for (const s of stores) {
      if (db[s] && db[s].clear) await db[s].clear();
    }
    console.log('All stores cleared');
  });
  await page.reload({ waitUntil: 'networkidle' });
  await login(page);

  console.log('\nStep 6: Capturing empty panels...');
  for (const p of panels) {
    await nav(page, p);
    await shot(page, `empty-${p}`);
  }

  // Form validation error
  console.log('\nStep 7: Form validation...');
  await nav(page, 'appointments');
  await sleep(500);
  const aptBtn2 = await page.$('button:has-text("New Appointment"), button:has-text("Add Appointment"), button:has-text("Book"), button:has-text("New")');
  if (aptBtn2) {
    await aptBtn2.click();
    await sleep(500);
    // Try to submit empty form
    const submitBtn = await page.$('button:has-text("Save"), button:has-text("Book"), button:has-text("Create"), button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await sleep(500);
      await shot(page, 'form-validation-error');
    }
  }

  // Login screen
  console.log('\nStep 8: Login screen...');
  const logoutBtn = await page.$('button:has-text("Lock/Logout"), button:has-text("Logout")');
  if (logoutBtn) {
    await logoutBtn.click();
    await sleep(1000);
    await shot(page, 'login-screen');
  }

  await browser.close();
  console.log('\nDone! All screenshots saved to screenshots/');
})();
