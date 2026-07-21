const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:3000');

    // 1. Log in as admin to create a manager account
    console.log('Logging in as admin (ashpoint_owner, 5692)...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    console.log('Navigating to Staff & Payroll...');
    await page.click('text=Staff & Payroll');
    
    // Find a profile to link to. If there's an existing one without a user, use it.
    // First, let's create a new staff profile for the manager if needed.
    await page.click('button:has-text("Add Staff Member")');
    // Using label + input to target the fields
    await page.fill('div:has(> label:has-text("Full Name *")) > input', 'Test Manager Profile');
    await page.fill('div:has(> label:has-text("Position")) > input', 'Manager');
    await page.click('button:text-is("Save Profile")');
    
    await page.waitForTimeout(500);

    console.log('Creating login for Test Manager...');
    await page.locator('button:has-text("Create Login")').last().click();
    
    console.log('Handling requireAuth prompt for Create Login...');
    await page.waitForSelector('text=Confirm It’s You');
    await page.locator('input[type="password"]').last().fill('5692');
    await page.locator('button:has-text("Confirm")').click();

    // Fill Create Login modal
    await page.waitForSelector('text=Create Login');
    await page.fill('#login-username', 'testmanager123'); // Username
    await page.selectOption('#login-role', 'manager'); // Role
    await page.fill('#login-pin', '12345678'); // Password (min 8)
    await page.click('button:text-is("Save")');
    
    console.log('Reloading to clear session (logs out automatically)...');
    await page.reload({ waitUntil: 'networkidle' });

    // 2. Log in as the manager
    console.log('Logging in as Test Manager (testmanager123, 12345678)...');
    await page.waitForSelector('select#login-username');
    // Wait for the options to populate from indexeddb
    await page.waitForFunction(() => {
      const select = document.querySelector('select#login-username');
      return select && Array.from(select.options).some(o => o.value === 'testmanager123');
    });
    await page.selectOption('select#login-username', 'testmanager123');
    await page.fill('input#login-pin', '12345678');
    await page.click('button:has-text("Verify")');

    // Wait for main UI
    await page.waitForSelector('button:has-text("Logout")', { timeout: 3000 });
    console.log('Successfully logged in as Test Manager.');
    
    // 3. Verify Settings is NOT visible
    console.log('Verifying Settings button is hidden...');
    const settingsButton = await page.$('text=Settings');
    
    if (settingsButton) {
      throw new Error('Manager CAN see Settings! Verification failed.');
    } else {
      console.log('Verified: Manager CANNOT see Settings button in sidebar.');
    }
    
    console.log('All verification steps passed successfully!');

  } catch (error) {
    console.error('Verification failed. Dumping page DOM to error-dom.html...', error.message);
    const html = await page.content();
    fs.writeFileSync('error-dom.html', html);
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    console.error('Call log:', error);
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
