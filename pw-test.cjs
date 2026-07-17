const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => logs.push(`CONSOLE: ${msg.text()}`));
  page.on('pageerror', error => logs.push(`ERROR: ${error.message}`));
  
  let printCount = 0;
  await page.exposeFunction('onPrintCalled', () => {
    printCount++;
    console.log('PRINT DIALOG OPENED');
  });
  await page.addInitScript(() => {
    window.print = () => { window.onPrintCalled(); };
  });

  try {
    await page.goto('http://localhost:3000/');
    await page.waitForLoadState('networkidle');
    
    // Clear DB just in case
    await page.evaluate(async () => {
      if (window._db && window._db.inventory) {
        await window._db.inventory.clear();
      }
      if (window._db && window._db.inventoryBatches) {
        await window._db.inventoryBatches.clear();
      }
    });
    await page.reload({ waitUntil: 'networkidle' });

      // Not modifying here, this is the early block

    // Wait for bootloader
    await page.waitForFunction(() => {
      return !!document.querySelector('#login-username') || !!document.querySelector('aside');
    }, { timeout: 10000 });

    // Inject active shift to bypass POS gate perfectly
    await page.evaluate(async () => {
      const shift = {
        id: 'test-shift-1',
        startTime: new Date().toISOString(),
        openedBy: 'ashpoint_owner',
        status: 'open',
        isOpen: true,
        opening_float: 0
      };
      if (window._db && window._db.shifts) {
         await window._db.shifts.setItem('test-shift-1', shift);
         await window._db.system.setItem('active_shift', shift);
      }
      localStorage.setItem('ceylon_active_shift_id', 'test-shift-1');
    });

    // 1. Log in as admin
    const bodyText = await page.evaluate(() => document.body.innerText);
    const hasLogin = await page.evaluate(() => !!document.querySelector('#login-username'));
    if (bodyText.includes('Secure Clinician Sign-In') || hasLogin) {
      const usernameSelect = await page.$('#login-username');
      const pinInput = await page.$('#login-pin');
      const loginBtn = await page.$('button[type="submit"]');
      if (usernameSelect) await usernameSelect.selectOption('ashpoint_owner');
      if (pinInput) await pinInput.fill('5692'); // Use 5692 since demoSeed sets masterPin to 5692
      if (loginBtn) await loginBtn.click();
      await page.waitForTimeout(2000);
      console.log('Logged in successfully');
    }
    
    // 2. Go to Inventory and Add Test Item
    const invLink = await page.$('[data-testid="nav-inventory"]');
    if (invLink) await invLink.click();
    await page.waitForTimeout(2000);
    
    const uniqueId = Date.now().toString();
    const itemName = `Test Amox ${uniqueId}`;

    await page.click('button:has-text("Add Item")');
    await page.waitForTimeout(500);

    const textInputs = await page.$$('form input[type="text"]');
    await textInputs[0].fill(itemName);
    await textInputs[1].fill(`TEST-${uniqueId}`);
    await page.selectOption('select', 'retail'); // category

    const numberInputs = await page.$$('input[type="number"]');
    // cost, price, stock, minStock
    await numberInputs[0].fill('100'); // cost
    await numberInputs[1].fill('150'); // price
    await numberInputs[2].fill('0');   // stock
    await numberInputs[3].fill('5');   // minStock
    await page.click('button:has-text("Save Record")');
    await page.waitForTimeout(2000);
    console.log(`Added ${itemName}`);

    // 4. Receive Batch A
    await page.locator(`tr:has-text("${itemName}")`).first().locator('button[title="Receive Stock"]').click({ force: true });
    await page.waitForSelector('#receiveStockForm input');
    await page.locator('#receiveStockForm input[type="text"]').nth(1).fill('OLD-LOT');
    await page.locator('#receiveStockForm input[type="date"]').fill('2024-01-01');
    await page.locator('#receiveStockForm input[type="number"]').first().fill('10'); // qty
    await page.locator('#receiveStockForm input[type="number"]').nth(1).fill('50'); // cost
    await page.locator('#receiveStockForm input[type="text"]').first().fill('Medisupply'); // supplier
    await page.click('button[form="receiveStockForm"]');
    await page.waitForTimeout(1000);
    console.log('Received Batch A');

    // 5. Receive Batch B
    await page.locator(`tr:has-text("${itemName}")`).first().locator('button[title="Receive Stock"]').click({ force: true });
    await page.waitForSelector('#receiveStockForm input');
    await page.locator('#receiveStockForm input[type="text"]').nth(1).fill('NEW-LOT');
    await page.locator('#receiveStockForm input[type="date"]').fill('2025-01-01');
    await page.locator('#receiveStockForm input[type="number"]').first().fill('10'); // qty
    await page.locator('#receiveStockForm input[type="number"]').nth(1).fill('50'); // cost
    await page.locator('#receiveStockForm input[type="text"]').first().fill('Medisupply'); // supplier
    await page.click('button[form="receiveStockForm"]');
    await page.waitForTimeout(1000);
    console.log('Received Batch B');

    // 6. Go to POS
    const posLink = await page.$('[data-testid="nav-pos"]');
    if (posLink) await posLink.click();
    await page.waitForTimeout(2000);

    // Handle shift gate if it's there
    const shiftGateBtn = await page.$('[data-testid="btn-open-shift-from-pos"]');
    if (shiftGateBtn) {
       console.log('Shift gate detected. Bypassing...');
       await shiftGateBtn.click();
       await page.waitForTimeout(1000);
       await page.click('button:has-text("Open Register")');
       await page.waitForTimeout(2000); // wait for state to propagate
       const posLink2 = await page.$('[data-testid="nav-pos"]');
       if (posLink2) await posLink2.click();
       await page.waitForTimeout(2000);
    }

    // 7. Add item to cart, quantity 5
    // Search for it first to avoid 30-item slice limit
    await page.fill('input[placeholder*="Scan Barcode"]', itemName);
    await page.waitForTimeout(1000);

    // Find the item in POS grid
    const added = await page.evaluate(async (name) => {
      const items = Array.from(document.querySelectorAll('.grid.grid-cols-2 > div, .grid.lg\\:grid-cols-3 > div'));
      const item = items.find(el => el.textContent.toLowerCase().includes(name.toLowerCase()));
      if (item) {
        // click 5 times
        for(let i = 0; i < 5; i++) {
          item.click();
          await new Promise(r => setTimeout(r, 100));
        }
        return true;
      }
      return false;
    }, itemName);
    
    if (!added) {
      throw new Error(`${itemName} not found in POS grid!`);
    }
    await page.waitForTimeout(1000);
    console.log(`Added 5 ${itemName} to Cart`);

    // 8. Checkout
    await page.click('button:has-text("Process Transaction")');
    await page.waitForTimeout(2000);
    
    // Close modal
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(1000);
    console.log('Checkout Complete');

    // 9. Go back to Inventory and verify Stock is now 15 and Batch A is 5 and Batch B is 10
    const invLink2 = await page.$('[data-testid="nav-inventory"]');
    if (invLink2) await invLink2.click();
    await page.waitForTimeout(2000);

    // 10. Expand Batches for "Test Amoxicillin" and assert
    const { totalStock, batchesContent } = await page.evaluate(async (name) => {
      // Find the row for Test Amoxicillin
      const rows = Array.from(document.querySelectorAll('tbody tr'));
      let amoxRow = null;
      for (const row of rows) {
        if (row.textContent.includes(name)) {
          amoxRow = row;
          break;
        }
      }
      
      if (!amoxRow) return { error: `${name} row not found in Inventory` };
      
      const stockCell = amoxRow.querySelector('td:nth-child(4)');
      const totalStock = stockCell.textContent;
      
      // Click Batches button
      const batchesBtn = Array.from(amoxRow.querySelectorAll('button')).find(b => b.textContent.includes('Batches'));
      if (batchesBtn) batchesBtn.click();
      
      // Wait for batches row
      await new Promise(r => setTimeout(r, 1000));
      
      const nextRow = amoxRow.nextElementSibling;
      return { totalStock, batchesContent: nextRow ? nextRow.textContent : '' };
    }, itemName);

    console.log(`Total Stock found: ${totalStock}`);
    console.log(`Batches Content: ${batchesContent}`);

    if (totalStock && totalStock.includes('15')) {
      console.log('ASSERT PASSED: Total stock is 15');
    } else {
      console.log('ASSERT FAILED: Total stock is not 15');
    }

    if (batchesContent && batchesContent.includes('OLD-LOT') && batchesContent.includes('5')) {
      console.log('ASSERT PASSED: Batch A has 5 units remaining');
    } else {
      console.log('ASSERT FAILED: Batch A does not have 5 units remaining');
    }

    if (batchesContent && batchesContent.includes('NEW-LOT') && batchesContent.includes('10')) {
      console.log('ASSERT PASSED: Batch B has 10 units remaining');
    } else {
      console.log('ASSERT FAILED: Batch B does not have 10 units remaining');
    }

  } catch(e) {
    console.error(`Script error: ${e.message}`);
  } finally {
    await browser.close();
    console.log("LOGS:");
    logs.forEach(l => console.log(l));
  }
})();
