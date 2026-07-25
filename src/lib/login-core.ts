import 'server-only';
import { prisma } from './prisma';
import { verifyPassword } from './auth';
import { isUserBanned } from './moderation';
import { toInt } from './utils';

export type LoginResult = { ok: true; uid: number; name: string; type: string } | { ok: false; error: string };

/**
 * التحقق الموحّد من بيانات الدخول (رقم الجوال — ويُقبل اسم المستخدم/البريد
 * للحسابات القديمة — + كلمة المرور). تستخدمه صفحتا دخول تربح ودخول المتجر:
 * حساب واحد وجلسة واحدة، وأي تعديل لكلمة المرور يسري على البابين معاً.
 */
export async function verifyLogin(identifier: string, password: string): Promise<LoginResult> {
  if (!identifier || !password) return { ok: false, error: 'أدخل بيانات الدخول كاملة' };

  // تحديد المعدّل: نمنع تخمين كلمة المرور بعد عدة محاولات فاشلة لنفس المُعرِّف.
  const { rateGet, rateHit, rateReset } = await import('./redis');
  const rlKey = `rl:login:${identifier.toLowerCase().replace(/\s+/g, '')}`;
  if ((await rateGet(rlKey)) >= 8) {
    return { ok: false, error: 'محاولات دخول كثيرة، انتظر قليلاً ثم أعد المحاولة' };
  }

  let user = await prisma.users.findFirst({
    where: { OR: [{ userName: identifier }, { email: identifier }, { phoneNumber: identifier }] },
  });

  // مطابقة الجوال بأي صيغة مخزّنة (05.. / 5.. / 9665.. / +9665..)
  if (!user) {
    const digits = identifier.replace(/\D/g, '');
    if (digits.length >= 8) {
      let sig = digits.startsWith('966') ? digits.slice(3) : digits;
      sig = sig.replace(/^0+/, '');
      const forms = [sig, `0${sig}`, `966${sig}`, `00966${sig}`, `966${sig}`];
      const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
        `SELECT id FROM users
         WHERE REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-','') , '+','') IN (?,?,?,?,?)
         ORDER BY id LIMIT 1`,
        forms[0], forms[1], forms[2], forms[3], forms[4],
      ).catch(() => [] as { id: bigint }[]);
      if (rows[0]) user = await prisma.users.findUnique({ where: { id: rows[0].id } });
    }
  }

  if (!user || !(await verifyPassword(password, user.password))) {
    await rateHit(rlKey, 600); // احتسب المحاولة الفاشلة ضمن نافذة ١٠ دقائق
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }
  const uid = toInt(user.id);
  // حساب دُمج في حساب موحّد: يُمنع دخوله — يدخل صاحبه بالحساب الأساسي
  if (user.merged_into && Number(user.merged_into) > 0) {
    return { ok: false, error: 'هذا الحساب مدموج في حسابك الموحّد — ادخل بالحساب الأساسي.' };
  }
  if (await isUserBanned(uid)) return { ok: false, error: 'هذا الحساب محظور' };
  await rateReset(rlKey); // نجاح الدخول يصفّر العدّاد
  return { ok: true, uid, name: user.name || user.userName || 'عضو', type: user.type };
}
