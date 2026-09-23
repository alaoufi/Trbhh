// أداة استرداد صلاحية الإدارة لحساب المالك في نظام الوصول الجديد (access-control).
// تُشغَّل داخل حاوية التطبيق (تقرأ DATABASE_URL من بيئتها). تمنح المستخدم المحدَّد
// (بالبريد أو الجوال أو اسم الدخول) دورًا بصلاحيات الإدارة + التكاملات (CJ) + المنتجات.
// الاستخدام: node /app/grant.mjs "<البريد أو الجوال أو اسم الدخول>"
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const ident = (process.argv[2] || '').trim();
const PERMS = [
  'dashboard:view', 'search:view',
  'access_control:view', 'access_control:manage_settings',
  'integrations:view', 'integrations:create', 'integrations:edit', 'integrations:authorize', 'integrations:sync', 'integrations:manage_settings',
  'products:view', 'products:create', 'products:edit', 'products:approve', 'products:export', 'products:manage_settings',
  'suppliers:view', 'suppliers:create', 'suppliers:edit',
  'audit:view',
];
const DEPTS = [['executive', 'الإدارة العليا'], ['integrations', 'المتاجر والتكاملات'], ['supply', 'الموردون والمنتجات'], ['audit', 'التدقيق والمراجعة'], ['technical', 'إدارة النظام التقنية']];

async function main() {
  if (!ident) { console.error('✖ مرّر معرّف الحساب: البريد أو الجوال أو اسم الدخول.'); process.exit(2); }
  const users = await db.$queryRawUnsafe(
    'SELECT id,name,userName,email,phoneNumber FROM users WHERE email=? OR phoneNumber=? OR userName=? OR name=? ORDER BY id LIMIT 6',
    ident, ident, ident, ident,
  );
  if (!users.length) { console.error(`✖ لا يوجد حساب مطابق لـ «${ident}». جرّب البريد أو الجوال أو اسم الدخول بالضبط.`); process.exit(1); }
  if (users.length > 1) {
    console.error('✖ أكثر من حساب مطابق — حدّد بدقّة (بالبريد مثلاً):');
    for (const u of users) console.error(`   - id=${String(u.id)} · ${u.name || u.userName || ''} · ${u.email || ''} · ${u.phoneNumber || ''}`);
    process.exit(1);
  }
  const uid = users[0].id;

  await db.$executeRawUnsafe('INSERT INTO access_control_state(id,revision,initialized_at) VALUES(1,1,NOW(3)) ON DUPLICATE KEY UPDATE initialized_at=COALESCE(initialized_at,NOW(3))');
  for (const [id, name] of DEPTS) await db.$executeRawUnsafe('INSERT IGNORE INTO access_departments(id,name,active) VALUES(?,?,1)', id, name);
  await db.$executeRawUnsafe("INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES('owner_cj','المالك — إدارة وتكاملات CJ','executive',1,1) ON DUPLICATE KEY UPDATE active=1,department_id='executive'");
  for (const p of PERMS) await db.$executeRawUnsafe('INSERT IGNORE INTO access_role_permissions(role_id,permission) VALUES(?,?)', 'owner_cj', p);
  await db.$executeRawUnsafe('INSERT IGNORE INTO access_user_roles(user_id,role_id) VALUES(?,?)', uid, 'owner_cj');

  const granted = await db.$queryRawUnsafe('SELECT COUNT(*) c FROM access_role_permissions WHERE role_id=?', 'owner_cj');
  console.log(`✓ تم منح الحساب id=${String(uid)} (${users[0].name || users[0].userName || ''}) دور «owner_cj» بـ ${Number(granted[0].c)} صلاحية.`);
  console.log('  الآن: سجّل خروجًا ثم دخولًا، وافتح /admin/suppliers/cj/browse');
}
main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); }).finally(() => db.$disconnect());
