// اختبار حيّ (HTTP) محلي لحساب مؤقت بصلاحية audit:view فقط.
// يُشغّل MySQL في حاوية + التطبيق، ويُنشئ الحساب ومنحه، ويسجّل الدخول عبر كوكي
// جلسة موقّعة، ويتحقق فعليًا أن /admin/audit يُفتح مع حجب المبالغ، وأن
// /admin/finance و/admin/access-control مرفوضتان، ثم يحذف الحساب ويهدم البيئة.
// لا أسرار ثابتة: يولّد كلمة مرور ومفتاح توقيع عشوائيين لكل تشغيل.
//
// قيد معروف: يعتمد على تحميل database/trbhh.sql.gz للحصول على المخطط الأساسي
// (جدول users…). هذه النسخة قديمة (يوليو 2026) فيُشغَّل عليها schema-sync كاملاً من
// أساس قديم، ما يُظهر أخطاء ترتيب DDL محلياً (site_settings/wallet_topups، فهرس
// bumped_at) تُفسد قراءات الإعدادات/الجلسة محلياً فقط — وليست خللاً في كود الإنتاج
// (قاعدة الإنتاج تطوّرت تدريجياً ولا تمر بهذا المسار). للتشغيل النظيف: استخدم نسخة
// قاعدة حديثة، أو صلاحية وصول لقاعدة اختبار مُهيّأة. التحقق الموثوق من السلوك نفسه
// قائم في tests/unit/audit-only-role.test.ts وفي مجموعتَي access-control/finance
// التكامليتين على MySQL ضمن CI.
import { execSync, spawn } from 'node:child_process';
import { writeFileSync, openSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const DB = 'trbhh-e2e-db', UID = 990000001;
const DB_PORT = 3400 + Math.floor(Math.random() * 400);
const APP_PORT = 3800 + Math.floor(Math.random() * 400);
const SECRET = randomBytes(32).toString('hex');
const PW = 'AuditTest#' + randomBytes(4).toString('hex');
const HASH = bcrypt.hashSync(PW, 10);
const sh = (cmd, opts = {}) => execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
let app = null;

async function waitFor(label, fn, tries, gap) {
  for (let i = 0; i < tries; i++) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(gap); }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  // 1) قاعدة بيانات معزولة
  try { sh(`docker rm -f ${DB}`); } catch { /* none */ }
  sh(`docker run -d --name ${DB} -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=trbhh -p ${DB_PORT}:3306 mysql:8.0 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`);
  await waitFor('mysql', () => sh(`docker exec ${DB} mysqladmin ping -uroot -proot`).includes('alive'), 60, 2000);
  await sleep(3000);
  log('✓ MySQL جاهزة');

  // 1b) تحميل مخطط القاعدة الأساسي (users/admin_log…) من نسخة الإنتاج المضغوطة
  sh(`gunzip -c database/trbhh.sql.gz | docker exec -i ${DB} mysql -uroot -proot`, { shell: '/bin/bash', maxBuffer: 256 * 1024 * 1024 });
  await waitFor('users table', () => sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='trbhhdb' AND table_name='users'"`).trim().startsWith('1'), 10, 1000);
  log('✓ حُمّل المخطط الأساسي (جدول users موجود)');

  // 2) تشغيل التطبيق على القاعدة (schema-sync يُنشئ الجداول عند أول طلب)
  const env = { ...process.env, DATABASE_URL: `mysql://root:root@127.0.0.1:${DB_PORT}/trbhhdb`, AUTH_SECRET: SECRET, COOKIE_SECURE: 'false', STORAGE_DIR: '/tmp/e2e-storage', NEXT_TELEMETRY_DISABLED: '1', PORT: String(APP_PORT) };
  delete env.REDIS_URL;
  const logFd = openSync('/tmp/e2e-app.log', 'w');
  app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], { env, stdio: ['ignore', logFd, logFd], detached: true });
  await waitFor('app', async () => (await fetch(`http://127.0.0.1:${APP_PORT}/`)).status < 500, 60, 2000);
  // اضمن أن schema-sync أنشأ جداول التحكم بالوصول قبل البذر (استدعاءات متكررة لـ / لتشغيله)
  await waitFor('access schema', async () => {
    await fetch(`http://127.0.0.1:${APP_PORT}/`).catch(() => {});
    return sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='trbhhdb' AND table_name IN ('access_control_state','access_user_roles','finance_invoices')"`).trim().startsWith('3');
  }, 40, 1500);
  log('✓ التطبيق يعمل و schema-sync أنشأ جداول الوصول والمالية');

  // 3) بذر الحساب المؤقت + منح audit:view فقط + سطرَي سجل (مالي/عادي)
  const seed = `
SET FOREIGN_KEY_CHECKS=1;
INSERT INTO users (id,name,userName,phoneNumber,password,auth_session_version,type,ban,created_at)
  VALUES (${UID},'مدقق اختبار مؤقت','audit_tester','0500900001','${HASH}','0','user','no',NOW())
  ON DUPLICATE KEY UPDATE password=VALUES(password),auth_session_version='0',type='user',ban='no';
INSERT INTO access_control_state (id,revision,initialized_at) VALUES (1,1,NOW(3))
  ON DUPLICATE KEY UPDATE initialized_at=NOW(3);
INSERT IGNORE INTO access_departments (id,name,active) VALUES ('audit','التدقيق والمراجعة',1);
INSERT IGNORE INTO access_roles (id,name,department_id,active,system_role) VALUES ('audit_test','مدقق اختبار مؤقت','audit',1,0);
INSERT IGNORE INTO access_role_permissions (role_id,permission) VALUES ('audit_test','audit:view');
INSERT IGNORE INTO access_user_roles (user_id,role_id) VALUES (${UID},'audit_test');
INSERT INTO site_settings (k,v) VALUES ('auth_require_admin_mfa','0') ON DUPLICATE KEY UPDATE v='0';
INSERT INTO admin_log (admin_id,action,target,note,created_at) VALUES (${UID},'تأكيد شحن رصيد','طلب #77','E2E-مبلغ 500 ر.س للعضو #5',NOW());
INSERT INTO admin_log (admin_id,action,target,note,created_at) VALUES (${UID},'حذف إعلان مخالف','الإعلان #7','E2E-سطر-عادي غير مالي',NOW());
`;
  writeFileSync('/tmp/e2e-seed.sql', seed);
  sh(`docker exec -i ${DB} mysql -uroot -proot trbhhdb`, { input: seed });
  log('✓ بُذر الحساب المؤقت (audit:view فقط) + سطر سجل مالي وآخر عادي');

  // 4) كوكي جلسة موقّعة للحساب المؤقت (بلا نموذج دخول)
  const token = await new SignJWT({ uid: UID, name: 'مدقق اختبار مؤقت', type: 'user', authVersion: '0' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d')
    .sign(new TextEncoder().encode(SECRET));
  const cookie = { headers: { Cookie: `trbhh_session=${token}` }, redirect: 'manual' };

  // 5) الاختبارات الفعلية عبر HTTP
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${APP_PORT}${p}`, cookie); return { status: r.status, loc: r.headers.get('location') || '', body: await r.text() }; };
  const results = {};

  // تشخيص البذر
  log('DBG seed: users=' + sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COUNT(*) FROM trbhhdb.users WHERE id=${UID}"`).trim() +
    ' grants=' + sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COUNT(*) FROM trbhhdb.access_user_roles WHERE user_id=${UID}"`).trim() +
    ' logrows=' + sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COUNT(*) FROM trbhhdb.admin_log WHERE admin_id=${UID}"`).trim() +
    ' state=' + sh(`docker exec ${DB} mysql -uroot -proot -N -e "SELECT COALESCE(initialized_at,'null') FROM trbhhdb.access_control_state WHERE id=1"`).trim());

  const classify = (b) => b.includes('سجل نشاط الإدارة') ? 'AUDIT-PAGE'
    : (b.includes('كلمة المرور') || b.includes('تسجيل الدخول') || b.includes('name="password"')) ? 'LOGIN'
    : (b.includes('access=denied') || b.includes('لا تملك صلاحية') || b.includes('غير مصرّح')) ? 'DENIED'
    : b.includes('المالية') || b.includes('الفواتير') ? 'FINANCE-PAGE'
    : b.includes('الأقسام') || b.includes('الأدوار') ? 'ACCESS-PAGE' : 'OTHER';
  const acct = await get('/account');
  log(`DBG /account: status=${acct.status} loc=${acct.loc} class=${classify(acct.body)} (يثبت قبول الجلسة)`);
  const audit = await get('/admin/audit');
  log(`DBG audit class=${classify(audit.body)}`);
  const redacted = audit.body.includes('🔒 تفاصيل مالية محجوبة');
  const leaked = audit.body.includes('E2E-مبلغ 500');
  const neutralShown = audit.body.includes('E2E-سطر-عادي');
  results.audit_open = audit.status === 200;
  results.audit_amount_redacted = redacted && !leaked;
  results.audit_neutral_visible = neutralShown;
  log(`DBG audit: status=${audit.status} loc=${audit.loc} len=${audit.body.length} marker=${redacted} leak=${leaked} neutral=${neutralShown}`);
  log('DBG audit snippet: ' + audit.body.replace(/\s+/g, ' ').slice(0, 400));

  const fin = await get('/admin/finance');
  const ac = await get('/admin/access-control');
  log(`DBG finance: status=${fin.status} loc=${fin.loc} len=${fin.body.length}`);
  log(`DBG access:  status=${ac.status} loc=${ac.loc} len=${ac.body.length}`);
  const denied = (r) => [301,302,303,307,308].includes(r.status) && /access=denied|\/account/.test(r.loc);
  results.finance_denied = denied(fin);
  results.access_control_denied = denied(ac);

  // 6) حذف/تعطيل الحساب المؤقت ثم التأكد أنه فقد الوصول
  sh(`docker exec -i ${DB} mysql -uroot -proot trbhhdb`, { input: `DELETE FROM access_user_roles WHERE user_id=${UID}; DELETE FROM users WHERE id=${UID};` });
  const afterDelete = await get('/admin/audit');
  results.after_delete_denied = [301,302,303,307,308].includes(afterDelete.status) && /access=denied|\/account|\/login/.test(afterDelete.loc);
  log('✓ حُذف الحساب المؤقت');

  // 7) التقرير
  const pass = (k) => (results[k] ? 'PASS ✅' : 'FAIL ❌');
  log('\n================ نتيجة الاختبار الحيّ (audit:view فقط) ================');
  log(`/admin/audit يُفتح للحساب:            ${pass('audit_open')}`);
  log(`المبالغ محجوبة في السجل (500 مخفي):   ${pass('audit_amount_redacted')}`);
  log(`السطر غير المالي يظهر:                ${pass('audit_neutral_visible')}`);
  log(`/admin/finance مرفوضة:               ${pass('finance_denied')}`);
  log(`/admin/access-control مرفوضة:        ${pass('access_control_denied')}`);
  log(`بعد الحذف يفقد الوصول للسجل:          ${pass('after_delete_denied')}`);
  const ok = Object.values(results).every(Boolean);
  log(`\nالإجمالي: ${ok ? 'كل الفحوص ناجحة ✅' : 'يوجد فشل ❌'}`);
  log('=====================================================================');
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error('E2E ERROR:', e.message); try { console.error('--- app log tail ---\n' + execSync('tail -15 /tmp/e2e-app.log', { encoding: 'utf8' })); } catch { /* */ } process.exitCode = 1; })
  .finally(() => { try { if (app?.pid) process.kill(-app.pid, 'SIGKILL'); } catch { /* */ } try { execSync(`docker rm -f ${DB}`, { stdio: 'ignore' }); } catch { /* */ } });
