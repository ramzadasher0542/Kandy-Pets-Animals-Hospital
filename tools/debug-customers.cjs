const { chromium } = require('playwright');
const PORT = 3099;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Seed realistic clients — some with full names, some with phone-only names
  await page.evaluate(async () => {
    const db = window._db;
    const now = new Date().toISOString();

    await db.clients.clear();
    await db.pets.clear();

    // Normal client with proper name
    await db.clients.setItem('client_771234567', {
      client_id: 'client_771234567', full_name: 'Kumara Perera',
      primary_phone: '+94771234567', email_address: 'kumara@test.lk',
      physical_address: 'Kandy', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 5000, client_status: 'active',
      administrative_notes: '', petIds: ['bruno_771234567'],
      created_at: now, updated_at: now
    });

    // Client where full_name IS the phone number (the bug scenario)
    await db.clients.setItem('client_775556789', {
      client_id: 'client_775556789', full_name: '+94775556789',
      primary_phone: '+94775556789', email_address: '',
      physical_address: '', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 0, client_status: 'active',
      administrative_notes: '', petIds: ['max_775556789'],
      created_at: now, updated_at: now
    });

    // Another phone-as-name client
    await db.clients.setItem('client_778889999', {
      client_id: 'client_778889999', full_name: '0778889999',
      primary_phone: '+94778889999', email_address: '',
      physical_address: '', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 0, client_status: 'active',
      administrative_notes: '', petIds: [],
      created_at: now, updated_at: now
    });

    // Emergency client
    await db.clients.setItem('client_917264583', {
      client_id: 'client_917264583', full_name: 'Emergency — Details Pending',
      primary_phone: '9172645831234567890',
      email_address: 'not-provided@example.com',
      physical_address: '', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 0, client_status: 'active',
      administrative_notes: '', petIds: ['buddy_917264583'],
      created_at: now, updated_at: now
    });

    // Walk-in
    await db.clients.setItem('walk_in_retail', {
      client_id: 'walk_in_retail', full_name: 'Walk-in Client',
      primary_phone: '0000000000', email_address: '',
      physical_address: '', communication_preference: 'sms',
      account_balance: 0, lifetime_value: 200, client_status: 'active',
      administrative_notes: '', petIds: [],
      created_at: now, updated_at: now
    });

    // Pets
    await db.pets.setItem('bruno_771234567', { id: 'bruno_771234567', clientId: 'client_771234567', name: 'Bruno', petType: 'Canine', breed: 'German Shepherd', sex: 'Male', weight: 30, age: '3 years', created_at: now, updated_at: now });
    await db.pets.setItem('max_775556789', { id: 'max_775556789', clientId: 'client_775556789', name: 'Max', petType: 'Canine', breed: 'Labrador', sex: 'Male', weight: 25, age: '2 years', created_at: now, updated_at: now });
    await db.pets.setItem('buddy_917264583', { id: 'buddy_917264583', clientId: 'client_917264583', name: 'Buddy', petType: 'Canine', breed: 'Unknown', sex: 'Unknown', weight: 0, age: '', created_at: now, updated_at: now });
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  // Login
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '5692');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForTimeout(2000);

  // Navigate to Customers
  await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.toLowerCase().includes('customers')) { btn.click(); break; }
    }
  });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: 'screenshots/customers-before.png', fullPage: false });

  // Dump client list text
  const clientTexts = await page.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.innerText : 'NO ASIDE FOUND';
  });
  console.log('=== CLIENT LIST TEXT ===');
  console.log(clientTexts);

  await browser.close();
})();
