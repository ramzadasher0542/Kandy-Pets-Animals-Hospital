import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: true });
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

    // Create staff member
    console.log("Creating 'Test Vet' profile with monthly salary 100000...");
    await page.click('button:has-text("Add Staff Member")');
    await page.waitForTimeout(1000);
    const textInputs = await page.$$('input[type="text"]');
    if (textInputs.length >= 3) {
      await textInputs[0].fill('Test Vet');
      await textInputs[1].fill('Veterinarian');
      await textInputs[2].fill('Clinical');
    }
    const selects = await page.$$('select');
    // Change to monthly
    await selects[selects.length - 1].selectOption('monthly');
    await page.waitForTimeout(500);
    const numberInputs = await page.$$('input[type="number"]');
    if (numberInputs.length > 0) {
      await numberInputs[0].fill('100000');
    }
    await page.click('button:has-text("Save Profile")');
    await page.waitForTimeout(1000);

    console.log("1. Navigate to Payslips tab, find the finalized payslip from SP-5");
    await page.click('button:has-text("Payslips")');
    await page.waitForTimeout(1000);

    console.log("Generate draft for Test Vet...");
    const staffSelect = await page.$('select[data-testid="payslip-staff-select"]');
    const options = await staffSelect!.$$eval('option', opts => opts.map(o => ({ value: o.value, text: o.textContent })));
    const testVetOpt = options.find(o => o.text?.includes('Test Vet'));
    if (testVetOpt) await staffSelect!.selectOption(testVetOpt.value);
    await page.waitForTimeout(500);

    console.log("Click Calculate...");
    await page.click('button:has-text("Calculate")');
    await page.waitForTimeout(500);

    // Add deduction
    await page.click('button:has-text("Add Deduction")');
    await page.waitForTimeout(500);
    const dedLabels = await page.$$('input[data-testid^="payslip-deduction-label"]');
    await dedLabels[0].fill('Tax');
    const dedAmounts = await page.$$('input[data-testid^="payslip-deduction-amount"]');
    await dedAmounts[0].fill('5000');
    
    await page.click('button:has-text("Save as Draft")');
    await page.waitForTimeout(1000);

    console.log("Checking history list...");
    // Find draft in history
    const finalizeBtn = await page.$('button:has-text("Finalize")');
    if (finalizeBtn) {
       console.log("Confirmed: Draft generated successfully.");
       const downloadBtnDraft = await page.$('button:has-text("Download PDF")');
       if (!downloadBtnDraft) {
          console.log("3. Confirmed: 'Download PDF' button does NOT appear on draft payslips.");
       } else {
          console.log("FAILED: 'Download PDF' button appeared on a draft.");
       }

       // Finalize it
       await finalizeBtn.click();
       await page.waitForTimeout(1000);
    } else {
       console.log("FAILED: Could not find Finalize button.");
    }

    const downloadBtnFinal = await page.$('button:has-text("Download PDF")');
    if (downloadBtnFinal) {
       console.log("2. Confirmed: 'Download PDF' button is visible on finalized payslip.");
       
       // Trigger download
       const [download] = await Promise.all([
         page.waitForEvent('download'),
         downloadBtnFinal.click()
       ]);
       
       const downloadPath = await download.path();
       console.log(`4. Confirmed: A PDF file downloads (${download.suggestedFilename()})`);
       
       const dataBuffer = fs.readFileSync(downloadPath!);
       const pdfParseModule = await import('pdf-parse');
       const pdf = pdfParseModule.default || pdfParseModule;
       const data = await pdf(dataBuffer);
       const text = data.text;
       
       if (text.includes('Test Vet') && text.includes('100000.00') && text.includes('95000.00') && text.includes('Tax') && text.includes('5000.00')) {
          console.log("5. Confirmed: PDF contains correct staff name, gross pay amount, deduction, and net pay matching the screen.");
       } else {
          console.log("FAILED: PDF text does not match expectations.");
          console.log("PDF Text:", text);
       }

    } else {
       console.log("FAILED: 'Download PDF' button not visible on finalized payslip.");
    }

  } catch (err) {
    console.log(`Test run ended early: ${err}`);
  } finally {
    await browser.close();
  }
}

run();
