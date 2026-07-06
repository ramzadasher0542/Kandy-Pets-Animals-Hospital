import puppeteer from 'puppeteer';
import fs from 'fs';

async function captureConsole() {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  const logs = [];

  page.on('console', msg => {
    logs.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
  });

  page.on('pageerror', error => {
    logs.push(`[PAGE_ERROR] ${error.message}`);
  });

  page.on('requestfailed', request => {
    logs.push(`[REQUEST_FAILED] ${request.url()} - ${request.failure()?.errorText}`);
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    // Wait an extra 3 seconds to let React effects settle
    await new Promise(r => setTimeout(r, 3000));
  } catch (err) {
    logs.push(`[NAVIGATION_ERROR] ${err.message}`);
  }

  await browser.close();

  fs.writeFileSync('console_logs.txt', logs.join('\n'));
  console.log('Successfully captured console logs to console_logs.txt');
}

captureConsole().catch(console.error);
