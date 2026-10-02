const assert = require('node:assert/strict');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1024, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(process.env.HOME_SEARCH_TEST_URL || 'https://preview.88-223-92-124.sslip.io/', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load');
      const panel = page.locator('details[data-home-search]');
      const outside = page.locator('[data-home-search-add]');
      await panel.waitFor();
      assert.equal(await outside.isVisible(), width >= 1024);
      assert.equal(await panel.locator('a[href="/ads/new"]').isVisible(), false);
      await panel.locator('summary').click();
      assert.equal(await outside.isVisible(), false);
      assert.equal(await panel.locator('a[href="/ads/new"]').isVisible(), true);
      await panel.locator('input[name="q"]').fill('اختبار');
      await panel.locator('summary').click();
      assert.equal(await outside.isVisible(), width >= 1024);
      await panel.locator('summary').click();
      assert.equal(await panel.locator('input[name="q"]').inputValue(), 'اختبار');
      await page.getByRole('button', { name: 'القائمة', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'القائمة', exact: true });
      await dialog.waitFor();
      assert.equal(await dialog.locator('[data-desktop-menu-add]').isVisible(), width >= 1024);
      if (width >= 1024) assert.equal(await dialog.locator('a:visible').first().getAttribute('href'), '/ads/new');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      console.log(JSON.stringify({ width, result: 'PASS' }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
