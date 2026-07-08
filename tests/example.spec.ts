import { test, expect } from '@playwright/test';

test('app should load successfully', async ({ page }) => {
  await page.goto('http://localhost:3000/');
  
  // Wait for the app to load by checking for a common element
  // Assuming the app has a title or standard layout element
  await expect(page).toHaveTitle(/Enterprise OS/i);
});
