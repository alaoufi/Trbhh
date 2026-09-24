'use strict';
/** SSR fixture only: loopback HTTP, synthetic data, disabled action stubs, no browser/DB access. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'scratchpad/finance-vat-preview');
const sections = ['overview', 'suppliers', 'settlements', 'budget', 'month-end', 'cashflow', 'close', 'invoices', 'reconciliation', 'tax', 'ledger', 'expenses', 'returns'];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest/package.json')] })).href);
  const built = await build({
    root, configFile: false, envDir: false, logLevel: 'warn',
    resolve: { alias: [{ find: '@/app/admin/finance/actions', replacement: path.join(__dirname, 'finance-fixture-stubs.ts') }, { find: '@', replacement: path.join(root, 'src') }] },
    oxc: { jsx: { runtime: 'automatic' } },
    build: { write: false, minify: false, ssr: path.join(__dirname, 'finance-fixture.tsx'), ssrEmitAssets: true, rollupOptions: { output: { format: 'cjs' } } },
  });
  const emitted = (Array.isArray(built) ? built : [built]).flatMap(result => result.output);
  const bundle = emitted.find(file => file.type === 'chunk' && file.isEntry);
  fs.writeFileSync(path.join(output, 'fixture-render.cjs'), bundle.code);
  const { renderFinanceFixture } = require(path.join(output, 'fixture-render.cjs'));
  const moduleCss = emitted.filter(file => file.type === 'asset' && file.fileName.endsWith('.css')).map(file => typeof file.source === 'string' ? file.source : Buffer.from(file.source).toString('utf8')).join('\n');
  const config = loadConfig(path.join(root, 'tailwind.config.ts'));
  const css = (await postcss([tailwind({ ...config, content: [path.join(root, 'src/components/finance/**/*.{ts,tsx}')] })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  fs.writeFileSync(path.join(output, 'fixture.css'), `${css}\n${moduleCss}`);
  const page = (pathname, entries) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تربح — معاينة المالية ببيانات اختبار</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#eeede8;font-family:Tahoma,Arial,sans-serif}#fixture-notice{background:#f0b429;color:#16294a;text-align:center;font:700 12px/1.8 Tahoma;padding:8px 12px}#fixture-root{max-width:1420px;margin:0 auto;padding:24px} @media(max-width:600px){#fixture-root{padding:10px}} @media print{#fixture-notice{display:block}}</style></head><body><div id="fixture-notice" role="status">معاينة محلية · جميع الأسماء والمبالغ بيانات اختبار · لا اتصال بقاعدة البيانات أو البنك · الحفظ والتحويل معطّلان</div><main id="fixture-root">${renderFinanceFixture(pathname, entries)}</main><script>document.addEventListener('submit',function(event){event.preventDefault();event.stopImmediatePropagation();document.getElementById('fixture-notice').textContent='هذه معاينة محلية ببيانات اختبار؛ لا يتم حفظ أي إجراء أو تنفيذ تحويل.';window.scrollTo({top:0,behavior:'smooth'});},true);</script></body></html>`;
  for (const section of sections) fs.writeFileSync(path.join(output, `${section}.html`), page('/admin/finance', { section, month: '2026-09', mode: 'accountant' }));
  fs.writeFileSync(path.join(output, 'reopen-period.html'), page('/admin/finance', { section: 'close', month: '2026-08', mode: 'accountant' }));
  fs.writeFileSync(path.join(output, 'supplier-statement.html'), page('/admin/finance', { section: 'suppliers', month: '2026-09', mode: 'accountant', supplierId: '102' }));
  fs.writeFileSync(path.join(output, 'invoice-internal.html'), page('/admin/finance/invoices/invoice-1', {}));
  fs.writeFileSync(path.join(output, 'invoice-customer.html'), page('/admin/finance/invoices/invoice-1', { view: 'customer' }));
  fs.writeFileSync(path.join(output, 'fixture-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), fixtureOnly: true, databaseAccess: false, financialActions: 'disabled', browserVerified: false, sections, supplierStatement: true, customerCopy: true }, null, 2));
  if (!process.argv.includes('--serve')) { console.log(JSON.stringify({ fixtureOnly: true, directory: output })); return; }
  const port = Number(process.env.FINANCE_FIXTURE_PORT || 4321);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (req.method !== 'GET') { res.writeHead(405); res.end('Fixture financial actions are disabled.'); return; }
    if (url.pathname === '/fixture.css') { res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(path.join(output, 'fixture.css'))); return; }
    if (url.pathname === '/' || url.pathname === '/admin/finance' || url.pathname.startsWith('/admin/finance/invoices/') || url.pathname === '/admin/finance/export') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(page(url.pathname, Object.fromEntries(url.searchParams))); return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Local finance fixture only. This source route requires the actual app.');
  });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ fixtureOnly: true, url: `http://127.0.0.1:${port}/admin/finance?month=2026-09`, directory: output })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
