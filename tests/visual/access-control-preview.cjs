'use strict';
/** Real client component, synthetic data only. GET-only loopback server; no database/env loading. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/screenshots/access-control/generated');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest/package.json')] })).href);
  const built = await build({
    root, configFile: false, envDir: false, logLevel: 'warn',
    resolve: { alias: [{ find: 'next/link', replacement: path.join(__dirname, 'access-control-fixture-link.tsx') }, { find: '@', replacement: path.join(root, 'src') }] },
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    oxc: { jsx: { runtime: 'automatic' } },
    build: { write: false, minify: true, lib: { entry: path.join(__dirname, 'access-control-fixture.tsx'), formats: ['iife'], name: 'AccessControlFixture' } },
  });
  const js = (Array.isArray(built) ? built : [built]).flatMap(result => result.output).find(file => file.type === 'chunk').code;
  fs.writeFileSync(path.join(output, 'fixture.js'), js);
  const config = loadConfig(path.join(root, 'tailwind.config.ts'));
  const css = (await postcss([tailwind({ ...config, content: [path.join(root, 'src/components/access-control.tsx')] })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  fs.writeFileSync(path.join(output, 'fixture.css'), css);
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة محلية — إدارة الوصول</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#eeede8;font-family:Tahoma,Arial,sans-serif}#fixture-notice{background:#f0b429;color:#16294a;text-align:center;font:700 12px/1.8 Tahoma;padding:8px 12px}.fixture-modes{display:flex;flex-wrap:wrap;gap:16px;justify-content:center;padding:8px;font-size:12px;color:#16294a}.fixture-modes a{text-decoration:underline}#fixture-root{max-width:1420px;margin:0 auto;padding:24px}@media(max-width:600px){#fixture-root{padding:10px}}</style></head><body><div id="fixture-notice" role="status">معاينة محلية · جميع البيانات تجريبية · لا قاعدة بيانات أو اتصال خارجي · الحفظ معطّل</div><nav class="fixture-modes" aria-label="حالات المعاينة المحلية"><a href="/admin/access-control?section=roles">معاينة الإدارة</a><a href="/admin/access-control?section=roles&mode=readonly">معاينة العرض فقط</a><a href="/admin/access-control?section=departments&mode=uninitialized">معاينة قبل التهيئة</a></nav><div id="fixture-root"></div><script src="/fixture.js"></script></body></html>`;
  fs.writeFileSync(path.join(output, 'index.html'), html);
  if (!process.argv.includes('--serve')) { console.log(JSON.stringify({ fixtureOnly: true, directory: output })); return; }
  const port = Number(process.env.ACCESS_FIXTURE_PORT || 4323);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    if (req.method !== 'GET') { res.writeHead(405); res.end('Local fixture actions are disabled.'); return; }
    if (url.pathname === '/fixture.js' || url.pathname === '/fixture.css') { res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); res.end(fs.readFileSync(path.join(output, path.basename(url.pathname)))); return; }
    if (url.pathname === '/' || url.pathname === '/admin/access-control') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
    res.writeHead(404); res.end('Local fixture route only.');
  });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ fixtureOnly: true, url: `http://127.0.0.1:${port}/admin/access-control`, directory: output })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
