const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('select#login-username');

    // 1. Log in as admin to create manager
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    // 2. Go to staff and create manager
    await page.click('text=Staff & Payroll');
    await page.click('button:has-text("Add Staff Member")');
    await page.fill('div:has(> label:has-text("Full Name *")) > input', 'Jane Manager');
    await page.click('button:text-is("Save Profile")');
    await page.waitForTimeout(1000);

    // Create login
    await page.locator('button:has-text("Create Login")').last().click();
    await page.waitForSelector('text=Confirm It’s You');
    await page.locator('input[type="password"]').last().fill('5692');
    await page.locator('button:has-text("Confirm")').click();

    await page.waitForSelector('text=Create Login');
    await page.fill('#login-username', 'janemanager'); 
    await page.selectOption('#login-role', 'manager'); 
    await page.fill('#login-pin', '12345678'); 
    await page.click('button:text-is("Save")');
    await page.waitForTimeout(1500);

    // Take screenshot of the screen to see what is blocking logout
    await page.screenshot({ path: 'before-logout.png' });

    // Close any modal by clicking backdrop if it's there, or just reload
    await page.reload({ waitUntil: 'networkidle' });

    // 3. Login as manager
    await page.waitForSelector('select#login-username');
    // Wait for users to load
    await page.waitForFunction(() => {
      const select = document.querySelector('select#login-username');
      return select && Array.from(select.options).some(o => o.value === 'janemanager');
    });
    await page.selectOption('select#login-username', 'janemanager');
    await page.fill('input#login-pin', '12345678');
    await page.click('button:has-text("Verify")');
    
    // Wait for Dashboard
    await page.waitForSelector('text=Dashboard');
    
    // Check if Settings exists
    const settingsButton = await page.$('text=Settings');
    console.log("Settings Button Found: " + !!settingsButton);

    await page.screenshot({ path: 'manager-view.png' });

  } catch (err) {
    console.error(err);
    await page.screenshot({ path: 'error.png' });
  } finally {
    await browser.close();
  }
})();
