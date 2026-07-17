const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('#login-pin', '1234');
  await page.click('button[type="submit"]');
  
  await page.waitForSelector('text=Dashboard', { timeout: 10000 });
  await page.waitForTimeout(2000); // let UI settle
  
  const panels = [
    { id: 'dashboard', name: 'Dashboard' },
    { id: 'pos', name: 'POS_Register' },
    { id: 'invoices', name: 'Invoices' },
    { id: 'customers', name: 'Customers' },
    { id: 'appointments', name: 'Appointments' },
    { id: 'boarding', name: 'Boarding' },
    { id: 'medical', name: 'Medical_Records' },
    { id: 'laboratory', name: 'Laboratory' },
    { id: 'vaccinations', name: 'Vaccinations' },
    { id: 'grooming', name: 'Grooming' },
    { id: 'inventory', name: 'Inventory' },
    { id: 'staff', name: 'Staff_Management' },
    { id: 'reports', name: 'Reports' },
    { id: 'settings', name: 'Settings' }
  ];

  for (const panel of panels) {
    if (panel.id === 'settings') {
      await page.click('button[data-testid="nav-settings"]');
    } else {
      await page.click(`a[data-testid="nav-${panel.id}"], button[data-testid="nav-${panel.id}"]`);
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `screenshots/${panel.name}.png`, fullPage: true });
    console.log(`Screenshot taken for ${panel.name}`);
  }

  await browser.close();
})();
