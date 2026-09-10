import 'server-only';
import { prisma } from './prisma';
import { verifyPassword } from './auth';
import { isUserBanned } from './moderation';
import { toInt } from './utils';

export type LoginResult = { ok: true; uid: number; name: string; type: string; authVersion: string; mfaVersion?: string } | { ok: false; error: string };

/**
 * التحقق الموحّد من بيانات الدخول (رقم الجوال — ويُقبل اسم المستخدم/البريد
 * للحسابات القديمة — + كلمة المرور). تستخدمه صفحتا دخول تربح ودخول المتجر:
 * حساب واحد وجلسة واحدة، وأي تعديل لكلمة المرور يسري على البابين معاً.
 */
export async function verifyLogin(identifier: string, password: string, factorCode = ''): Promise<LoginResult> {
  if (!identifier || !password || identifier.length > 254 || password.length > 1024) return { ok: false, error: 'أدخل بيانات الدخول كاملة' };
  const { ensureSchema } = await import('@/data/schema-sync');
  await ensureSchema();

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

  const { takeSecurityAttempt, clearSecurityAttempts, getMfaCredential, consumeMfa, isPrivilegedAccount } = await import('./auth-security');
  if (user && !(await takeSecurityAttempt(`password:${user.id}`))) return { ok: false, error: 'محاولات دخول كثيرة؛ انتظر عشر دقائق ثم أعد المحاولة.' };
  if (!user || !(await verifyPassword(password, user.password))) {
    await rateHit(rlKey, 600); // احتسب المحاولة الفاشلة ضمن نافذة ١٠ دقائق
    return { ok: false, error: 'بيانات الدخول غير صحيحة' };
  }
  const uid = toInt(user.id);
  if (user.archived_at) return { ok: false, error: 'هذا الحساب مؤرشف ولا يمكن تسجيل الدخول به. راجع الإدارة عند الحاجة.' };
  // حساب دُمج في حساب موحّد: يُمنع دخوله — يدخل صاحبه بالحساب الأساسي
  if (user.merged_into && Number(user.merged_into) > 0) {
    return { ok: false, error: 'هذا الحساب مدموج في حسابك الموحّد — ادخل بالحساب الأساسي.' };
  }
  if (await isUserBanned(uid)) return { ok: false, error: 'هذا الحساب محظور' };
  await clearSecurityAttempts(`password:${uid}`);
  const credential = await getMfaCredential(uid);
  let mfaVersion: string | undefined;
  if (credential) {
    if (!factorCode) return { ok: false, error: 'أدخل رمز تطبيق التحقق أو أحد رموز الاسترداد المحفوظة.' };
    mfaVersion = (await consumeMfa(uid, factorCode)) || undefined;
    if (!mfaVersion) return { ok: false, error: 'رمز التحقق غير صحيح أو مستخدم سابقاً؛ بعد المحاولات المتكررة انتظر عشر دقائق.' };
  } else {
    const { getAuthSecuritySettings } = await import('./settings');
    if ((await getAuthSecuritySettings()).requireAdminMfa && await isPrivilegedAccount(uid)) return { ok: false, error: 'يلزم تجهيز التحقق لحساب الإدارة. تواصل مع مسؤول النظام لاستعادة الوصول.' };
  }
  await rateReset(rlKey);
  return { ok: true, uid, name: user.name || user.userName || 'عضو', type: user.type, authVersion: user.auth_session_version, ...(mfaVersion ? { mfaVersion } : {}) };
}
