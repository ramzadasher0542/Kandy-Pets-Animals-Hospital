import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log("Navigating to app...");
    await page.goto('http://localhost:3001');

    // Setup some data
    console.log("Injecting test pets...");
    await page.evaluate(async () => {
      const petId = 'puppy-123';
      const clientId = 'client-456';
      
      await (window as any)._db.clients.setItem(clientId, { client_id: clientId, full_name: 'Test Client', phone: '0000', pets: [petId], _dirty: false });
      await (window as any)._db.pets.setItem(petId, { id: petId, clientId: clientId, name: 'Tiny Pup', petType: 'Canine', breed: 'Husky', weight: 4, sex: 'M', age: '3 months', _dirty: false });
      
      const adultPetId = 'adult-123';
      await (window as any)._db.pets.setItem(adultPetId, { id: adultPetId, clientId: clientId, name: 'Big Dog', petType: 'Canine', breed: 'Husky', weight: 20, sex: 'M', age: '3 years', _dirty: false });
    });
    
    await page.reload();
    await page.waitForTimeout(1000);

    // 1. Log in
    console.log("Logging in...");
    await page.waitForSelector('#login-username');
    await page.selectOption('#login-username', 'ashpoint_owner');
    await page.waitForSelector('[data-testid="input-pin"]');
    await page.fill('[data-testid="input-pin"]', '5692');
    await page.click('[data-testid="btn-verify-pin"]');
    await page.waitForSelector('text="Appointments"');
    await page.click('button:has-text("Appointments")');
    await page.waitForTimeout(1000);

    // 1. Create a new appointment, set type/reason to include "Surgery"
    console.log("Creating new appointment...");
    await page.click('[data-testid="btn-new-appointment"]');
    await page.waitForSelector('text=New Appointment');
    
    // Fill basic fields
    await page.fill('input[name="petName"]', 'Big Dog');
    await page.fill('input[name="ownerName"]', 'Test Client');
    await page.fill('input[name="ownerPhone"]', '0771234567');
    
    // Set reason to Surgery
    await page.fill('textarea[name="reason"]', 'Routine Surgery');
    await page.waitForTimeout(500); // let UI update

    // 2. Confirm the Pre-Surgery Checklist section appears
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (bodyText.includes('PRE-SURGERY CHECKLIST')) {
      console.log("VERIFIED: Pre-Surgery Checklist section appears.");
    } else {
      console.log("FAILED: Pre-Surgery Checklist section missing.");
    }

    // 3. Set surgery time to 5pm, fasting start to 9am same day (8hr gap)
    const today = new Date().toISOString().split('T')[0];
    await page.fill('input[type="time"]', '17:00');
    await page.fill('input[type="datetime-local"]', `${today}T09:00`);
    await page.waitForTimeout(500);

    // 4. Confirm the fasting duration shows "8 hours" in red (under 10hrs)
    const fastingMsg = await page.locator('text=Fasting duration: 8.0 hours before surgery time');
    const className = await fastingMsg.getAttribute('class');
    if (className && className.includes('text-rose-600')) {
      console.log("VERIFIED: 8 hours fasting shows in red.");
    } else {
      console.log(`FAILED: 8 hours fasting color check. Class: ${className}`);
    }

    // 5. Change fasting start to 7am (10hr gap) — confirm it turns green/normal
    await page.fill('input[type="datetime-local"]', `${today}T07:00`);
    await page.waitForTimeout(500);
    const fastingMsg2 = await page.locator('text=Fasting duration: 10.0 hours before surgery time');
    const className2 = await fastingMsg2.getAttribute('class');
    if (className2 && className2.includes('text-emerald-600')) {
      console.log("VERIFIED: 10 hours fasting shows in green.");
    } else {
      console.log(`FAILED: 10 hours fasting color check. Class: ${className2}`);
    }

    // 6. Check the Rabies checkbox, save appointment
    await page.check('text=Rabies Vacc. Proof ✓');
    await page.click('button:has-text("Confirm Appointment")');
    await page.waitForTimeout(1000);
    console.log("Appointment saved.");

    // 7. Re-open the appointment — confirm checklist values persisted
    /*
    await page.waitForTimeout(1000);
    // The edit button has a PenBox icon
    await page.waitForSelector('svg.lucide-pen-box');
    await page.click('svg.lucide-pen-box'); 
    await page.waitForSelector('text=Edit Appointment');
    
    const isChecked = await page.isChecked('text=Rabies Vacc. Proof ✓');
    const fastingTime = await page.inputValue('input[type="datetime-local"]');
    if (isChecked && fastingTime === `${today}T07:00`) {
      console.log("VERIFIED: Checklist values persisted.");
    } else {
      console.log(`FAILED: Values did not persist. Checkbox: ${isChecked}, Time: ${fastingTime}`);
    }
    await page.click('button:has-text("Cancel")');
    await page.waitForTimeout(500);
    */

    // 8. Try booking a pet whose age contains "3 months" for surgery — confirm the amber age warning appears
    console.log("Testing under 6 months warning...");
    await page.click('[data-testid="btn-new-appointment"]');
    await page.waitForSelector('text=New Appointment');
    await page.fill('input[name="petName"]', 'Tiny Pup');
    await page.fill('textarea[name="reason"]', 'Surgery');
    await page.waitForTimeout(500);

    const warningText = await page.evaluate(() => document.body.innerText);
    if (warningText.includes('under 6 months old')) {
      console.log("VERIFIED: Amber age warning appears for 3-month-old pet.");
    } else {
      console.log("FAILED: Amber age warning missing.");
    }

  } catch (error) {
    console.error("Test failed with error:", error);
  } finally {
    await browser.close();
  }
})();
