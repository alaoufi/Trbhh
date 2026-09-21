'use strict';
/** Builds and optionally serves a loopback-only fixture; never launches a browser or accesses a database. */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const loadConfig = require('tailwindcss/loadConfig');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'docs/screenshots/public-home');

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const { build } = await import(pathToFileURL(require.resolve('vite', { paths: [require.resolve('vitest/package.json')] })).href);
  const built = await build({
    root, configFile: false, envDir: false, logLevel: 'warn',
    resolve: { alias: [
      { find: 'next/headers', replacement: path.join(__dirname, 'public-home-server-stubs.ts') },
      { find: '@/lib/settings', replacement: path.join(__dirname, 'public-home-server-stubs.ts') },
      { find: '@', replacement: path.join(root, 'src') },
    ] },
    define: { 'process.env': JSON.stringify({ NODE_ENV: 'production' }) },
    oxc: { jsx: { runtime: 'automatic' } },
    build: { write: false, minify: true, lib: { entry: path.join(__dirname, 'public-home-fixture.tsx'), formats: ['iife'], name: 'PublicHomeFixture' } },
  });
  const js = (Array.isArray(built) ? built : [built]).flatMap(result => result.output).find(file => file.type === 'chunk').code;
  const config = loadConfig(path.join(root, 'tailwind.config.ts'));
  const css = (await postcss([tailwind({ ...config, content: [path.join(root, 'src/**/*.{ts,tsx}'), path.join(__dirname, 'public-home-fixture.tsx')] })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') })).css;
  fs.writeFileSync(path.join(output, 'fixture.js'), js);
  fs.writeFileSync(path.join(output, 'fixture.css'), css);
  const html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>تربح — معاينة محلية للمكونات</title><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:#f8fafc;--font-cairo:Tahoma"><main id="root" style="max-width:1200px;margin:0 auto;padding:24px 16px 80px"></main><script>window.process={env:{NODE_ENV:"production"},browser:true};</script><script src="/fixture.js"></script></body></html>';
  fs.writeFileSync(path.join(output, 'index.html'), html);
  for (let index = 1; index <= 6; index++) {
    const tint = ['#e2e8f0', '#fff1dc', '#e8edf3', '#e9f2ee', '#efeaf5', '#e7f0e1'][index - 1];
    fs.writeFileSync(path.join(output, `fixture-${index}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${tint}"/><rect x="180" y="140" width="440" height="280" rx="28" fill="none" stroke="#16294a" stroke-width="6"/><path d="m200 395 140-140 95 95 85-75 80 100" fill="none" stroke="#16294a" stroke-width="6"/><circle cx="520" cy="220" r="35" fill="#f0b429"/><text x="400" y="510" text-anchor="middle" font-family="Arial" font-size="28" fill="#16294a">FIXTURE ${index}</text></svg>`);
  }
  fs.writeFileSync(path.join(output, 'fixture-manifest.json'), JSON.stringify({ builtAt: new Date().toISOString(), fixtureOnly: true, productionRoute: false, components: ['CommerceHero', 'AdCardMarketplace'], sampleAds: 6, databaseAccess: false, browserVerified: false }, null, 2));
  if (!process.argv.includes('--serve')) { console.log(JSON.stringify({ fixtureOnly: true, directory: output })); return; }
  const port = Number(process.env.PUBLIC_HOME_FIXTURE_PORT || 4319);
  const known = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/fixture.css', ['fixture.css', 'text/css']], ['/fixture.js', ['fixture.js', 'application/javascript']], ...Array.from({ length: 6 }, (_, index) => [`/fixture-${index + 1}.svg`, [`fixture-${index + 1}.svg`, 'image/svg+xml']])]);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const target = known.get(url.pathname === '/_next/image' ? url.searchParams.get('url') : url.pathname);
    if (!target) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Local component fixture only. This route is not implemented.'); return; }
    res.writeHead(200, { 'Content-Type': target[1], 'Cache-Control': 'no-store' });
    fs.createReadStream(path.join(output, target[0])).pipe(res);
  });
  server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ fixtureOnly: true, url: `http://127.0.0.1:${port}`, directory: output })));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
