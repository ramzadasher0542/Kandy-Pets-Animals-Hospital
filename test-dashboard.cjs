const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
  console.log('🚀 Starting Dashboard Verification Sequence');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. Initial load
    console.log('Navigating to app...');
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');

    // Wait for bootloader
    console.log('Waiting for bootloader to finish...');
    await page.waitForFunction(() => {
      return !!document.querySelector('#login-username') || !!document.querySelector('aside');
    }, { timeout: 10000 });
    
    // 2. Setup Data (Inject via window._db)
    console.log('Injecting test data...');
    await page.evaluate(async () => {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const pastTime = new Date(now.getTime() - 50 * 60000).toISOString(); // 50 mins ago
      
      if (!window._db) throw new Error('window._db not found');

      // 1. Expired Item
      await window._db.inventory.setItem('test-exp-123', {
        id: 'test-exp-123', name: 'Test Expired Med', category: 'prescription',
        stock: 10, minStock: 5, expiryDate: '2020-01-01', priceCents: 1000,
        is_deleted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      });

      // 2. Emergency Intake
      await window._db.appointments.setItem('test-emerg-123', {
        id: 'test-emerg-123', petName: 'EmergDog', ownerName: 'TestOwner',
        date: todayStr, time: '10:00', status: 'booked',
        urgency: 'emergency', emergencyBackfillRequired: true,
        is_deleted: false
      });

      // 3. Checked-in Patient in Queue
      await window._db.clinicQueue.setItem('test-queue-123', {
        id: 'test-queue-123', petId: '123', petName: 'WaitingDog',
        ownerName: 'WaitOwner', ownerPhone: '123', appointmentId: 'app-1',
        serviceType: 'Consultation', checkInTime: pastTime, status: 'active'
      });
      return 'Data injected';
    });

    console.log('Reloading to pick up new data...');
    await page.reload({ waitUntil: 'networkidle' });

    // Wait for bootloader again
    console.log('Waiting for bootloader after reload...');
    await page.waitForFunction(() => {
      return !!document.querySelector('#login-username') || !!document.querySelector('aside');
    }, { timeout: 10000 });

    // 3. Login
    console.log('Logging in...');
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasLogin = await page.evaluate(() => !!document.querySelector('#login-username'));
    if (bodyText.includes('Secure Clinician Sign-In') || hasLogin) {
      const usernameSelect = await page.$('#login-username');
      const pinInput = await page.$('#login-pin');
      const loginBtn = await page.$('button[type="submit"]');
      if (usernameSelect) await usernameSelect.selectOption('ashpoint_owner');
      if (pinInput) await pinInput.fill('5692');
      if (loginBtn) await loginBtn.click();
      await page.waitForTimeout(2000);
      console.log('Logged in successfully');
    }

    // Explicitly navigate to Dashboard
    const dashLink = await page.$('text=Dashboard');
    if (dashLink) await dashLink.click();
    await page.waitForSelector('text=Clinic Floor Ops', { timeout: 5000 });

    // Verification 1 & 2: Needs Attention alerts
    console.log('Verifying Needs Attention items...');
    await page.waitForSelector('text=Test Expired Med has Expired', { timeout: 3000 });
    await page.waitForSelector('text=Complete details for EmergDog', { timeout: 3000 });
    console.log('✅ Expired item and emergency intake detected.');

    // Verification 3: Live Queue timing
    console.log('Verifying Live Queue wait times...');
    await page.waitForSelector('text=WaitingDog');
    const isOverdue = await page.locator('.text-amber-600').count() > 0;
    if (!isOverdue) throw new Error('Live Queue overdue styling not found');
    console.log('✅ Checked-in patient correctly shows overdue time.');

    // Verification 4: Navigation Impact
    console.log('Verifying Needs Attention navigation...');
    await page.click('text=Test Expired Med has Expired');
    await page.waitForSelector('text=Total Registry', { timeout: 10000 }); console.log('✅ Navigated to Inventory successfully.');
    
    // Return to dashboard
    await page.click('text=Dashboard');
    await page.waitForSelector('text=Clinic Floor Ops');

    console.log('Clearing injected data...');
    await page.evaluate(async () => {
      return new Promise((resolve) => {
        const req = indexedDB.open('CeylonPetsVault', 1);
        req.onsuccess = (e) => {
          const idb = e.target.result;
          const tx = idb.transaction(['inventory', 'appointments', 'clinicQueue'], 'readwrite');
          tx.objectStore('inventory').delete('test-exp-123');
          tx.objectStore('appointments').delete('test-emerg-123');
          tx.objectStore('clinicQueue').delete('test-queue-123');
          tx.oncomplete = () => resolve();
        };
      });
    });

    console.log('🎉 Dashboard Verification Sequence Complete!');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    await page.screenshot({ path: 'fail.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
