// Read-only acceptance of the freshly deployed sandbox; no saved user data changes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.PREVIEW_VERIFY_URL;
const url=new URL(base);
assert.equal(url.protocol,'https:');
assert.match(url.hostname,/^[a-z0-9-]+\.trycloudflare\.com$/);
assert.equal(url.port,''); assert.equal(url.pathname,'/');
assert.equal(url.username+url.password+url.search+url.hash,'');
assert.ok(process.env.PREVIEW_LOGIN_PASSWORD,'Sandbox credential required');
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  await page.goto(base,{waitUntil:'networkidle'});
  assert.match(await page.locator('body').innerText(),/بيئة اختبار مستقلة/);
  assert.equal(await page.locator('a[href^="tel:"],a[href^="https://wa.me/"]').count(),0);
  const photo=page.locator('img[src*="snapshot-media"]').first();
  await photo.waitFor(); await photo.evaluate(image=>image.decode());
  assert.ok(await photo.evaluate(image=>image.naturalWidth>0));
  assert.equal((await context.request.get(new URL('/api/preview-state',base).href)).status(),401);
  assert.equal((await context.request.get(new URL('/admin',base).href)).status(),404);
  await page.goto(new URL('/preview-login?next=/ads/new',base).href);
  await page.locator('input[name="identifier"]').fill('preview');
  await page.locator('input[name="password"]').fill(process.env.PREVIEW_LOGIN_PASSWORD);
  await page.getByRole('button',{name:'دخول',exact:true}).click();
  await page.waitForURL('**/ads/new');
  await page.getByLabel('القسم الرئيسي').waitFor();
  const state=await page.evaluate(async()=>{const r=await fetch('/api/preview-state');const b=await r.json();return {status:r.status,ownerId:b.ownerId};});
  assert.equal(state.status,200); assert.ok(Number.isSafeInteger(state.ownerId));
  assert.ok((await context.cookies()).filter(cookie=>cookie.name==='trbhh_session').every(cookie=>cookie.secure&&cookie.httpOnly));
  console.log('PASS: external HTTPS guest browsing, original photo, blocked admin, real sandbox login and authenticated state read. No data written.');
} finally {await browser.close();}
