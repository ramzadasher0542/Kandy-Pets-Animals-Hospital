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

    // Create a staff member for test
    console.log("Creating 'Test Vet' profile...");
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

    console.log("1. Navigate to nav-staff, click Schedule tab...");
    await page.click('button:has-text("Schedule")');
    await page.waitForTimeout(1000);

    console.log("2. Confirm current week's 7 columns render...");
    const dayCols = await page.$$('.min-h-\\[500px\\]');
    if (dayCols.length === 7) {
       console.log("Confirmed: 7 day columns rendered.");
    } else {
       console.log(`FAILED: Expected 7 columns, found ${dayCols.length}`);
    }
    
    // Get the date strings from the DOM before shifting
    const firstColTextBefore = await dayCols[0].textContent();

    console.log("3. Click 'Add Shift', fill in night shift...");
    await page.click('button:has-text("Add Shift")');
    await page.waitForTimeout(1000);
    
    // select staff
    const selects = await page.$$('select');
    const select = selects[0];
    const options = await select.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
    const testVetOpt = options.find(o => o.text?.includes('Test Vet'));
    if (testVetOpt) await select.selectOption(testVetOpt.value);

    // Date is prefilled to today by state. We only set times and role.
    const formTextInputs = await page.$$('input[type="text"]'); // role is text with list
    if (formTextInputs.length >= 2) {
      await formTextInputs[0].fill('Veterinarian'); // Role
    }
    const timeInputs = await page.$$('input[type="time"]');
    if (timeInputs.length >= 2) {
      await timeInputs[0].fill('22:00');
      await timeInputs[1].fill('06:00');
    }
    
    await page.click('button:has-text("Save Shift")');
    await page.waitForTimeout(1000);

    console.log("4. Confirm the shift block appears in today's column with '22:00–06:00'...");
    const mainText = await page.textContent('main');
    if (mainText?.includes('22:00–06:00')) {
       console.log("Confirmed: Shift block appears with correct overnight hours (22:00–06:00).");
    } else {
       console.log("FAILED: Shift block did not appear with correct hours.");
    }

    console.log("5. Click '< Prev Week' — confirm dates shift back 7 days...");
    // Find the Prev Week button (ChevronLeft icon)
    await page.click('button:has(svg.lucide-chevron-left)');
    await page.waitForTimeout(1000);

    const dayColsAfter = await page.$$('.min-h-\\[500px\\]');
    const firstColTextAfter = await dayColsAfter[0].textContent();
    
    // We expect the date number to be different.
    if (firstColTextBefore !== firstColTextAfter) {
       console.log("Confirmed: Dates shifted back (Prev Week worked).");
    } else {
       console.log("FAILED: Dates did not shift.");
    }
    
    // Go back to current week
    await page.click('button:has(svg.lucide-chevron-right)');
    await page.waitForTimeout(1000);

    console.log("6. Click the × on the shift — confirm it disappears...");
    // Hover over shift block so the X appears
    const shifts = await page.$$('.group');
    if (shifts.length > 0) {
       await shifts[0].hover();
       await page.waitForTimeout(500);
       await page.click('button:has(svg.lucide-x)');
       await page.waitForTimeout(1000);
       
       const mainTextFinal = await page.textContent('main');
       if (!mainTextFinal?.includes('22:00–06:00')) {
          console.log("Confirmed: Shift was deleted and disappeared from view.");
       } else {
          console.log("FAILED: Shift was NOT deleted from view.");
       }
    } else {
       console.log("FAILED: Could not find shift block to delete.");
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
