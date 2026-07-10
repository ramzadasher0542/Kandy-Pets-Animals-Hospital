import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to http://localhost:3000");
    await page.goto('http://localhost:3000');

    console.log("Logging in...");
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('[data-testid="input-pin"]', '5692');
    await page.click('[data-testid="btn-verify-pin"]');
    
    // Wait for app to load
    await page.waitForSelector('svg.lucide-bell', { state: 'visible', timeout: 5000 });

    console.log("Clicking Staff & Payroll nav...");
    await page.click('[data-testid="nav-staff"]');
    await page.waitForTimeout(1000);

    // Create staff member first
    console.log("Clicking Add Staff Member...");
    await page.click('button:has-text("Add Staff Member")');
    await page.waitForTimeout(1000);

    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length >= 3) {
      await textInputs[0].fill('Test Vet');
      await textInputs[1].fill('Veterinarian');
      await textInputs[2].fill('Clinical');
    }
    await page.click('button:has-text("Save Profile")');
    await page.waitForTimeout(1000);

    console.log("Clicking Time Clock tab...");
    await page.click('button:has-text("Time Clock")');
    await page.waitForTimeout(1000);

    console.log("Selecting 'Test Vet' from dropdown...");
    const selects = await page.$$('select');
    const select = selects[0];
    
    const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
    const testVetOpt = options.find(o => o.text?.includes('Test Vet'));
    
    if (!testVetOpt) {
       console.log("FAILED: 'Test Vet' not found in dropdown.");
       return;
    }

    await select.selectOption(testVetOpt.value);
    await page.waitForTimeout(500);

    console.log("Clicking 'Clock In'...");
    await page.click('button:has-text("Clock In")');
    await page.waitForTimeout(1000);

    const clockPanelText = await page.textContent('main');
    if (clockPanelText?.includes('is currently CLOCKED IN since')) {
       console.log("Confirmed: Status changes to 'Test Vet is currently CLOCKED IN since HH:MM'");
    } else {
       console.log("FAILED: Status did not change correctly.");
    }

    console.log("Checking if 'Clock In' is disabled...");
    const clockInButton = await page.$('button:has-text("Clock In")');
    const isDisabled = await clockInButton?.evaluate(b => (b as HTMLButtonElement).disabled);
    if (isDisabled) {
       console.log("Confirmed: 'Clock In' button is disabled.");
    } else {
       console.log("FAILED: 'Clock In' button is NOT disabled.");
    }

    console.log("Clicking 'Clock Out'...");
    await page.click('button:has-text("Clock Out")');
    await page.waitForTimeout(1000);

    const mainTextAfter = await page.textContent('main');
    if (mainTextAfter?.includes('0h 0m') || mainTextAfter?.match(/\dh \dm/)) {
       console.log("Confirmed: durationMinutes appears in the entry list.");
    } else {
       console.log("FAILED: durationMinutes not found in the entry list.");
    }

    if (mainTextAfter?.includes('Test Vet')) {
       console.log("Confirmed: Entry appears in 'Today\\'s Entries'.");
    } else {
       console.log("FAILED: Entry did not appear in 'Today\\'s Entries'.");
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
