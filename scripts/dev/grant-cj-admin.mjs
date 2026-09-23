// أداة تشخيص + استرداد صلاحيات المالك في نظام الوصول الجديد (access-control).
// تُشغَّل داخل حاوية التطبيق (تقرأ DATABASE_URL من بيئتها).
// الاستخدام: node /app/grant.mjs "<البريد أو الجوال أو اسم الدخول>"
//
// تفعل الآتي بالترتيب مع طباعة تشخيص مفصّل لكل بوابة قبول:
//   1) تجد الحساب (جوال بآخر ٩ أرقام / بريد / اسم دخول) وتطبع حالة تفعيله.
//   2) تتأكد أن access_control_state مُهيّأ (initialized_at).
//   3) تُفعّل قسم executive والدور owner_cj (active=1) — لا مجرّد INSERT IGNORE.
//   4) تمنح كل الصلاحيات وتُسند الدور.
//   5) تُعيد تشغيل نفس استعلام القراءة الذي يستخدمه التطبيق للتأكد الفعلي.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

const ident = (process.argv[2] || '').trim();

// كل الوحدات وإجراءاتها — منح كامل (مالك).
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
const ROLE = 'owner_cj';
const DEPT = 'executive';
// نفس شرط «الحساب المُفعّل» المستخدم في src/lib/access-control/store.ts
const ENABLED_SQL = "u.archived_at IS NULL AND COALESCE(u.merged_into,0)=0 AND (COALESCE(u.ban,'no') <> 'checked' OR (u.ban_until IS NOT NULL AND u.ban_until <= UTC_TIMESTAMP()))";

// آخر ٩ أرقام من الجوال (تجاهل 0/966/+966 وأي رموز).
function phoneTail(v) { const d = String(v || '').replace(/\D+/g, ''); return d.length >= 9 ? d.slice(-9) : ''; }
async function step(label, fn) { try { await fn(); console.log(`   ✓ ${label}`); } catch (e) { console.log(`   ✖ ${label} — ${e?.message || e}`); } }
async function tableExists(name) { try { const r = await db.$queryRawUnsafe("SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? LIMIT 1", name); return r.length > 0; } catch { return false; } }
// عدد الصلاحيات الفعّالة كما يقرأها التطبيق تماماً.
async function effectiveCount(uid) {
  try {
    const rows = await db.$queryRawUnsafe(`SELECT COUNT(DISTINCT p.permission) c FROM users u JOIN access_user_roles a ON a.user_id=u.id JOIN access_roles r ON r.id=a.role_id AND r.active=1 JOIN access_departments d ON d.id=r.department_id AND d.active=1 JOIN access_role_permissions p ON p.role_id=r.id WHERE u.id=? AND ${ENABLED_SQL}`, uid);
    return Number(rows[0].c);
  } catch { return -1; }
}

// ── وضع القائمة: اعرض كل الحسابات الإدارية (قديمة/جديدة) ─────────────
async function listAdmins() {
  const hasPerms = await tableExists('admin_perms'), hasRoles = await tableExists('admin_roles');
  const legacy = [hasPerms ? 'EXISTS(SELECT 1 FROM admin_perms p WHERE p.user_id=u.id)' : '0', hasRoles ? 'EXISTS(SELECT 1 FROM admin_roles r WHERE r.user_id=u.id)' : '0'];
  const where = `u.is_admin>0 OR EXISTS(SELECT 1 FROM access_user_roles a WHERE a.user_id=u.id) OR ${legacy[0]} OR ${legacy[1]}`;
  const rows = await db.$queryRawUnsafe(`SELECT u.id,u.name,u.userName,u.email,u.phoneNumber,u.is_admin,(SELECT COUNT(*) FROM access_user_roles a WHERE a.user_id=u.id) roleCount FROM users u WHERE ${where} ORDER BY u.is_admin DESC,u.id LIMIT 60`);
  if (!rows.length) { console.log('لا يوجد أي حساب إداري (is_admin>0) ولا حساب له أدوار في نظام الوصول الجديد.'); return; }
  console.log(`الحسابات الإدارية (${rows.length}) — [id · is_admin · أدوار جديدة · صلاحيات فعّالة] الاسم · الدخول · البريد · الجوال:`);
  for (const r of rows) {
    const eff = await effectiveCount(r.id);
    console.log(`  id=${String(r.id)} · is_admin=${r.is_admin} · أدوار=${Number(r.roleCount)} · فعّالة=${eff} → ${r.name || ''} · ${r.userName || ''} · ${r.email || ''} · ${r.phoneNumber || ''}`);
  }
  console.log('\nالحساب الذي تدخل به وتظهر «فعّالة=0» هو المقفول. امنحه بالمُعرّف: node /app/grant.mjs id:<الرقم>');
}

