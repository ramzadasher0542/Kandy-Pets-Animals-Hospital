const { chromium, expect } = require('@playwright/test');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:3000');
    await page.waitForSelector('select#login-username');

    console.log('1. Setting idleLogoutMinutes to 0.05 (3 seconds) via DB injection...');
    await page.evaluate(async () => {
       const config = await window._db.system.getItem('config') || {};
       config.idleLogoutMinutes = 0.05;
       await window._db.system.setItem('config', config);
    });
    await page.reload();

    console.log('Logging in as owner...');
    await page.waitForSelector('select#login-username');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    console.log('2. Waiting for 4 seconds of NO activity...');
    await page.waitForTimeout(4000);
    
    // We should be logged out
    const isLoggedOut = await page.$('text=Logged out due to inactivity');
    if (!isLoggedOut) throw new Error('Failed to auto-logout after 3 seconds of inactivity!');
    console.log('Auto-logout triggered successfully with the correct message.');

    console.log('3. Logging back in to test activity reset...');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    console.log('Waiting 2 seconds, clicking around to reset timer, then waiting 2 more seconds...');
    await page.waitForTimeout(2000);
    await page.mouse.click(10, 10);
    await page.waitForTimeout(2000);
    
    // We should still be on the dashboard
    const isDashboardStillThere = await page.$('text=Dashboard');
    if (!isDashboardStillThere) throw new Error('Activity did NOT reset the timer! Premature logout.');
    console.log('Timer was successfully reset by activity.');

    console.log('4. Clicking Sign Out...');
    await page.click('text=Sign Out');
    await page.waitForSelector('select#login-username');
    
    // Verify Sign Out completely cleared state (e.g. username select is blank)
    const usernameValue = await page.$eval('select#login-username', el => el.value);
    if (usernameValue !== '') throw new Error('Sign Out did not clear the selectedUsername state!');
    console.log('Sign Out worked perfectly and cleared form state.');

    console.log('5. Logging in to test Switch User...');
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    // Go to POS to change active view
    await page.click('text=POS');
    await page.waitForTimeout(500);

    // Inject a spy to check if full reload happens. We can just set a window variable
    await page.evaluate(() => { window._didNotReload = true; });
    
    await page.click('text=Switch User');
    await page.waitForSelector('select#login-username');
    
    const didNotReload = await page.evaluate(() => window._didNotReload);
    if (!didNotReload) throw new Error('Switch User triggered a full page reload!');
    
    // Both Switch User and Sign Out now clear the username and view state cleanly
    const switchUsernameVal = await page.$eval('select#login-username', el => el.value);
    if (switchUsernameVal !== '') throw new Error('Switch User did not clear the username properly!');
    console.log('Switch User was fast and preserved in-memory state!');

    console.log('6. Setting idleLogoutMinutes to Never (undefined)...');
    await page.evaluate(async () => {
       const config = await window._db.system.getItem('config') || {};
       delete config.idleLogoutMinutes;
       await window._db.system.setItem('config', config);
    });
    
    // Wait for App to detect changes? No, App only reads on reload or Settings change. 
    // I will simulate Settings change by just reloading.
    await page.reload();

    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('input#login-pin', '5692');
    await page.click('button:has-text("Verify")');
    await page.waitForSelector('text=Dashboard');

    console.log('Waiting 4 seconds...');
    await page.waitForTimeout(4000);
    
    const isStillLoggedIn = await page.$('text=Dashboard');
    if (!isStillLoggedIn) throw new Error('Auto-logout triggered even when set to Never!');
    console.log('No auto-logout occurred when set to Never.');
    
    console.log('All 6 AUTH-8 specific steps verified perfectly!');

  } catch (error) {
    console.error('Verification failed. Dumping page DOM to error-dom-auth8.html...', error.message);
    const html = await page.content();
    fs.writeFileSync('error-dom-auth8.html', html);
    await page.screenshot({ path: 'error-screenshot-auth8.png', fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
