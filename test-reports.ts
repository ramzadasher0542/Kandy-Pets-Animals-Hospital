import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("1. Navigating to http://localhost:3000");
    await page.goto('http://localhost:3000');

    console.log("2. Logging in with PIN 5692");
    await page.selectOption('select#login-username', 'ashpoint_owner');
    await page.fill('[data-testid="input-pin"]', '5692');
    await page.click('[data-testid="btn-verify-pin"]');

    // Wait for successful login (nav-reports should appear)
    await page.waitForSelector('[data-testid="nav-reports"]', { state: 'visible', timeout: 5000 });

    console.log("3. Clicking nav-reports to open Reports panel");
    await page.click('[data-testid="nav-reports"]');
    await page.waitForTimeout(1000);

    console.log("4. Finding the cash adjustment form...");
    // Since we know the DOM might not have it, let's try to look for inputs.
    // If we fail here, we will output exactly what happened.
    const inputs = await page.$$('input');
    console.log(`Found ${inputs.length} inputs on Reports panel.`);
    
    // Check if there's any button like "Adjust Drawer" or "Add Cash"
    const buttons = await page.$$('button');
    let adjustBtn = null;
    for (const btn of buttons) {
      const text = await btn.textContent();
      if (text && text.toLowerCase().includes('adjust')) {
        adjustBtn = btn;
        break;
      }
    }
    
    if (adjustBtn) {
      console.log("Found an 'Adjust' button, clicking it...");
      await adjustBtn.click();
      await page.waitForTimeout(500);
    } else {
      console.log("Could not find any 'Adjust' button to open the form.");
    }

    const amountInput = await page.$('input[type="number"]');
    if (!amountInput) {
      console.log("Playwright step 4/5 failed: Cash adjustment form (amount input) was not found on the page.");
      console.log("ReportsManager UI does not render the Add Cash Adjustment form.");
      throw new Error("Form not found");
    }

    console.log("5. Filling in adjustment WITHOUT completing PIN verification...");
    await amountInput.fill('100');
    const reasonInput = await page.$('input[type="text"]');
    if (reasonInput) await reasonInput.fill('Test Playwright Adjustment');
    
    // There should be a submit button in the form
    const formSubmit = await page.$('button[type="submit"]');
    if (!formSubmit) {
       console.log("Playwright step 5 failed: No submit button found.");
       throw new Error("Submit button not found");
    }

    // Set up dialog handler for window.prompt
    let promptHandled = false;
    let promptMessage = "";
    page.once('dialog', async dialog => {
      promptHandled = true;
      promptMessage = dialog.message();
      console.log(`Intercepted dialog: ${promptMessage}`);
      await dialog.accept(''); // Provide empty PIN to fail verification
    });

    await formSubmit.click();
    
    // Wait a bit to see if toast appears or what happens
    await page.waitForTimeout(1000);
    if (promptHandled) {
      console.log("Attempted to submit with empty PIN. PIN verification correctly intercepted.");
      // check for error toast
      const toastText = await page.textContent('.toast-error, [role="alert"]', { timeout: 2000 }).catch(() => null);
      console.log(`Toast result: ${toastText || 'No error toast found'}`);
    } else {
      console.log("Playwright step 5 failed: No PIN prompt appeared, or submission failed before prompt.");
    }

    // Step 6: Valid adjustment
    console.log("6. Filling in valid adjustment with correct PIN...");
    page.once('dialog', async dialog => {
      console.log(`Intercepted dialog: ${dialog.message()}`);
      await dialog.accept('5692'); // Valid PIN
    });
    
    await formSubmit.click();
    await page.waitForTimeout(1000);
    
    console.log("7. Checking saved record in Reports...");
    const textContent = await page.textContent('body');
    if (textContent && textContent.includes('Test Playwright Adjustment')) {
       console.log("Found saved record in Reports list.");
       if (textContent.includes('Admin')) {
         console.log("Record shows 'Admin' instead of real user.");
       } else {
         console.log("Record correctly shows the real user's name.");
       }
    } else {
       console.log("Playwright step 7 failed: Saved record not found in Reports list.");
    }

    console.log("8. Navigating to Shift panel to check shared data...");
    await page.click('[data-testid="nav-shift"]');
    await page.waitForTimeout(1000);
    const shiftTextContent = await page.textContent('body');
    if (shiftTextContent && shiftTextContent.includes('Test Playwright Adjustment')) {
       console.log("Found same adjustment in ShiftManager! Shared DB works.");
    } else {
       console.log("Playwright step 8 failed: Adjustment not found in ShiftManager.");
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
