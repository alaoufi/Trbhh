'use strict';
const assert = require('node:assert/strict');
// Called only against the private isolated clone; no real reports or admin users.
exports.run = async ({ browser, page, adId, origin, run, attempt, password }) => {
  assert.equal(origin, 'http://localhost:4197');
  async function login(index) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await context.newPage();
    await p.goto(origin + '/login?next=%2Faccount');
    await p.locator('#login-identifier').fill(`finalgate-${run}-${attempt}-${index}`);
    await p.locator('#login-password').fill(password);
    await p.getByRole('button', { name: 'دخول', exact: true }).click();
    await p.waitForURL(u => u.pathname === '/account');
    return { context, p };
  }
  const staff = await login(2);
  const outsider = await login(1);
  try {
    const profile = await outsider.p.locator('a[href^="/users/"]').first().getAttribute('href');
    const memberId = profile.split('/').pop(); assert(/^\d+$/.test(memberId));
    for (const [type, id] of [['site', '0'], ['member', memberId], ['ad', adId]]) {
      await page.goto(`${origin}/report?type=${type}&id=${id}`);
      await page.locator('[name="message"]').fill(`بلاغ اختبار متابعة ${type} ${run}`);
      await page.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
      await page.waitForURL(u => u.pathname.startsWith('/account/submitted-reports/') && /\d+$/.test(u.pathname));
      const path = new URL(page.url()).pathname;
      const adminPath = path.replace('/account/submitted-reports', '/admin/reports');
      for (let i = 1; i <= 2; i++) {
        await staff.p.goto(origin + adminPath);
        await staff.p.locator('#report-reply').fill(`استفسار الإدارة ${type} ${i}`);
        await staff.p.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
        await staff.p.locator('ol').getByText(`استفسار الإدارة ${type} ${i}`, { exact: true }).waitFor();
        await page.reload();
        await page.locator('ol').getByText(`استفسار الإدارة ${type} ${i}`, { exact: true }).waitFor();
        await page.locator('#report-reply').fill(`متابعة العضو ${type} ${i}`);
        await page.getByRole('button', { name: 'إرسال الرد', exact: true }).click();
        await page.locator('ol').getByText(`متابعة العضو ${type} ${i}`, { exact: true }).waitFor();
      }
      assert.equal(await page.locator('ol[aria-label="ردود البلاغ"] > li').count(), 4);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await outsider.p.goto(origin + path);
      assert.equal(await outsider.p.locator('#report-reply').count(), 0);
      assert(!(await outsider.p.locator('body').innerText()).includes(`متابعة العضو ${type}`));
      await outsider.p.goto(origin + adminPath);
      assert.equal(await outsider.p.locator('#report-reply').count(), 0);
      console.log(`PASS report_followup ${type}: create + 4 persistent replies + owner isolation + admin authorization + mobile390`);
    }
    await staff.p.goto(origin + '/admin/reports?tab=followup');
    await staff.p.locator('[name="enabled"]').uncheck();
    await staff.p.getByRole('button', { name: 'حفظ', exact: true }).click();
    await staff.p.waitForLoadState('networkidle');
    await page.reload();
    assert.equal(await page.locator('#report-reply').count(), 0);
    assert.equal(await page.locator('ol[aria-label="ردود البلاغ"] > li').count(), 4);
    await staff.p.locator('[name="enabled"]').check();
    await staff.p.getByRole('button', { name: 'حفظ', exact: true }).click();
    await staff.p.waitForLoadState('networkidle');
    console.log('PASS report_followup administrative toggle preserves history');
  } finally { await staff.context.close(); await outsider.context.close(); }
};
