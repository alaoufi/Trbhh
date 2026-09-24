'use strict';
/** Actual CJ pages + hydrated client islands. No database, env files, orders, payment or browser automation. */
// This loopback-only fixture deliberately exercises the API's nonproduction origin branch.
// Set before Vite loads; never change the production API to accommodate a local preview.
process.env.NODE_ENV = 'development';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/screenshots/cj-trial/generated');
const origin = 'http://127.0.0.1:4325';
const stub = path.join(__dirname, 'cj-fixture-server-stubs.ts');
const islands = path.join(__dirname, 'cj-fixture-islands.tsx');
const link = path.join(__dirname, 'cj-fixture-link.tsx');
const routes = ['/cj', '/cj/15', '/cj/16', '/cj/900017', '/cj/900018', '/cj/900019', '/cj/cart', '/cj/approved/930001', '/cj/approved/930002'];
const commonAliases = [{ find: 'next/link', replacement: link }, { find: '@', replacement: path.join(root, 'src') }];

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest/package.json')] })).href);
  const common = { root, configFile: false, envDir: false, logLevel: 'warn', oxc: { jsx: { runtime: 'automatic' } } };
  const serverBuild = await build({ ...common,
    plugins: [{ name: 'cj-fixture-card-image-island', enforce: 'pre', resolveId(source, importer) {
      if (source === './product-image' && /\/src\/components\/cj\/(?:product-card|approved-card)\.tsx$/.test(importer?.replaceAll('\\', '/') || '')) return islands;
      return null;
    } }],
    resolve: { alias: [
      ...['@/lib/auth', '@/lib/access-control/guards', '@/lib/settings', '@/lib/prisma', '@/lib/data', '@/lib/cj/catalog-feed', '@/lib/cj/approved-catalog', './approved-catalog', '@/lib/cj/mapping', './mapping', '@/lib/cj/agents', './agents', 'next/navigation', 'next/headers'].map(find => ({ find, replacement: stub })),
      { find: 'next/image', replacement: path.join(__dirname, 'cj-fixture-image.tsx') },
      { find: /^.*admin\/suppliers\/cj\/actions(?:\.ts)?$/, replacement: stub },
      { find: 'server-only', replacement: path.join(root, 'tests/stubs/empty.ts') },
      ...['@/components/cj/product-gallery', '@/components/cj/cart-controls', '@/components/cj/trial-cart'].map(find => ({ find, replacement: islands })),
      ...commonAliases,
    ] },
    build: { write: false, minify: false, ssr: path.join(__dirname, 'cj-fixture-render.tsx'), rollupOptions: { output: { format: 'cjs' } } },
  });
  const emitted = (Array.isArray(serverBuild) ? serverBuild : [serverBuild]).flatMap(result => result.output);
  fs.writeFileSync(path.join(output, 'fixture-render.cjs'), emitted.find(file => file.type === 'chunk' && file.isEntry).code);
  const renderer = require(path.join(output, 'fixture-render.cjs'));
  const allowedImages = new Set([renderer.publicJpegAlias, renderer.publicJpeg]);
  const externalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (!allowedImages.has(url) || method !== 'GET') throw Error('CJ_FIXTURE_OUTBOUND_BLOCKED');
    return externalFetch(input, init);
  };
  const clientBuild = await build({ ...common, resolve: { alias: commonAliases }, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: { write: false, minify: true, lib: { entry: path.join(__dirname, 'cj-fixture-client.tsx'), formats: ['iife'], name: 'CjFixture' } },
  });
  const clientOutput = (Array.isArray(clientBuild) ? clientBuild : [clientBuild]).flatMap(result => result.output);
  fs.writeFileSync(path.join(output, 'fixture.js'), clientOutput.find(file => file.type === 'chunk').code);
  const config = loadConfig(path.join(root, 'tailwind.config.ts'));
  const css = (await postcss([tailwind({ ...config, content: [path.join(root, 'src/app/cj/**/*.{ts,tsx}'), path.join(root, 'src/components/cj/**/*.{ts,tsx}'), path.join(root, 'src/components/price-text.tsx'), path.join(root, 'src/components/ad-card.tsx'), path.join(__dirname, 'cj-*.{cjs,ts,tsx}')] })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  fs.writeFileSync(path.join(output, 'fixture.css'), css);
  const page = async (pathname, delayed = false) => `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>معاينة CJ محلية — بيانات اختبار</title><link rel="stylesheet" href="/fixture.css"><style>body{margin:0;background:#f8fafc;font-family:Tahoma,Arial,sans-serif}.fixture-notice{padding:12px;background:#fff3ce;color:#16294a;text-align:center;font-size:12px;line-height:1.8}.fixture-nav{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;padding:12px;font-size:12px}.fixture-nav a{text-decoration:underline}</style></head><body><aside class="fixture-notice" aria-label="حدود المعاينة المحلية">معاينة محلية للصفحات والمكونات الفعلية — الأسعار والأوصاف بيانات اختبار، والحساب وهمي بصلاحية عرض المنتجات فقط. صورتا المنتجين 15 و16 من روابط CJ العامة المطابقة للعناوين؛ بقية المنتجات اصطناعية. لا قاعدة بيانات أو طلبات أو دفع أو مزامنة.</aside><nav class="fixture-nav" aria-label="مسارات الاختبار"><a href="/cj">الكتالوج</a><a href="/cj/15">اختبار JPEG</a><a href="/cj/900017">معرض اصطناعي ورابط طويل</a><a href="/cj/900018">صورة مفقودة</a><a href="/cj/cart">السلة</a></nav><div id="fixture-page">${await renderer.renderCjFixture(pathname)}</div><script src="/fixture.js${delayed ? '?delay=1000' : ''}" defer></script></body></html>`;
  for (const route of routes) fs.writeFileSync(path.join(output, `fixture-${route.replaceAll('/', '-').slice(1)}.html`), await page(route));
  fs.writeFileSync(path.join(output, 'fixture-manifest.json'), JSON.stringify({ fixtureOnly: true, serverMode: 'development', actualServerPages: routes, hydratedComponents: ['CjProductGallery', 'CjProductImage', 'AddToTrialCart', 'CartLink', 'TrialCart'], syntheticPrices: true, databaseAccess: false, supplierOrderAccess: false, outboundImages: [...allowedImages], browserVerified: false }, null, 2));
  if (!process.argv.includes('--serve')) { console.log(JSON.stringify({ fixtureOnly: true, directory: output, pages: routes.length })); return; }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, origin);
      if (req.headers.host !== '127.0.0.1:4325') { res.writeHead(403); res.end('Loopback fixture host only.'); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
      if (req.method === 'POST' && url.pathname === '/api/cj/trial-cart') {
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8192) { res.writeHead(413); res.end('Fixture body too large.'); return; } chunks.push(chunk); }
        const response = await renderer.cartResponse(new Request(url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end('Fixture mutations are disabled.'); return; }
      if (url.pathname === '/api/cj/img') {
        if (!allowedImages.has(url.searchParams.get('u'))) { res.writeHead(403); res.end('Only the two reviewed fixture URLs may be fetched.'); return; }
        const response = await renderer.imageResponse(new Request(url));
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (url.pathname === '/fixture.js' || url.pathname === '/fixture.css') {
        if (url.pathname === '/fixture.js' && url.searchParams.get('delay') === '1000') await new Promise(resolve => setTimeout(resolve, 1000));
        res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' }); res.end(fs.readFileSync(path.join(output, path.basename(url.pathname)))); return;
      }
      if (['/fixture-image/synthetic-front.svg', '/fixture-image/synthetic-back.svg'].includes(url.pathname)) {
        const back = url.pathname.includes('back'); res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="${back ? '#e8edf3' : '#fff1dc'}"/><rect x="160" y="160" width="480" height="400" rx="40" fill="none" stroke="#16294a" stroke-width="12"/><text x="400" y="650" text-anchor="middle" font-family="Arial" font-size="34" fill="#16294a">SYNTHETIC ${back ? 'BACK' : 'FRONT'}</text></svg>`); return;
      }
      const pathname = url.pathname === '/' ? '/cj' : url.pathname;
      const knownProduct = /^\/cj\/[1-9]\d*$/.test(pathname) && renderer.fixtureProductIds.includes(Number(pathname.split('/').pop()));
      if (routes.includes(pathname) || knownProduct) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(await page(pathname + url.search, url.searchParams.get('hydrate') === 'delayed')); return; }
      res.writeHead(404); res.end('Local CJ fixture route only.');
    } catch { if (!res.headersSent) res.writeHead(500); res.end('CJ fixture rendering failed; no live action was attempted.'); }
  });
  server.listen(4325, '127.0.0.1', () => console.log(JSON.stringify({ fixtureOnly: true, url: `${origin}/cj`, directory: output })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
