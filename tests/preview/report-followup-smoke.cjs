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
    const staffProfile = await staff.p.locator('a[href^="/users/"]').first().getAttribute('href');
    const staffId = staffProfile.split('/').pop(); assert(/^\d+$/.test(staffId));
    const profile = await outsider.p.locator('a[href^="/users/"]').first().getAttribute('href');
    const memberId = profile.split('/').pop(); assert(/^\d+$/.test(memberId));
    for (const [type, id] of [['site', '0'], ['member', memberId], ['ad', adId]]) {
      await page.goto(`${origin}/report?type=${type}&id=${id}`);
      assert.equal(await page.locator('#report-reason').inputValue(), '');
      assert.equal(await page.locator('#report-reason').evaluate(el => el.checkValidity()), false);
      const explanation = `بلاغ اختبار متابعة ${type} ${run} ` + 'تفاصيل خاصة للمعالجة '.repeat(20);
      await page.locator('[name="message"]').fill(explanation);
      // Bypass native validation to prove the server also refuses a missing reason.
      await page.locator('#report-reason').evaluate(el => { el.form.noValidate = true; });
      await page.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'اختر سبب البلاغ' }).waitFor();
      assert.equal(await page.locator('[name="message"]').inputValue(), explanation);
      await page.locator('#report-reason').selectOption('other');
      await page.locator('[name="message"]').fill(' ');
      await page.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'اكتب توضيحًا' }).waitFor();
      await page.locator('[name="message"]').fill(explanation);
      await page.getByRole('button', { name: 'إرسال البلاغ', exact: true }).click();
      await page.waitForURL(u => u.pathname.startsWith('/account/submitted-reports/') && /\d+$/.test(u.pathname));
      const path = new URL(page.url()).pathname;
      const adminPath = path.replace('/account/submitted-reports', '/admin/reports');
      await page.locator('ol').getByText(explanation.trim(), { exact: true }).waitFor();
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
      assert.equal(await page.locator('ol[aria-label="ردود البلاغ"] > li').count(), 5);
      assert.equal(await page.getByRole('link', { name: 'مراسلة المُبلّغ عنه', exact: true }).count(), 0);
      await staff.p.goto(origin + adminPath);
      const contact = staff.p.getByRole('link', { name: 'مراسلة المُبلّغ عنه', exact: true });
      if (type === 'site') assert.equal(await contact.count(), 0);
      if (type === 'member') {
        assert.equal(await contact.getAttribute('href'), `/messages/${memberId}`);
        await contact.click();
        const question = `استفسار خاص من الإدارة ${run}`;
        await staff.p.getByPlaceholder('اكتب رسالة...').fill(question);
        await staff.p.getByRole('button', { name: 'إرسال', exact: true }).click();
        await staff.p.getByText(question, { exact: true }).waitFor();
        await outsider.p.goto(`${origin}/messages/${staffId}`);
        await outsider.p.getByText(question, { exact: true }).waitFor();
        const privateBody = await outsider.p.locator('body').innerText();
        assert(!privateBody.includes(`بلاغ اختبار متابعة ${type}`));
        assert(!privateBody.includes(`متابعة العضو ${type}`));
        const response = `توضيح العضو المعني ${run}`;
        await outsider.p.getByPlaceholder('اكتب رسالة...').fill(response);
        await outsider.p.getByRole('button', { name: 'إرسال', exact: true }).click();
        await outsider.p.getByText(response, { exact: true }).waitFor();
        await staff.p.reload();
        await staff.p.getByText(response, { exact: true }).waitFor();
        console.log('PASS reported_member_contact: separate two-way chat, no reporter content leaked');
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await outsider.p.goto(origin + path);
      assert.equal(await outsider.p.locator('#report-reply').count(), 0);
      assert(!(await outsider.p.locator('body').innerText()).includes(`متابعة العضو ${type}`));
      await outsider.p.goto(origin + adminPath);
      assert.equal(await outsider.p.locator('#report-reply').count(), 0);
      console.log(`PASS report_followup ${type}: required reason + other explanation + preserved input + full private explanation + 4 replies + isolation + mobile390`);
    }
    await staff.p.goto(origin + '/admin/reports?tab=followup');
    await staff.p.locator('[name="enabled"]').uncheck();
    await staff.p.getByRole('button', { name: 'حفظ', exact: true }).click();
    await staff.p.waitForLoadState('networkidle');
    await page.reload();
    assert.equal(await page.locator('#report-reply').count(), 0);
    assert.equal(await page.locator('ol[aria-label="ردود البلاغ"] > li').count(), 5);
    await staff.p.locator('[name="enabled"]').check();
    await staff.p.getByRole('button', { name: 'حفظ', exact: true }).click();
    await staff.p.waitForLoadState('networkidle');
    console.log('PASS report_followup administrative toggle preserves history');
  } finally { await staff.context.close(); await outsider.context.close(); }
};
