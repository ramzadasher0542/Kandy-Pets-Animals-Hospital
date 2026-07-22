const { chromium } = require('playwright');
const PORT = 3099;

async function nav(page, label) {
  return page.evaluate((t) => {
    for (const btn of document.querySelectorAll('button')) {
      if (btn.textContent?.toLowerCase().includes(t)) { btn.click(); return true; }
    }
    return false;
  }, label);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));

  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Login
  await page.selectOption('#login-username', 'ashpoint_owner');
  await page.fill('[data-testid="input-pin"]', '5692');
  await page.click('[data-testid="btn-verify-pin"]');
  await page.waitForTimeout(2000);

  const panels = process.argv.slice(2);
  for (const panel of panels) {
    errors.length = 0;
    await nav(page, panel);
    await page.waitForTimeout(2000);
    const crashed = await page.evaluate(() =>
      document.body.innerText.includes("This page couldn't load")
    );
    const filename = `screenshots/${panel.replace(/[^a-z]/g, '-')}.png`;
    await page.screenshot({ path: filename, fullPage: false });
    if (crashed) {
      console.log(`[FAIL] ${panel}: CRASHED — ${errors[0] || 'unknown'}`);
    } else {
      console.log(`[PASS] ${panel}: OK → ${filename}`);
    }
  }

  if (errors.length > 0) console.log(`React errors: ${errors.join('; ')}`);
  await browser.close();
})();
