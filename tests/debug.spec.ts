import { test } from '@playwright/test';

test('debug dom', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(1000);
  
  const html = await page.evaluate(() => {
    return document.body.innerHTML;
  });
  
  console.log('PAGE HTML:\n', html);
});
