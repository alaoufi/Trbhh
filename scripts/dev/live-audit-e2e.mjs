// اختبار حيّ (HTTP) محلي لحساب مؤقت بصلاحية audit:view فقط.
// يُشغّل MySQL في حاوية + التطبيق، ويُنشئ الحساب ومنحه، ويسجّل الدخول عبر كوكي
// جلسة موقّعة، ويتحقق فعليًا أن /admin/audit يُفتح مع حجب المبالغ، وأن
// /admin/finance و/admin/access-control مرفوضتان، ثم يحذف الحساب ويهدم البيئة.
// لا أسرار ثابتة: يولّد كلمة مرور ومفتاح توقيع عشوائيين لكل تشغيل.
import { execSync, spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';

const DB = 'trbhh-e2e-db', DB_PORT = 3310, APP_PORT = 3010, UID = 900001;
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
  sh(`docker run -d --name ${DB} -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=trbhh -p ${DB_PORT}:3306 mysql:8 --default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci`);
  await waitFor('mysql', () => sh(`docker exec ${DB} mysqladmin ping -uroot -proot`).includes('alive'), 60, 2000);
  await sleep(3000);
  log('✓ MySQL جاهزة');

  // 2) تشغيل التطبيق على القاعدة (schema-sync يُنشئ الجداول عند أول طلب)
  const env = { ...process.env, DATABASE_URL: `mysql://root:root@127.0.0.1:${DB_PORT}/trbhh`, AUTH_SECRET: SECRET, COOKIE_SECURE: 'false', STORAGE_DIR: '/tmp/e2e-storage', NEXT_TELEMETRY_DISABLED: '1', PORT: String(APP_PORT) };
  delete env.REDIS_URL;
  app = spawn('npx', ['next', 'start', '-p', String(APP_PORT)], { env, stdio: 'ignore', detached: false });
  await waitFor('app', async () => (await fetch(`http://127.0.0.1:${APP_PORT}/`)).status < 500, 60, 2000);
  await sleep(4000); // مهلة لإكمال schema-sync
  log('✓ التطبيق يعمل و schema-sync أنشأ الجداول');

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
INSERT INTO admin_log (admin_id,action,target,note,created_at) VALUES (${UID},'تأكيد شحن رصيد','طلب #77','500 ر.س للعضو #5',NOW());
INSERT INTO admin_log (admin_id,action,target,note,created_at) VALUES (${UID},'حذف إعلان مخالف','الإعلان #7','صورة مخالفة',NOW());
`;
  writeFileSync('/tmp/e2e-seed.sql', seed);
  sh(`docker exec -i ${DB} mysql -uroot -proot trbhh`, { input: seed });
  log('✓ بُذر الحساب المؤقت (audit:view فقط) + سطر سجل مالي وآخر عادي');

  // 4) كوكي جلسة موقّعة للحساب المؤقت (بلا نموذج دخول)
  const token = await new SignJWT({ uid: UID, name: 'مدقق اختبار مؤقت', type: 'user', authVersion: '0' })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d')
    .sign(new TextEncoder().encode(SECRET));
  const cookie = { headers: { Cookie: `trbhh_session=${token}` }, redirect: 'manual' };

  // 5) الاختبارات الفعلية عبر HTTP
  const get = async (p) => { const r = await fetch(`http://127.0.0.1:${APP_PORT}${p}`, cookie); return { status: r.status, loc: r.headers.get('location') || '', body: await r.text() }; };
  const results = {};

  const audit = await get('/admin/audit');
  const redacted = audit.body.includes('🔒 تفاصيل مالية محجوبة');
  const leaked = audit.body.includes('500 ر.س');
  const neutralShown = audit.body.includes('صورة مخالفة');
  results.audit_open = audit.status === 200;
  results.audit_amount_redacted = redacted && !leaked;
  results.audit_neutral_visible = neutralShown;

  const denied = (r) => [301,302,303,307,308].includes(r.status) && /access=denied|\/account/.test(r.loc);
  results.finance_denied = denied(await get('/admin/finance'));
  results.access_control_denied = denied(await get('/admin/access-control'));

  // 6) حذف/تعطيل الحساب المؤقت ثم التأكد أنه فقد الوصول
  sh(`docker exec -i ${DB} mysql -uroot -proot trbhh`, { input: `DELETE FROM access_user_roles WHERE user_id=${UID}; DELETE FROM users WHERE id=${UID};` });
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

main().catch((e) => { console.error('E2E ERROR:', e.message); process.exitCode = 1; })
  .finally(() => { try { app?.kill('SIGKILL'); } catch { /* */ } try { execSync(`docker rm -f ${DB}`, { stdio: 'ignore' }); } catch { /* */ } });
