/**
 * فحص الصلاحيات بحسابات اختبار على نسخة محلية معزولة (بيانات scripts/preview/seed.mjs).
 * يتحقق أن: الزائر والعضو العادي وصاحب المتجر لا يصلون لصفحات الإدارة، وأن واجهات API
 * الداخلية مغلقة، وأن كوكي الجلسة HttpOnly + Secure + SameSite.
 * الاستعمال: BASE=http://127.0.0.1:3100 PREVIEW_LOGIN_PASSWORD=... node security/authz-probe.cjs [ملف-الناتج.json]
 * يخرج بالرمز 1 عند أي إخفاق. لا يطبع كلمة المرور ولا الكوكيز.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const BASE = process.env.BASE || '';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE)) { console.error('مرفوض: BASE يجب أن يكون http://127.0.0.1:PORT (بيئة محلية فقط).'); process.exit(2); }
const pw = process.env.PREVIEW_LOGIN_PASSWORD || '';
if (!pw) { console.error('PREVIEW_LOGIN_PASSWORD مطلوب.'); process.exit(2); }

const ADMIN_PAGES = ['/admin', '/admin/users', '/admin/diagnostics', '/admin/errors', '/admin/revenue?tab=pricing', '/admin/revenue?tab=wallets', '/admin/backup', '/admin/settings', '/admin/finance', '/admin/access-control', '/admin/audit', '/admin/messages', '/admin/topups'];
const MEMBER_PAGES = ['/account', '/account/ads', '/messages'];
const INTERNAL_APIS = ['/api/internal/cj/sync', '/api/internal/cj/poll-orders', '/api/internal/cj/fulfill-orders', '/api/internal/cj/fulfillment-status', '/api/internal/cj/translate', '/api/internal/finance/capture', '/api/internal/suppliers/reconcile', '/api/finance/issue'];
const AUTH_APIS = ['/api/chat/1', '/api/shop/cart/state', '/api/cj/live'];

(async () => {
  // PW_CHROMIUM: مسار متصفح بديل إن لم يكن متصفح Playwright الخاص بالمشروع مثبّتاً.
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const failures = []; const checks = [];
  const cookies = {};
  for (const user of ['preview', 'preview-store']) {
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await page.fill('#login-identifier', user); await page.fill('#login-password', pw);
    await page.press('#login-password', 'Enter'); await page.waitForLoadState('networkidle'); await page.waitForTimeout(1200);
    const all = await ctx.cookies();
    const session = all.find((c) => c.name === 'trbhh_session');
    if (!session) failures.push(`تعذّر دخول حساب الاختبار ${user}`);
    else if (!session.httpOnly || !session.secure || !['Lax', 'Strict'].includes(session.sameSite)) failures.push(`كوكي الجلسة لحساب ${user} بلا HttpOnly/Secure/SameSite`);
    cookies[user] = all.map((c) => `${c.name}=${c.value}`).join('; ');
    await ctx.close();
  }
  const api = await browser.newContext();
  const fetchAs = async (who, method, path) => {
    const r = await api.request.fetch(BASE + path, { method, maxRedirects: 0, failOnStatusCode: false, timeout: 30000, headers: who === 'anon' ? {} : { Cookie: cookies[who] }, ...(method === 'POST' ? { data: {} } : {}) });
    const body = await r.text();
    const redirect = r.headers()['location'] || (/NEXT_REDIRECT;[^;]*;([^;]+);/.exec(body) || [])[1] || '';
    checks.push({ who, method, path, status: r.status(), redirect });
    return { status: r.status(), redirect };
  };
  for (const who of ['anon', 'preview', 'preview-store']) {
    for (const p of ADMIN_PAGES) {
      const r = await fetchAs(who, 'GET', p);
      const denied = who === 'anon' ? r.redirect.startsWith('/login') : r.redirect.startsWith('/account?access=denied');
      if (!denied) failures.push(`${who} وصل إلى صفحة إدارة: ${p} (status=${r.status}, redirect=${r.redirect || '—'})`);
    }
    for (const p of INTERNAL_APIS) {
      const r = await fetchAs(who, 'POST', p);
      if (r.status < 400) failures.push(`${who}: واجهة داخلية أجابت بنجاح: ${p} (${r.status})`);
    }
  }
  for (const p of MEMBER_PAGES) { const r = await fetchAs('anon', 'GET', p); if (!r.redirect.startsWith('/login')) failures.push(`زائر وصل إلى صفحة عضو: ${p}`); }
  for (const p of AUTH_APIS) { const r = await fetchAs('anon', 'GET', p); if (r.status !== 401) failures.push(`زائر: ${p} لم يُرجع 401 (${r.status})`); }
  await browser.close();
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ base: BASE, checks, failures }, null, 1));
  console.log(`authz: ${checks.length} فحصاً، ${failures.length} إخفاقاً`);
  for (const f of failures) console.error(' - ' + f);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('authz: خطأ تشغيل', String(e).slice(0, 200)); process.exit(1); });
