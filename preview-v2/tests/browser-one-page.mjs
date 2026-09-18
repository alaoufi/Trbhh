import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.PREVIEW_URL || 'http://127.0.0.1:4187/ads/new/';
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):\d+\/ads\/new\/$/);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.getByRole('button', { name: 'عقارات', exact: true }).waitFor();
  assert.equal(await page.locator('.ad-page-section').count(), 4, 'All four sections must appear on one page');
  assert.equal(await page.getByRole('button', { name: /^(التالي|السابق)$/ }).count(), 0);
  await page.getByRole('button', { name: 'نشر تجريبي', exact: true }).click();
  await page.locator('.ad-error-summary').waitFor();
  assert.equal(await page.locator('.ad-error-summary').evaluate(el => el === document.activeElement), true);
  assert.equal(await page.locator('.seller-complete').count(), 0);
  await page.getByRole('button', {name:'عقارات',exact:true}).click();
  await page.getByLabel('التصنيف الفرعي').selectOption('أراضٍ');
  await page.locator('#detail-purpose').selectOption('للإيجار');
  await page.getByRole('button', {name:'نشر تجريبي',exact:true}).click();
  const rentalError=await page.locator('#detail-rentPeriod-error').innerText();
  await page.locator('#detail-purpose').selectOption('للبيع');
  assert.ok(!(await page.locator('.ad-error-summary').innerText()).includes(rentalError),'Hidden rental field must not leave an error');
  await page.getByRole('button', {name:'أبحث عن شيء'}).click();
  assert.equal(await page.locator('#detail-plotArea-error').count(),0,'Wanted specifications are optional');
  await page.getByLabel('عنوان الإعلان').fill('أرض تجريبية لمسودة قديمة');
  await page.locator('#ad-photo-input').setInputFiles(new URL('../public/images/apartment.jpg', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
  await page.getByRole('button', {name:'حذف الصورة 1',exact:true}).waitFor();
  assert.equal(await page.locator('.seller-preview-cover').evaluate(img => img.complete && img.naturalWidth > 0),true);
  await page.getByRole('button', {name:'حفظ المسودة',exact:true}).click();
  await page.evaluate(() => {
    const key='trbhh-v2-ad-draft-v1';
    const draft=JSON.parse(localStorage.getItem(key));
    draft.step=3;
    localStorage.setItem(key,JSON.stringify(draft));
  });
  await page.reload();
  await page.getByLabel('عنوان الإعلان').waitFor();
  assert.equal(await page.getByLabel('عنوان الإعلان').inputValue(),'أرض تجريبية لمسودة قديمة');
  assert.equal(await page.getByRole('button', {name:'حذف الصورة 1',exact:true}).count(),1);
  assert.equal(await page.locator('.ad-page-section').count(),4);
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
    for (const id of ['classification','details','photos','review']) assert.equal(await page.locator('#ad-'+id).isVisible(),true);
  }
  console.log('PASS: one page, four sections, no wizard, focused validation summary, legacy draft and responsive layout');
} finally { await browser.close(); }
