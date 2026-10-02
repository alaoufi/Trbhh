// Isolated browser test of the real picker. The persistence boundary is mocked:
// no login, production database or remote server is used.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest')] })).href);
  const server = await createServer({
    configFile: false, root: process.cwd(), resolve: { alias: { '@': path.resolve('src') } },
    server: { host: '127.0.0.1', port: 0 },
    plugins: [{
      name: 'isolated-hero-picker',
      enforce: 'pre',
      resolveId(source, importer) {
        if (source === '/fixture.tsx') return '/fixture.tsx';
        if (source === '/mock-hero-action' || (source === './actions' && importer?.replaceAll('\\', '/').endsWith('/admin/home-hero/picker.tsx'))) return '\0mock-hero-action';
      },
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/admin/home-hero/picker.tsx')) return code.replace("'./actions'", "'/mock-hero-action'");
      },
      load(id) {
        if (id === '\0mock-hero-action') return 'export async function saveHomeHeroAction(state,form){window.savedHeroIds=form.get("ids");return {saved:true}}';
        if (id === '/fixture.tsx') return `import React from 'react'; import {createRoot} from 'react-dom/client'; import {HomeHeroPicker} from '/src/app/admin/home-hero/picker.tsx'; window.React=React; createRoot(document.getElementById('root')).render(<HomeHeroPicker initial={[]} options={[{id:1,title:'اختبار أول'},{id:2,title:'اختبار ثان'}]} readOnly={location.search.includes('readonly')} />);`;
      },
      configureServer(instance) {
        instance.middlewares.use((req, res, next) => {
          if (!req.url.startsWith('/fixture?')) return next();
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end('<html lang="ar" dir="rtl"><body><div id="root"></div><script type="module" src="/fixture.tsx"></script></body></html>');
        });
      },
    }],
  });
  let browser;
  try {
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const width of [390, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${origin}/fixture?editable`);
      await page.getByRole('button', { name: 'اختيار', exact: true }).first().click();
      await page.getByRole('button', { name: 'اختيار', exact: true }).nth(1).click();
      assert.equal(await page.locator('input[name="ids"]').inputValue(), '1,2');
      await page.getByRole('button', { name: 'تقديم الإعلان 2' }).click();
      assert.equal(await page.locator('input[name="ids"]').inputValue(), '2,1');
      await page.getByRole('button', { name: 'إزالة الإعلان 1' }).click();
      await page.getByRole('button', { name: 'حفظ إعلانات البانر' }).click();
      await page.getByText('تم حفظ الإعلانات وترتيبها.').waitFor();
      assert.equal(await page.evaluate(() => window.savedHeroIds), '2');
      await page.getByRole('button', { name: 'إزالة الإعلان 2' }).click();
      await page.getByRole('button', { name: 'حفظ إعلانات البانر' }).click();
      await page.getByText('تم حفظ الإعلانات وترتيبها.').waitFor();
      assert.equal(await page.evaluate(() => window.savedHeroIds), '');
      await page.goto(`${origin}/fixture?readonly`);
      assert.equal(await page.getByRole('button', { name: 'حفظ إعلانات البانر' }).isDisabled(), true);
      console.log(JSON.stringify({ width, selection: 'PASS', ordering: 'PASS', removal: 'PASS', empty: 'PASS', readOnly: 'PASS', persistence: 'MOCKED' }));
      await page.close();
    }
  } finally { await browser?.close(); await server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
