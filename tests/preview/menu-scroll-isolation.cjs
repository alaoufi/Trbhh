const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const settle = page => page.evaluate(() => new Promise(resolve => { let frames = 0; const tick = () => ++frames >= 20 ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }));
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 700 }, hasTouch: width === 390 });
      await page.goto(process.env.MENU_TEST_URL || 'https://preview.88-223-92-124.sslip.io/', { waitUntil: 'load' });
      await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'instant' }));
      await page.getByRole('button', { name: 'القائمة', exact: true }).click();
      const nav = page.locator('#site-menu-dialog nav');
      await nav.waitFor();
      await nav.getByRole('button', { name: 'شروحات متحركة', exact: true }).click();
      assert.ok(await nav.evaluate(el => el.scrollHeight > el.clientHeight), 'fixture has a scrollable menu');
      assert.equal(await nav.evaluate(el => getComputedStyle(el).overscrollBehaviorY), 'contain', 'drawer must stop scroll chaining');
      const locked = await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top }));
      const box = await nav.boundingBox();
      await page.mouse.move(box.x + box.width / 2, 350);
      for (const bottom of [true, false]) {
        await nav.evaluate((el, end) => { el.scrollTop = end ? el.scrollHeight : 0; }, bottom);
        await page.mouse.wheel(0, bottom ? 1800 : -1800);
        await settle(page);
        assert.deepEqual(await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top })), locked);
        if (width === 390) {
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(box.x + box.width / 2), y: 350, yDistance: bottom ? -400 : 400, gestureSourceType: 'touch' });
          await settle(page);
          assert.deepEqual(await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top })), locked);
          await cdp.detach();
        }
      }
      await nav.evaluate(el => { el.scrollTop = 0; });
      await page.mouse.wheel(0, 200);
      await settle(page);
      assert.ok(await nav.evaluate(el => el.scrollTop > 0), 'menu remains scrollable');
      await page.mouse.move(5, 350);
      await page.mouse.wheel(0, 1800);
      await settle(page);
      assert.deepEqual(await page.evaluate(() => ({ y: window.scrollY, top: document.body.style.top })), locked);
      await page.keyboard.press('Escape');
      await page.locator('#site-menu-dialog').waitFor({ state: 'detached' });
      assert.notEqual(await page.evaluate(() => document.body.style.position), 'fixed');
      const restored = await page.evaluate(() => window.scrollY);
      assert.ok(Math.abs(restored + parseFloat(locked.top)) <= 1, 'original page position restored');
      await page.mouse.move(width / 2, 350);
      await page.mouse.wheel(0, 300);
      await settle(page);
      assert.ok(await page.evaluate(() => window.scrollY) > restored, 'page scroll resumes after closing');
      console.log(JSON.stringify({ width, boundaryIsolation: 'PASS', backdropIsolation: 'PASS', drawerScroll: 'PASS', pageRestored: 'PASS' }));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