async function main() {
  if (!ident) { console.error('✖ مرّر: معرّف الحساب (بريد/جوال/اسم)، أو «list» لعرض الحسابات الإدارية، أو «id:<رقم>» للمنح بالمُعرّف.'); process.exit(2); }
  if (ident === 'list' || ident === '--list') { await listAdmins(); return; }

  // ── 1) إيجاد الحساب ─────────────────────────────────────────────
  let u;
  const idMatch = /^id:(\d+)$/.exec(ident);
  if (idMatch) {
    const byId = await db.$queryRawUnsafe('SELECT id,name,userName,email,phoneNumber FROM users WHERE id=?', Number(idMatch[1]));
    if (!byId.length) { console.error(`✖ لا يوجد حساب بالمُعرّف id=${idMatch[1]}.`); process.exit(1); }
    u = byId[0];
  } else {
    const tail = phoneTail(ident);
    const users = tail
      ? await db.$queryRawUnsafe("SELECT id,name,userName,email,phoneNumber FROM users WHERE email=? OR userName=? OR RIGHT(REGEXP_REPLACE(COALESCE(phoneNumber,''),'[^0-9]',''),9)=? ORDER BY id LIMIT 8", ident, ident, tail)
      : await db.$queryRawUnsafe('SELECT id,name,userName,email,phoneNumber FROM users WHERE email=? OR userName=? OR name=? ORDER BY id LIMIT 8', ident, ident, ident);
    if (!users.length) { console.error(`✖ لا يوجد حساب مطابق لـ «${ident}». جرّب «list» لعرض كل الحسابات الإدارية ثم امنح بـ id:<رقم>.`); process.exit(1); }
    if (users.length > 1) {
      console.error('✖ أكثر من حساب مطابق — امنح بالمُعرّف الدقيق (id:<رقم>):');
      for (const x of users) console.error(`   - id=${String(x.id)} · ${x.name || x.userName || ''} · ${x.email || ''} · ${x.phoneNumber || ''}`);
      process.exit(1);
    }
    u = users[0];
  }
  const uid = u.id;
  console.log(`• الحساب المستهدف: id=${String(uid)} · ${u.name || u.userName || ''} · ${u.email || ''} · ${u.phoneNumber || ''}`);

  // ── تشخيص: هل الحساب «مُفعّل» بمنظور نظام الوصول؟ ────────────────
  const en = await db.$queryRawUnsafe(`SELECT (${ENABLED_SQL}) AS enabled, u.archived_at, u.merged_into, u.ban, u.ban_until FROM users u WHERE u.id=?`, uid);
  const e = en[0] || {};
  const enabled = Number(e.enabled) === 1;
  console.log(`• حالة التفعيل: ${enabled ? 'مُفعّل ✓' : '✖ غير مُفعّل'} (archived=${e.archived_at ? 'نعم' : 'لا'} · merged_into=${e.merged_into ?? 0} · ban=${e.ban ?? 'no'})`);
  if (!enabled) console.log('   ⚠ الحساب محظور/مؤرشف/مدموج — لن تُقرأ صلاحياته حتى يُعالَج ذلك. أبلغني بالتفاصيل أعلاه.');

  // ── تشخيص الحالة قبل الإصلاح ─────────────────────────────────────
  const st0 = await db.$queryRawUnsafe('SELECT initialized_at FROM access_control_state WHERE id=1');
  console.log(`• access_control_state: ${st0.length ? (st0[0].initialized_at ? `مُهيّأ (${st0[0].initialized_at})` : 'موجود لكن غير مُهيّأ (initialized_at=NULL)') : 'غير موجود'}`);
  const dep0 = await db.$queryRawUnsafe('SELECT active FROM access_departments WHERE id=?', DEPT);
  console.log(`• قسم ${DEPT}: ${dep0.length ? (Number(dep0[0].active) === 1 ? 'مُفعّل ✓' : '✖ غير مُفعّل (active=0)') : 'غير موجود'}`);
  const role0 = await db.$queryRawUnsafe('SELECT active,department_id FROM access_roles WHERE id=?', ROLE);
  console.log(`• دور ${ROLE}: ${role0.length ? `active=${role0[0].active} · department=${role0[0].department_id}` : 'غير موجود'}`);
  const asg0 = await db.$queryRawUnsafe('SELECT COUNT(*) c FROM access_user_roles WHERE user_id=? AND role_id=?', uid, ROLE);
  console.log(`• إسناد الدور للحساب: ${Number(asg0[0].c) > 0 ? 'موجود' : 'غير موجود'}`);

  // ── 2..4) الإصلاح (قسري ومتسامح) ────────────────────────────────
  console.log('— تطبيق الإصلاح —');
  await step('تهيئة access_control_state', () => db.$executeRawUnsafe('INSERT INTO access_control_state(id,revision,initialized_at) VALUES(1,1,NOW(3)) ON DUPLICATE KEY UPDATE initialized_at=COALESCE(initialized_at,NOW(3))'));
  for (const [id, name] of DEPTS) await step(`تفعيل قسم ${id}`, () => db.$executeRawUnsafe('INSERT INTO access_departments(id,name,active) VALUES(?,?,1) ON DUPLICATE KEY UPDATE active=1', id, name));
  await step(`إنشاء/تفعيل دور ${ROLE}`, () => db.$executeRawUnsafe(`INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES(?,?,?,1,1) ON DUPLICATE KEY UPDATE active=1,department_id=?,name=?`, ROLE, 'المالك — صلاحيات كاملة', DEPT, DEPT, 'المالك — صلاحيات كاملة'));
  let permOk = 0;
  for (const p of PERMS) { try { await db.$executeRawUnsafe('INSERT IGNORE INTO access_role_permissions(role_id,permission) VALUES(?,?)', ROLE, p); permOk++; } catch { /* تجاهل */ } }
  console.log(`   ✓ أُدرجت ${permOk}/${PERMS.length} صلاحية في الدور`);
  await step('إسناد الدور للحساب', () => db.$executeRawUnsafe('INSERT IGNORE INTO access_user_roles(user_id,role_id) VALUES(?,?)', uid, ROLE));

  // ── 5) التحقق بنفس استعلام القراءة الفعلي في التطبيق ─────────────
  const eff = await db.$queryRawUnsafe(
    `SELECT p.permission FROM users u JOIN access_user_roles a ON a.user_id=u.id JOIN access_roles r ON r.id=a.role_id AND r.active=1 JOIN access_departments d ON d.id=r.department_id AND d.active=1 LEFT JOIN access_role_permissions p ON p.role_id=r.id WHERE u.id=? AND ${ENABLED_SQL}`,
    uid,
  );
  const keys = new Set(eff.map((r) => r.permission).filter(Boolean));
  const need = ['integrations:view', 'access_control:view', 'finance:view', 'audit:view'];
  console.log('— التحقق النهائي (نفس منطق التطبيق) —');
  console.log(`• عدد الصلاحيات الفعّالة المقروءة: ${keys.size}`);
  for (const k of need) console.log(`   ${keys.has(k) ? '✓' : '✖'} ${k}`);
  if (keys.size > 0 && need.every((k) => keys.has(k))) {
    console.log('\n✅ تم — الحساب يملك الصلاحيات فعلياً الآن. سجّل خروجاً ثم دخولاً وافتح /admin/suppliers/cj/browse');
  } else {
    console.log('\n⚠ لم تُقرأ الصلاحيات رغم الإصلاح — الصقْ كل المخرجات أعلاه لأحدّد البوابة المتبقية (غالباً حساب غير مُفعّل أو حساب مختلف).');
  }
}
main().catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1); }).finally(() => db.$disconnect());
