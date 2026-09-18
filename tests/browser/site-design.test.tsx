/** Isolated visual component test, NOT a live database/runtime acceptance test. */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import Link from 'next/link';
import type { Browser } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { AdGrid } from '../../src/components/ad-card';
import { ChromeGate } from '../../src/components/chrome-gate';
import type { AdCard } from '../../src/lib/data';

const request = vi.hoisted(() => ({ design: 'v2', enabled: true, pathname: '/' }));
// Only request and database-setting boundaries are replaced. Components and CSS are real.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: request.design }) }) }));
vi.mock('next/navigation', () => ({ usePathname: () => request.pathname }));
vi.mock('@/lib/settings', () => ({
  getSetting: async (key: string, fallback: string) => key === 'v2_design_on' ? (request.enabled ? '1' : '0') : fallback,
}));

const ad: AdCard = {
  id: 123, title: 'إعلان اختبار مرئي — بيانات غير حية', price: 1250,
  priceType: 'rent', rentPeriod: 'شهري', adsType: 'offer',
  image: 'https://fixture.invalid/image.svg', cityName: 'الرياض', categoryName: null,
  createdAt: '2026-09-18T00:00:00.000Z', special: false, urgent: false,
  views: 0, sellerName: 'معلن الاختبار', sellerTrusted: false,
};
let browser: Browser;
let css: string;

function contrast(a: string, b: string) {
  const luminance = (rgb: string) => (rgb.match(/[\d.]+/g) || []).slice(0, 3)
    .map(Number).map((n) => n / 255).map((n) => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4)
    .reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

beforeAll(async () => {
  const source = await readFile('src/app/globals.css', 'utf8');
  const compiled = await postcss([tailwind()]).process(source, { from: 'src/app/globals.css' });
  css = compiled.css + '\n' + await readFile('src/app/v2-design.css', 'utf8');
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright') as typeof import('playwright');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  await mkdir('scratchpad/optional-style-qa', { recursive: true });
}, 30_000);
afterAll(async () => { await browser?.close(); });

it.each([{ width: 390, night: false }, { width: 1440, night: false }, { width: 390, night: true }, { width: 1440, night: true }])('renders V2 without overflow at $width px, night=$night', async ({ width, night }) => {
  request.design = 'v2'; request.enabled = true; request.pathname = '/';
  const cards = await AdGrid({ ads: Array.from({ length: 4 }, (_, i) => ({ ...ad, id: ad.id + i })) });
  const content = renderToStaticMarkup(<ChromeGate header={<header>تربح — اختبار المظهر</header>} footer={<footer>نهاية الصفحة</footer>}><section className="home-discovery"><div className="home-discovery-heading"><Link href="/ads/new">إضافة إعلان</Link></div></section>{cards}</ChromeGate>);
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.route('**/*', async (route) => {
    if (route.request().url().includes('fixture.invalid')) {
      await route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#d8ded0"/></svg>' });
    } else await route.abort();
  });
  try {
    await page.setContent(`<html lang="ar" dir="rtl" data-design="v2" ${night ? 'data-theme="night"' : ''}><head><style>${css}</style></head><body>${content}</body></html>`);
    expect(await page.locator('.ad-card-v2').count()).toBe(4);
    expect(await page.locator('body').innerText()).toContain(ad.title);
    expect(await page.locator('body').innerText()).not.toContain('مستعمل');
    const boxes = await page.locator('.ad-card-v2').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect(); return { top: box.top, width: box.width };
    }));
    const firstRow = boxes.filter((box) => Math.abs(box.top - boxes[0].top) < 2);
    expect(firstRow.length).toBe(width < 640 ? 2 : 4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const colors = await page.evaluate(() => {
      const price = getComputedStyle(document.querySelector('.ad-card-v2-price')!);
      const card = getComputedStyle(document.querySelector('.ad-card-v2')!);
      const cta = getComputedStyle(document.querySelector('.home-discovery-heading > a')!);
      return { price: price.color, card: card.backgroundColor, cta: cta.color, ctaBackground: cta.backgroundColor };
    });
    expect(contrast(colors.price, colors.card)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.cta, colors.ctaBackground)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: resolve(`scratchpad/optional-style-qa/cards-${width}-${night ? 'night' : 'light'}.png`), fullPage: true });
  } finally { await page.close(); }
});

it.each(['/admin/settings', '/account/wallet', '/payment/result', '/companies/shop', '/store'])('does not apply public style scope on %s', (pathname) => {
  request.pathname = pathname;
  const html = renderToStaticMarkup(<ChromeGate header={<header>header</header>} footer={<footer>footer</footer>}><div>content</div></ChromeGate>);
  expect(html).not.toContain('public-site-shell');
});

it('renders classic AdGrid when the V2 cookie is stale after disabling the setting', async () => {
  request.design = 'v2'; request.enabled = false;
  const disabled = renderToStaticMarkup(await AdGrid({ ads: [ad] }));
  request.design = '';
  const classic = renderToStaticMarkup(await AdGrid({ ads: [ad] }));
  expect(disabled).toBe(classic);
});
