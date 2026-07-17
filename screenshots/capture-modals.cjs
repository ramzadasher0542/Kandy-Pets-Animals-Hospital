const { chromium } = require('@playwright/test');
const path = require('path');

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

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`  captured: ${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  // Seed data first
  await login(page);
  await page.evaluate(async () => {
    const db = window._db;
    if (!db) return;
    const now = new Date().toISOString();
    const today = new Date().toISOString().slice(0, 10);
    await db.clients.setItem('client_771234567', { client_id: 'client_771234567', name: 'Kumara Perera', primary_phone: '+94771234567', email: 'kumara@test.lk', address: '45 Temple Rd, Kandy', created_at: now, petIds: ['buddy_771234567'], is_deleted: false, _dirty: true });
    await db.pets.setItem('buddy_771234567', { id: 'buddy_771234567', name: 'Buddy', species: 'Dog', breed: 'Golden Retriever', age: '3 years', weight: '28', sex: 'Male', color: 'Golden', clientId: 'client_771234567', created_at: now, is_deleted: false, _dirty: true });
    await db.boardingRecords.setItem('board_001', { id: 'board_001', petId: 'buddy_771234567', petName: 'Buddy', ownerName: 'Kumara Perera', ownerPhone: '+94771234567', checkIn: today, checkOut: '2026-07-18', cage: 'Suite A', status: 'checked-in', specialInstructions: 'Test', dailyRate: 1500, totalCharge: 7500, created_at: now, _dirty: true });
    await db.inventory.setItem('item_001', { id: 'item_001', name: 'Amoxicillin 250mg', category: 'medication', sku: 'MED-001', quantity: 150, reorderLevel: 20, costPrice: 50, sellingPrice: 120, supplier: 'MediPharma', location: 'Shelf A1', expiryDate: '2027-06-15', lastRestocked: now, created_at: now, _dirty: true });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await login(page);

  // Use evaluate to click nav items (bypassing scrollIntoView)
  async function navViaJS(page, viewId) {
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-testid="nav-${id}"]`);
      if (el) el.click();
    }, viewId);
    await sleep(1500);
  }

  // Modal 1: Boarding - find add button
  console.log('Boarding modal...');
  await navViaJS(page, 'boarding');
  let addBtn = await page.$('button:has-text("New Admission"), button:has-text("New Boarding"), button:has-text("Add"), button:has-text("Check-In")');
  if (!addBtn) {
    // Try any button with + icon or "New"
    addBtn = await page.$('button:has-text("New")');
  }
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await shot(page, 'modal-boarding');
    // dismiss
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No boarding add button found');
    // Take screenshot to see what's there
    await shot(page, 'modal-boarding-debug');
  }

  // Modal 2: Grooming
  console.log('Grooming modal...');
  await navViaJS(page, 'grooming');
  addBtn = await page.$('button:has-text("New Session"), button:has-text("New Grooming"), button:has-text("Book"), button:has-text("New")');
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await shot(page, 'modal-grooming');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No grooming add button found');
    await shot(page, 'modal-grooming-debug');
  }

  // Modal 3: Staff add
  console.log('Staff modal...');
  await navViaJS(page, 'staff');
  addBtn = await page.$('button:has-text("Add Staff"), button:has-text("Add Employee"), button:has-text("Add Profile"), button:has-text("New")');
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await shot(page, 'modal-staff');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No staff add button found');
    await shot(page, 'modal-staff-debug');
  }

  // Modal 4: Appointments add
  console.log('Appointments modal...');
  await navViaJS(page, 'appointments');
  addBtn = await page.$('button:has-text("New Appointment"), button:has-text("Book Appointment"), button:has-text("New")');
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await shot(page, 'modal-appointment');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No appointment add button found');
    await shot(page, 'modal-appointment-debug');
  }

  // Modal 5: Customer delete
  console.log('Delete confirmation modal...');
  await navViaJS(page, 'customers');
  await sleep(1000);
  // Hover on first client card to reveal trash button
  const clientCard = await page.$('[class*="cursor-pointer"]:has(svg)');
  if (clientCard) {
    await clientCard.hover();
    await sleep(500);
  }
  const trashBtn = await page.$('button:has(svg.lucide-trash-2)');
  if (trashBtn) {
    await trashBtn.click();
    await sleep(1000);
    await shot(page, 'modal-delete');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No delete button found');
  }

  // Modal 6: Inventory add
  console.log('Inventory modal...');
  await navViaJS(page, 'inventory');
  addBtn = await page.$('button:has-text("Add Item"), button:has-text("Add Product"), button:has-text("New Item"), button:has-text("New")');
  if (addBtn) {
    await addBtn.click();
    await sleep(1000);
    await shot(page, 'modal-inventory');
    await page.keyboard.press('Escape');
    await sleep(500);
  } else {
    console.log('  No inventory add button found');
    await shot(page, 'modal-inventory-debug');
  }

  // Login screen
  console.log('Login screen...');
  await page.evaluate(() => {
    // Find and click logout button directly
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.textContent.includes('Lock/Logout')) {
        b.click();
        return;
      }
    }
  });
  await sleep(1000);
  await shot(page, 'login-screen');

  await browser.close();
  console.log('\nDone!');
})();
