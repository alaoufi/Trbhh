/** Full local server smoke test. Refuses any non-disposable database or non-loopback server. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const dbUrl = new URL(process.env.DATABASE_URL || '');
assert.equal(dbUrl.protocol, 'mysql:');
assert.equal(dbUrl.hostname, '127.0.0.1');
assert.equal(dbUrl.port, '33309');
assert.equal(dbUrl.pathname, '/trbhh_style_test');
const base = 'http://127.0.0.1:4189';
const db = new PrismaClient();
let existingServer = false;
try { await fetch(base, { signal: AbortSignal.timeout(1000) }); existingServer = true; } catch {}
assert.equal(existingServer, false, 'Refusing to use an existing process on the test port');
const settings = {
  v2_design_on: '1', v2_design_label: 'المظهر الاختباري V2', v2_design_description: 'اختبار محلي معزول',
  home_discovery_title: 'عنوان من قاعدة الاختبار النشطة',
  welcome_guest_text: '', classified_splash_seconds: '0',
};
const saved = await db.site_settings.findMany({ where: { k: { in: Object.keys(settings) } } });
let child;
let browser;
let user;
const adIds = [];
try {
  assert.equal(await db.users.count(), 0, 'Requires an empty disposable user table');
  assert.equal(await db.ads.count(), 0, 'Requires an empty disposable ads table');
  user = await db.users.create({ data: { type: 'user', name: 'معلن اختبار محلي', userName: 'style-fixture', password: await bcrypt.hash('local-style-test-password-2026', 4) } });
  for (let i = 0; i < 4; i++) {
    const ad = await db.ads.create({ data: {
      user_id: user.id, city_id: 0n, category_id: 0n, adsType: 'offer', adsSpecial: 'no', state: 'active',
      title: `إعلان اختبار معزول ${i + 1}`, detail: 'ليس إعلاناً حياً. مخصص لاختبار التبديل بين القوالب.', video_path: '',
      price: 1250 + i, price_type: 'fixed', created_at: new Date(), trbhh_until: new Date(Date.now() + 86400000),
    } });
    adIds.push(ad.id);
  }
  for (const [k, v] of Object.entries(settings)) await db.site_settings.upsert({ where: { k }, create: { k, v }, update: { v } });
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '4189'], {
    windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, AUTH_SECRET: 'local_verification_only_not_a_production_secret_20260919', NEXT_TELEMETRY_DISABLED: '1' },
  });
  let serverErrors = '';
  child.stderr.on('data', (data) => { serverErrors = (serverErrors + data.toString()).slice(-12000); });
  let ready = false;
  for (let i = 0; i < 40; i++) {
    if (child.exitCode !== null) throw new Error(`Server exited: ${serverErrors}`);
    try { if ((await fetch(base, { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  assert.ok(ready, `Local server not ready: ${serverErrors}`);
  const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/*', (route) => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('html').getAttribute('data-design'), null, 'Enabled alone must not change default');
  assert.ok((await page.locator('body').innerText()).includes(settings.home_discovery_title));
  async function selectDesign(label) {
    await page.getByRole('button', { name: 'القائمة', exact: true }).click();
    await page.getByRole('button', { name: 'الألوان والقوالب 🎨', exact: true }).click();
    await page.getByRole('button', { name: label, exact: false }).click();
    await page.getByRole('button', { name: 'إغلاق', exact: true }).click();
  }
  await selectDesign(settings.v2_design_label);
  await page.locator('.ad-card-v2').first().waitFor();
  assert.ok(await page.locator('.ad-card-v2').count() >= 4);
  assert.equal(await page.locator('html').getAttribute('data-design'), 'v2');
  assert.equal((await page.context().cookies()).find((cookie) => cookie.name === 'design')?.value, 'v2');
  await page.reload({ waitUntil: 'networkidle' });
  assert.ok(await page.locator('.ad-card-v2').count() >= 4, 'V2 survives refresh');
  await page.goto(`${base}/search`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.ad-card-v2').count(), 4, `Same database ads in search. Page: ${await page.locator('body').innerText()}. Server: ${serverErrors}`);
  for (const id of adIds) assert.equal(await page.locator(`.ad-card-v2[href="/ads/${id}"]`).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile no overflow');
  await selectDesign('ثلاثي الأبعاد');
  await page.waitForFunction(() => !document.querySelector('.ad-card-v2'));
  assert.equal(await page.locator('html').getAttribute('data-design'), null);
  await selectDesign(settings.v2_design_label);
  await page.locator('.ad-card-v2').first().waitFor();
  // Test the previously independent menu/gallery selectors against the actual application.
  await page.goto(`${base}/login?next=/account/design`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.public-site-shell').count(), 0);
  await page.getByLabel('اسم المستخدم أو رقم الجوال').fill('style-fixture');
  await page.getByLabel('كلمة المرور', { exact: true }).fill('local-style-test-password-2026');
  await page.getByRole('button', { name: 'دخول', exact: true }).click();
  await page.waitForURL(`${base}/account/design`);
  const v2Choice = page.locator('.card-3d').filter({ has: page.getByText(settings.v2_design_label, { exact: true }) });
  const classicChoice = page.locator('.card-3d').filter({ has: page.getByText('ثلاثي الأبعاد', { exact: true }) });
  await v2Choice.getByRole('button', { name: 'قالبك الحالي', exact: true }).waitFor();
  await selectDesign('ثلاثي الأبعاد');
  await classicChoice.getByRole('button', { name: 'قالبك الحالي', exact: true }).waitFor();
  assert.equal(await v2Choice.getByRole('button', { name: 'اعتماد هذا القالب', exact: true }).isEnabled(), true);
  await v2Choice.getByRole('button', { name: 'اعتماد هذا القالب', exact: true }).click();
  await v2Choice.getByRole('button', { name: 'قالبك الحالي', exact: true }).waitFor();
  await page.goto(`${base}/search`, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.ad-card-v2').count(), 4);
  await db.site_settings.update({ where: { k: 'v2_design_on' }, data: { v: '0' } });
  // Direct fixture writes intentionally don't use admin invalidation: exercise the existing 30s TTL.
  console.log('Runtime: guest switch, persistence, same DB ads, mobile and authenticated cross-selector sync passed; checking disabled flag after cache expiry.');
  await delay(31000);
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('.ad-card-v2').count(), 0);
  assert.equal(await page.locator('html').getAttribute('data-design'), null);
  assert.deepEqual(pageErrors, [], 'No browser JS errors');
  console.log('PASS: active disposable DB settings/ads, classic default, guest opt-in, refresh/search persistence, mobile, reset and flag-disable fallback. NOT a production/live-DB acceptance test.');
} finally {
  await browser?.close();
  child?.kill();
  if (adIds.length) await db.ads.deleteMany({ where: { id: { in: adIds } } });
  if (user) await db.users.delete({ where: { id: user.id } });
  for (const k of Object.keys(settings)) {
    const original = saved.find((row) => row.k === k);
    if (original) await db.site_settings.upsert({ where: { k }, create: original, update: { v: original.v } });
    else await db.site_settings.deleteMany({ where: { k } });
  }
  await db.$disconnect();
}
