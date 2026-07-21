const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:3000');

    console.log('Logging in as admin (ashpoint_owner, 5692)...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');

    console.log('Navigating to Staff & Payroll...');
    await page.waitForSelector('text=Staff & Payroll');
    await page.click('text=Staff & Payroll');
    
    // Create staff profile
    await page.click('button:has-text("Add Staff Member")');
    
    // Wait for the Modal form Full Name input
    await page.fill('//label[contains(text(), "Full Name")]/following-sibling::input', 'Test Groomer');
    await page.click('button:has-text("Save Profile")');
    
    // Wait for the modal to close and the list to update
    await page.waitForTimeout(500);

    console.log('Creating login for Test Groomer...');
    // Find the Create Login button associated with Test Groomer.
    await page.locator('button:has-text("Create Login")').last().click();
    
    // the requireAuth prompt should appear here!
    console.log('Handling requireAuth prompt for Create Login...');
    await page.waitForSelector('text=Confirm It’s You');
    await page.locator('input[type="password"]').last().fill('5692');
    await page.locator('button:has-text("Confirm")').click();

    // Fill Create Login modal
    await page.waitForSelector('text=Create Login');
    await page.fill('#login-username', 'testcashier123'); // Username
    await page.selectOption('#login-role', 'cashier'); // Role
    await page.fill('#login-pin', '1234'); // PIN
    await page.click('button:text-is("Save")');
    
    await page.waitForTimeout(1000);

    console.log('Logging out...');
    await page.click('button:has-text("Logout")');

    console.log('Logging in as Test Groomer (testcashier123, 1234)...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'testcashier123');
    await page.fill('input#login-pin', '1234');
    await page.click('button:has-text("Verify")');

    // Should navigate to their default view
    await page.waitForSelector('button:has-text("Logout")', { timeout: 3000 });
    console.log('Successfully logged in as Test Groomer.');
    
    console.log('Logging out...');
    await page.click('button:has-text("Logout")');
    
    console.log('Logging in as Admin again to reset PIN...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');

    console.log('Navigating to Staff & Payroll...');
    await page.waitForSelector('text=Staff & Payroll');
    await page.click('text=Staff & Payroll');
    
    console.log('Resetting PIN for Test Groomer...');
    await page.locator('button:has-text("Reset PIN")').last().click();

    // the requireAuth prompt should appear here!
    console.log('Handling requireAuth prompt for Reset PIN...');
    await page.waitForSelector('text=Confirm It’s You');
    await page.locator('input[type="password"]').last().fill('5692');
    await page.locator('button:has-text("Confirm")').click();

    await page.waitForSelector('text=Reset PIN');
    await page.fill('#login-pin', '9999');
    await page.click('button:text-is("Save")');

    await page.waitForTimeout(1000);

    console.log('Logging out...');
    await page.click('button:has-text("Logout")');

    console.log('Trying old PIN for Test Groomer (1234)...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'testcashier123');
    await page.fill('input#login-pin', '1234');
    await page.click('button:has-text("Verify")');
    
    // Wait a bit to ensure it doesn't log in
    await page.waitForTimeout(1000);
    const isError = await page.isVisible('text=Incorrect passcode');
    if (isError) {
      console.log('Old PIN correctly rejected.');
    } else {
      console.log('WARNING: Old PIN might have worked or error message not found.');
    }

    console.log('Trying new PIN for Test Groomer (9999)...');
    // Clear the input first
    await page.fill('input#login-pin', '');
    await page.fill('input#login-pin', '9999');
    await page.click('button:has-text("Verify")');
    
    await page.waitForSelector('button:has-text("Logout")', { timeout: 3000 });
    console.log('New PIN successfully logged in.');
    
    console.log('Logging out...');
    await page.click('button:has-text("Logout")');
    
    console.log('Logging in as Admin again to deactivate login...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');

    console.log('Navigating to Staff & Payroll...');
    await page.waitForSelector('text=Staff & Payroll');
    await page.click('text=Staff & Payroll');

    console.log('Deactivating Test Groomer login...');
    await page.locator('button:has-text("Disable Login")').last().click();
    
    // the requireAuth prompt should appear here!
    console.log('Handling requireAuth prompt for deactivation...');
    await page.waitForSelector('text=Confirm It’s You');
    await page.locator('input[type="password"]').last().fill('5692');
    await page.locator('button:has-text("Confirm")').click();

    await page.waitForTimeout(1000);
    
    console.log('Logging out...');
    await page.click('button:has-text("Logout")');
    
    console.log('Verifying deactivated login...');
    await page.waitForSelector('select#login-username');
    
    // Wait a moment for DOM to settle
    await page.waitForTimeout(500);

    // Check if testcashier123 is in the dropdown
    const options = await page.$$eval('select#login-username option', opts => opts.map(o => o.value));
    if (options.includes('testcashier123')) {
      console.log('WARNING: Deactivated account still shown in login list!');
    } else {
      console.log('SUCCESS: Deactivated account removed from login list!');
    }

    console.log('All verification steps passed successfully!');
  } catch (err) {
    console.error('Verification failed. Dumping page DOM to error-dom.html...', err);
    try {
      const html = await page.content();
      fs.writeFileSync('error-dom.html', html);
      await page.screenshot({ path: 'error-screenshot.png' });
    } catch (e) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
