import { test, expect } from './fixtures';

async function login(page: any) {
  // Step 32: Supabase Auth is the only login; the DEV test-auth stub in
  // fixtures.ts signs the harness in automatically, so no PIN flow is needed.
  await page.getByTestId('nav-appointments').waitFor({ state: 'visible', timeout: 15000 });
}

const num = async (page: any, testid: string) => {
  const v = await page.getByTestId(testid).getAttribute('data-value');
  return parseFloat(v || '0');
};

test.describe('F-5 — Reports business intelligence', () => {
  test.setTimeout(120_000);

  test('range-scoped revenue, category %, trend, z-report, print & email', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push('PAGE_ERROR: ' + e.message));

    await page.goto('http://localhost:3000/');
    await login(page);
    await page.waitForTimeout(1500); // let boot demo-seeding settle before we clear

    // STEP 1: clean slate + seed 3 paid invoices this month (+1 last month for trend).
    const seed = await page.evaluate(async () => {
      const db = (window as any)._db;
      await db.invoices.clear();
      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 9, 0, 0);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15, 9, 0, 0);
      const mk = (id: string, total: number, method: string, cat: string, name: string, qty: number, date: Date, cogs: number) => ({
        id, date: date.toISOString(), patientId: 'p_' + id, petName: 'P', ownerName: 'O', ownerPhone: '+94 770000000',
        items: [{ itemId: 'it_' + id, sku: id, name, category: cat, quantity: qty, unitPrice: total / qty, totalPrice: total }],
        subtotal: total, tax: 0, discount: 0, sales_total: total, cogs, profit: total - cogs,
        paymentMethod: method, paymentStatus: 'paid', createdBy: 'test'
      });
      await db.invoices.setItem('F5-1', mk('F5-1', 10000, 'cash', 'service', 'Consultation', 1, now, 4000));
      await db.invoices.setItem('F5-2', mk('F5-2', 5000, 'card', 'vaccine', 'Rabies Vaccine', 1, now, 1500));
      await db.invoices.setItem('F5-3', mk('F5-3', 2500, 'cash', 'retail', 'Dog Food', 2, firstOfMonth, 1800));
      await db.invoices.setItem('F5-4', mk('F5-4', 8000, 'cash', 'service', 'Consultation', 1, lastMonth, 3000));
      return { todayIsFirst: now.getDate() === 1 };
    });

    // STEP 2: open Reports (default range = This Month).
    await page.getByTestId('nav-reports').click();
    await page.getByTestId('range-this_month').waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(500);

    // STEP 3: This Month revenue = exact sum of the 3 in-month invoices.
    const thisMonthRevenue = await num(page, 'metric-total-revenue');
    const expectedThisMonth = 17500;
    console.log('STEP 3 — This Month revenue: computed =', thisMonthRevenue, '| expected =', expectedThisMonth);
    expect(thisMonthRevenue).toBe(expectedThisMonth);

    // STEP 4: category percentages sum to 100.
    const catPct = await num(page, 'category-total-pct');
    console.log('STEP 4 — category % sum:', catPct);
    expect(Math.round(catPct)).toBe(100);

    // STEP 5: switch to Today — number changes correctly.
    await page.getByTestId('range-today').click();
    await page.waitForTimeout(400);
    const todayRevenue = await num(page, 'metric-total-revenue');
    const expectedToday = 15000 + (seed.todayIsFirst ? 2500 : 0);
    console.log('STEP 5 — Today revenue: computed =', todayRevenue, '| expected =', expectedToday);
    expect(todayRevenue).toBe(expectedToday);

    // STEP 6: trend with a zero previous period must not crash / divide-by-zero.
    // This Year's previous period = last year = 0 invoices.
    await page.getByTestId('range-this_year').click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('trend-revenue')).toBeVisible();
    const trendText = await page.getByTestId('trend-revenue').innerText();
    console.log('STEP 6 — This Year trend (prev=0):', trendText.replace(/\n/g, ' '));
    // and This Month vs Last Month shows a real % (prev = 8000)
    await page.getByTestId('range-this_month').click();
    await page.waitForTimeout(400);
    const trendMonth = await page.getByTestId('trend-revenue').innerText();
    console.log('STEP 6 — This Month trend vs last month:', trendMonth.replace(/\n/g, ' '));
    expect(trendMonth).toMatch(/%|new/);

    // STEP 7: Z-Report payment method totals sum to total sales.
    const methodSum = await num(page, 'zreport-method-sum');
    const totalSales = await num(page, 'zreport-total-sales');
    console.log('STEP 7 — Z-Report method sum:', methodSum, '| invoiced total:', totalSales);
    expect(methodSum).toBeCloseTo(totalSales, 2);
    expect(methodSum).toBe(17500);

    // STEP 8: Print fires window.print().
    await page.evaluate(() => { (window as any).__printed = false; window.print = () => { (window as any).__printed = true; }; });
    await page.getByTestId('btn-print-zreport').click();
    const printed = await page.evaluate(() => (window as any).__printed);
    console.log('STEP 8 — window.print fired:', printed);
    expect(printed).toBe(true);

    // STEP 9: Email honestly reports "not configured" (no EmailJS creds by default).
    await page.getByTestId('btn-email-zreport').click();
    await expect(page.getByText(/Email not configured/i)).toBeVisible({ timeout: 5000 });
    console.log('STEP 9 — Email button honestly reported: "Email not configured"');

    console.log('PAGE ERRORS:', JSON.stringify(errors));
    expect(errors).toEqual([]);
  });
});
