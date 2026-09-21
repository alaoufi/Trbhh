'use strict';
/** Offline real-component checks. No HTTP server and no production credentials. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/screenshots/supplier-selection');
const checks = [];
const errors = [];
const svg = index => {
  const shapes = [
    '<path d="M248 182 Q216 360 273 383 L370 383 Q428 339 390 182 Z"/><path d="M252 185 Q266 142 319 142 Q370 142 387 185 Z"/><path d="M320 142 L320 108"/><ellipse cx="320" cy="106" rx="18" ry="12"/><path d="M386 200 Q479 166 468 262 Q458 312 404 311" fill="none" stroke-width="20"/><path d="M250 212 Q202 199 174 158 Q164 244 236 292"/>',
    '<g fill="#fff"><path d="M130 200 L152 315 Q180 340 214 315 L236 200 Z"/><path d="M252 235 L274 350 Q310 375 345 350 L366 235 Z"/><path d="M380 190 L402 305 Q436 330 470 305 L492 190 Z"/></g><path d="M144 235 L222 235 M266 270 L352 270 M394 225 L478 225" stroke="#16294a" stroke-width="18"/>',
    '<path d="M270 166 L250 340 Q251 383 298 386 L365 386 Q402 378 392 330 L376 166 Z"/><rect x="269" y="126" width="108" height="43" rx="12" fill="#16294a"/><path d="M375 194 Q467 184 445 288 L394 313" fill="none" stroke-width="20"/><path d="M265 235 L382 235 M260 290 L388 290" stroke="#f0cf87" stroke-width="11"/>',
    '<path d="M248 350 L394 350 L368 384 L274 384 Z M267 290 L375 290 L358 350 L284 350 Z M230 196 L410 196 L374 290 L267 290 Z" fill="#805332"/><path d="M260 229 L380 229" stroke="#e8c782" stroke-width="15"/><path d="M310 177 Q280 144 320 117 Q350 90 325 61" fill="none" stroke="#9ca3af" stroke-width="8"/>',
    '<rect x="134" y="189" width="372" height="157" rx="30" fill="#d8aa55"/><rect x="156" y="207" width="328" height="119" rx="18" fill="#f0d99c"/>',
    '<path d="M185 222 L455 222 L419 357 Q320 393 220 356 Z" fill="#c49a64"/><ellipse cx="320" cy="220" rx="135" ry="45" fill="#e3c393"/>',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#f8f4e9"/><ellipse cx="320" cy="396" rx="138" ry="19" fill="#17294a" opacity=".1"/><g fill="#b67d2a" stroke="#8f631f" stroke-width="7">${shapes[index % shapes.length]}</g></svg>`;
};

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest/package.json')] })).href);
  const built = await build({
    root, configFile: false, envDir: false, logLevel: 'warn',
    resolve: { alias: { '@': path.join(root, 'src') } },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'production' }) },
    oxc: { jsx: { runtime: 'automatic' } },
    build: { write: false, minify: true, lib: { entry: path.join(__dirname, 'supplier-catalog-fixture.tsx'), formats: ['iife'], name: 'SupplierCatalogFixture' } },
  });
  const js = (Array.isArray(built) ? built : [built]).flatMap(result => result.output).find(file => file.type === 'chunk').code;
  const css = (await postcss([tailwind({ content: [path.join(root, 'src/components/supplier-catalog.tsx')], theme: { extend: {} }, plugins: [] })]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined })).css;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const viewport of [{ width: 1440, height: 1040 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, locale: 'ar-SA' });
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'catalog-fixture.test') return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg(Number(url.pathname.match(/\d+/)?.[0] || 0)) });
        return route.abort();
      });
      await page.setContent('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>معاينة اختيار منتجات سلة</title></head><body style="margin:0;background:#f7f8fa;font-family:Tahoma,Arial,sans-serif"><main id="root" style="max-width:1240px;margin:0 auto;padding:24px 16px"></main></body></html>');
      await page.addStyleTag({ content: css });
      // Next's client image module expects the browser process shim normally
      // supplied by its bundler. This isolated fixture contains no real env.
      await page.addScriptTag({ content: 'window.process={env:{NODE_ENV:"production"},browser:true};' });
      await page.addScriptTag({ content: js });
      await page.getByRole('heading', { name: 'منتجات سلة، أمامك بوضوح' }).waitFor({ timeout: 10000 }).catch(error => { throw new Error(`${error.message}\nBrowser errors: ${JSON.stringify(errors)}`); });
      assert.equal(await page.getByRole('article').count(), 3);
      assert(!/900000[1-6]|s_700001|p_900/.test(await page.locator('body').innerText()));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'No horizontal page overflow');
      await page.screenshot({ path: path.join(output, viewport.width > 600 ? 'desktop.png' : 'mobile.png'), fullPage: true });

      const first = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'دلة قهوة عربية نحاسية', exact: true }) });
      const previewButton = first.getByRole('button', { name: 'معاينة المنتج', exact: true });
      await previewButton.click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: 'وصف المنتج', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => window.catalogFixture.approvals()), 0, 'Preview is read-only');
      await dialog.getByRole('button', { name: 'عرض الصورة 2' }).click();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => !!document.activeElement?.closest('dialog')), true, 'Focus stays inside modal');
      await page.screenshot({ path: path.join(output, viewport.width > 600 ? 'preview-desktop.png' : 'preview-mobile.png') });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await previewButton.evaluate(button => button === document.activeElement), true, 'Focus restored');

      await first.getByRole('button', { name: 'إضافة إلى تربح', exact: true }).click();
      await dialog.getByRole('button', { name: 'تأكيد إضافة 1 منتج' }).waitFor();
      assert.equal(await page.evaluate(() => window.catalogFixture.approvals()), 0, 'Single add opens review only');
      await dialog.getByRole('button', { name: 'رجوع', exact: true }).click();

      await first.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'التالي', exact: true }).click();
      await page.getByRole('heading', { name: 'مبخرة خشبية يدوية', exact: true }).waitFor();
      await page.getByRole('article').first().getByRole('checkbox').check();
      await page.getByRole('searchbox').fill('ترمس');
      await page.getByRole('button', { name: 'بحث', exact: true }).click();
      await page.getByRole('heading', { name: 'ترمس ضيافة ذهبي', exact: true }).waitFor();
      assert.equal(await page.getByRole('article').count(), 1, 'Name search');
      await page.getByRole('searchbox').fill('HERITAGE-3');
      await page.getByRole('button', { name: 'بحث', exact: true }).click();
      await page.getByRole('heading', { name: 'ترمس ضيافة ذهبي', exact: true }).waitFor();
      assert.equal(await page.getByRole('article').count(), 1, 'SKU search');
      await page.getByRole('searchbox').fill('فشل');
      await page.getByRole('button', { name: 'بحث', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'تعذر تحميل المنتجات' }).waitFor();
      await page.getByRole('button', { name: 'مراجعة وإضافة المحدد', exact: true }).click();
      await dialog.getByRole('heading', { name: 'دلة قهوة عربية نحاسية', exact: true }).waitFor();
      await dialog.getByRole('heading', { name: 'مبخرة خشبية يدوية', exact: true }).waitFor();
      const cost = dialog.getByRole('textbox', { name: 'تكلفة التوريد — دلة قهوة عربية نحاسية', exact: true });
      assert.equal(await cost.inputValue(), '', 'Source retail price never becomes cost automatically');
      assert.equal(await dialog.getByRole('button', { name: 'تأكيد إضافة 2 منتج' }).isDisabled(), true);
      await cost.fill('١٨٠');
      await dialog.getByRole('checkbox').check();
      assert.equal(await page.evaluate(() => window.catalogFixture.approvals()), 0, 'Selection/review do not write');
      await page.waitForFunction(() => [...document.querySelectorAll('dialog button')].some(button => button.textContent.includes('تأكيد إضافة 2 منتج') && !button.disabled));
      await dialog.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: path.join(output, viewport.width > 600 ? 'review-desktop.png' : 'review-mobile.png') });
      await dialog.getByRole('button', { name: 'تأكيد إضافة 2 منتج' }).click();
      await page.getByRole('status').filter({ hasText: 'تمت إضافة 2 منتج' }).waitFor();
      assert.equal(await page.evaluate(() => window.catalogFixture.approvals()), 1);
      assert.equal(await page.evaluate(() => window.catalogFixture.added()), 2);
      assert.equal(await page.getByRole('complementary', { name: 'المنتجات المحددة' }).count(), 0);
      checks.push({ width: viewport.width, preview: true, focusTrap: true, singleAddRequiresReview: true, crossPageSelection: true, nameSearch: true, skuSearch: true, searchFailurePreservesSelection: true, explicitReview: true, hiddenAddition: true, internalKeysHidden: true });
      await page.close();
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), fixtureOnly: true, checks, errors }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, checks, screenshotDirectory: output }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
