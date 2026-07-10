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

    const isPanelOpen = await page.textContent('main');
    if (isPanelOpen?.includes('Active Roster')) {
       console.log("Confirmed: Staff panel opened.");
    } else {
       console.log("FAILED: Staff panel did not open.");
    }

    console.log("Clicking Add Staff Member...");
    await page.click('button:has-text("Add Staff Member")');
    await page.waitForTimeout(1000);

    const isModalOpen = await page.textContent('body');
    if (isModalOpen?.includes('New Staff Profile')) {
       console.log("Confirmed: Modal opened.");
    } else {
       console.log("FAILED: Modal did not open.");
    }

    console.log("Filling form...");
    // The form has labels, we'll try to find the inputs
    await page.fill('input[type="text"]', 'Test Vet'); // First text input is full name
    // It's safer to fill by traversing from labels or using n-th input
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length >= 3) {
      await textInputs[0].fill('Test Vet');
      await textInputs[1].fill('Veterinarian');
      await textInputs[2].fill('Clinical');
    }
    
    await page.selectOption('select', 'hourly');
    
    const numInputs = await page.$$('input[type="number"]');
    if (numInputs.length >= 1) {
      await numInputs[0].fill('500');
    }

    const dateInputs = await page.$$('input[type="date"]');
    if (dateInputs.length >= 1) {
      await dateInputs[0].fill('2023-01-01'); // dummy date
    }

    console.log("Submitting...");
    await page.click('button:has-text("Save Profile")');
    await page.waitForTimeout(1000);

    const mainText = await page.textContent('main');
    if (mainText?.includes('Test Vet') && mainText?.includes('Veterinarian')) {
      console.log("Confirmed: Card appears in Roster tab.");
    } else {
      console.log("FAILED: Card did not appear in Roster tab.");
    }

    if (mainText?.includes('hourly')) {
      console.log("Confirmed: Card shows 'HOURLY' badge.");
      // Check amber color class if needed, but text inclusion is fine
    } else {
      console.log("FAILED: Card does not show 'HOURLY' badge.");
    }

    console.log("Clicking Link to Login tab...");
    await page.click('button:has-text("Link to Login")');
    await page.waitForTimeout(1000);

    const linkTabText = await page.textContent('main');
    if (linkTabText?.includes('Connect Staff to System Logins')) {
      console.log("Confirmed: Link to Login tab renders without error.");
    } else {
      console.log("FAILED: Link to Login tab did not render correctly.");
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
