import puppeteer from 'puppeteer';
import fs from 'fs';

async function run() {
  const browser = await puppeteer.launch({ executablePath: 'C:\\Users\\ASH POINT SOLUTIONS\\.cache\\puppeteer\\chrome\\win64-150.0.7871.24\\chrome-win64\\chrome.exe' });
  const page = await browser.newPage();
  
  const logs = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    logs.push(`[${type.toUpperCase()}] ${text}`);
    console.log(`[BROWSER] ${type.toUpperCase()}: ${text}`);
  });

  page.on('pageerror', error => {
    logs.push(`[PAGE_ERROR] ${error.message}`);
    console.log(`[BROWSER_ERROR] ${error.message}`);
  });

  page.on('requestfailed', request => {
    logs.push(`[REQUEST_FAILED] ${request.url()} - ${request.failure()?.errorText || 'Unknown'}`);
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0', timeout: 30000 });
    
    // Simulate some clicks to trigger potential errors on different tabs
    // Note: Puppeteer syntax used here. We will just try to click on the sidebar navigation items.
    const tabs = ['Customers', 'Vaccinations', 'Examinations', 'Laboratory', 'Boarding/Hotel', 'Grooming Salon', 'Inventory', 'Invoices', 'Shift & Drawer', 'Reports', 'Settings'];
    
    for (const tabName of tabs) {
      try {
        const elements = await page.$x(`//div[contains(text(), '${tabName}')] | //span[contains(text(), '${tabName}')]`);
        if (elements.length > 0) {
          await elements[0].click();
          await new Promise(resolve => setTimeout(resolve, 1000)); // wait for render
        }
      } catch (e) {
        console.log(`Could not click tab ${tabName}`);
      }
    }
    
  } catch (err) {
    logs.push(`[PUPPETEER_ERROR] ${err.message}`);
    console.log(`[PUPPETEER_ERROR] ${err.message}`);
  } finally {
    fs.writeFileSync('console_errors.log', logs.join('\n'));
    await browser.close();
    console.log('Saved browser logs to console_errors.log');
  }
}

run();
