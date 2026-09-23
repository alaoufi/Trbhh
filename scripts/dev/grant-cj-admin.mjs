// أداة استرداد صلاحية الإدارة لحساب المالك في نظام الوصول الجديد (access-control).
// تُشغَّل داخل حاوية التطبيق (تقرأ DATABASE_URL من بيئتها). تمنح المستخدم المحدَّد
// (بالبريد أو الجوال أو اسم الدخول) دورًا بصلاحيات الإدارة + التكاملات (CJ) + المنتجات.
// الاستخدام: node /app/grant.mjs "<البريد أو الجوال أو اسم الدخول>"
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const ident = (process.argv[2] || '').trim();
// كل الوحدات وإجراءاتها من كتالوج الصلاحيات — منح كامل (مالك).
const MODULES = [
  ['dashboard', ['view']], ['search', ['view']],
  ['finance', ['view', 'export']], ['settlements', ['view', 'create', 'edit', 'approve', 'refund', 'export', 'delete']],
  ['budget', ['view', 'edit', 'export']], ['expenses', ['view', 'create', 'delete', 'approve', 'refund', 'export']],
  ['invoices', ['view', 'create', 'export', 'refund', 'delete']], ['wallets', ['view', 'create', 'edit', 'refund', 'export']],
  ['topups', ['view', 'edit', 'approve', 'refund', 'delete']], ['payments', ['view', 'manage_settings']],
  ['returns', ['view', 'create', 'approve', 'refund', 'export', 'delete']], ['tax', ['view', 'manage_settings', 'approve', 'export']],
  ['suppliers', ['view', 'create', 'edit', 'delete']], ['products', ['view', 'create', 'edit', 'delete', 'approve', 'suspend', 'export', 'manage_settings']],
  ['categories', ['view', 'create', 'edit', 'delete', 'suspend', 'manage_settings']], ['ads', ['view', 'approve', 'archive', 'delete']],
  ['smart_ads', ['view', 'create', 'edit', 'delete']], ['classified', ['view', 'create', 'edit', 'delete', 'suspend']],
  ['duplicates', ['view', 'delete']], ['orders', ['view', 'create', 'edit', 'refund', 'export']],
  ['promos', ['view', 'create', 'edit', 'approve', 'delete']], ['packages', ['view', 'create', 'edit', 'delete']],
  ['pricing', ['view', 'manage_settings']], ['campaigns', ['view', 'create', 'edit', 'delete']],
  ['shipping', ['view', 'edit', 'manage_settings']], ['stores', ['view', 'create', 'edit', 'approve', 'suspend', 'delete']],
  ['integrations', ['view', 'create', 'edit', 'delete', 'authorize', 'sync', 'manage_settings']], ['users', ['view', 'create', 'edit', 'delete', 'ban', 'approve']],
  ['verifications', ['view', 'edit', 'approve', 'delete']], ['reports', ['view', 'edit', 'delete']],
  ['comments', ['view', 'edit', 'delete']], ['messages', ['view', 'create', 'edit', 'delete', 'archive']],
  ['notifications', ['view', 'create', 'delete']], ['words', ['view', 'create', 'edit', 'delete']],
  ['audit', ['view', 'export']], ['reconciliation', ['view', 'reconcile', 'export']],
  ['periods', ['view', 'close_period', 'reopen_period', 'approve']], ['archive', ['view']],
  ['access_control', ['view', 'manage_settings']], ['security', ['view', 'manage_settings']],
  ['settings', ['view', 'manage_settings']], ['texts', ['view', 'edit']], ['errors', ['view', 'delete']],
  ['backup', ['view', 'create', 'edit', 'delete', 'export']],
];
const PERMS = MODULES.flatMap(([m, acts]) => acts.map((a) => `${m}:${a}`));
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
  await db.$executeRawUnsafe("INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES('owner_cj','المالك — صلاحيات كاملة','executive',1,1) ON DUPLICATE KEY UPDATE active=1,department_id='executive',name='المالك — صلاحيات كاملة'");
  for (const p of PERMS) await db.$executeRawUnsafe('INSERT IGNORE INTO access_role_permissions(role_id,permission) VALUES(?,?)', 'owner_cj', p);
  await db.$executeRawUnsafe('INSERT IGNORE INTO access_user_roles(user_id,role_id) VALUES(?,?)', uid, 'owner_cj');

  const granted = await db.$queryRawUnsafe('SELECT COUNT(*) c FROM access_role_permissions WHERE role_id=?', 'owner_cj');
  console.log(`✓ تم منح الحساب id=${String(uid)} (${users[0].name || users[0].userName || ''}) دور «owner_cj» بـ ${Number(granted[0].c)} صلاحية.`);
  console.log('  الآن: سجّل خروجًا ثم دخولًا، وافتح /admin/suppliers/cj/browse');
}
main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); }).finally(() => db.$disconnect());
