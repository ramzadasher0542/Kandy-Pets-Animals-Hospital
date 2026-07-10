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
    
    // Wait for header to appear
    await page.waitForSelector('svg.lucide-bell', { state: 'visible', timeout: 5000 });

    // TEST A
    console.log("--- TEST A ---");
    const bellButtons = await page.$$('button:has(svg.lucide-bell)');
    if (bellButtons.length > 0) {
      console.log("Bell icon is visible in the header.");
      const bell = bellButtons[0];
      const badge = await bell.$('span');
      if (badge) {
         const count = await badge.textContent();
         console.log(`Badge count on the bell is: ${count?.trim()}`);
      } else {
         console.log("No badge count found on the bell.");
      }
      
      console.log("Clicking the bell icon...");
      await bell.click();
      await page.waitForTimeout(1000); // wait for modal
      
      const modalText = await page.textContent('body');
      if (modalText && modalText.includes("Playwright test alert")) {
        console.log("Confirmed: 'Playwright test alert' is visible inside the modal.");
      } else {
        console.log("FAILED: 'Playwright test alert' was not found in the modal.");
      }
    } else {
      console.log("FAILED: Bell icon NOT found.");
    }

    // TEST B
    console.log("--- TEST B ---");
    const bodyText = await page.textContent('body');
    if (bodyText && bodyText.includes('HIPAA')) {
      console.log("FAILED: The text 'HIPAA' still appears on the page.");
    } else {
      console.log("Confirmed: The text 'HIPAA' does not appear anywhere on the page.");
    }

    // close modal if needed
    const closeBtn = await page.$('button:has-text("✕")');
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(500);

    // TEST C
    console.log("--- TEST C ---");
    console.log("Navigating to Dashboard...");
    await page.click('[data-testid="nav-dashboard"]');
    await page.waitForTimeout(1000);
    
    const dashboardText = await page.textContent('main');
    if (dashboardText && dashboardText.includes('Playwright Test Item') && (dashboardText.includes('EXPIRED') || dashboardText.includes('EXPIRED') || dashboardText.includes('0 Days') || dashboardText.includes('0 Days'))) {
      console.log("Confirmed: The expired item appears in the Inventory SOS panel with correct labels.");
    } else {
       console.log("FAILED: The expired item was not found in the Inventory SOS panel, or labels are wrong.");
       // Check if item is there at all
       if (dashboardText && dashboardText.includes('Playwright Test Item')) {
         console.log("Note: Item found but labels 'EXPIRED' or '0 Days' missing.");
       }
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
