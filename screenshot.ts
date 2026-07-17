import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:3000');
  // Assuming there's a login or we just start at dashboard. The tests just go to localhost:5173
  await page.waitForTimeout(2000);

  // Take screenshot of Vaccinations
  await page.click('button:has-text("Vaccinations")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'vaccinations_empty.png' });
  
  // Click first patient to see detail
  await page.click('#vaccinations-module-container .cursor-pointer:nth-child(1)');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'vaccinations_data.png' });

  // Take screenshot of Laboratory
  await page.click('button:has-text("Laboratory")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'laboratory_empty.png' });

  // Click first patient
  await page.click('#laboratory-module-container .cursor-pointer:nth-child(1)');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'laboratory_data.png' });

  // Take screenshot of Grooming
  await page.click('button:has-text("Grooming")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'grooming_empty.png' });

  // Click first patient
  await page.click('#grooming-module-container .cursor-pointer:nth-child(1)');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'grooming_data.png' });

  // Take screenshot of PatientPortal
  await page.click('button:has-text("Pets")');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'patientportal_empty.png' });

  await browser.close();
})();
