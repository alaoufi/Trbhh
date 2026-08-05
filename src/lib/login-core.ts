import 'server-only';
import { prisma } from './prisma';
import { verifyPassword } from './auth';
import { isUserBanned } from './moderation';
import { toInt } from './utils';

export type LoginResult =
  | { ok: true; uid: number; name: string; type: string }
  | { ok: false; error: string; code?: 'empty' | 'rate' | 'bad' | 'banned' };

/**
 * التحقق المحلي فقط من بيانات الدخول (بلا فيدرالية) — يستخدمه `/sso/verify`
 * وتبني عليه `verifyLogin`. رقم الجوال (ويُقبل اسم المستخدم/البريد للحسابات
 * القديمة) + كلمة المرور.
 */
export async function verifyLoginLocal(identifier: string, password: string): Promise<LoginResult> {
  if (!identifier || !password) return { ok: false, error: 'أدخل بيانات الدخول كاملة', code: 'empty' };

  // تحديد المعدّل: نمنع تخمين كلمة المرور بعد عدة محاولات فاشلة لنفس المُعرِّف.
  const { rateGet, rateHit, rateReset } = await import('./redis');
  const rlKey = `rl:login:${identifier.toLowerCase().replace(/\s+/g, '')}`;
  if ((await rateGet(rlKey)) >= 8) {
    return { ok: false, error: 'محاولات دخول كثيرة، انتظر قليلاً ثم أعد المحاولة', code: 'rate' };
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
    return { ok: false, error: 'بيانات الدخول غير صحيحة', code: 'bad' };
  }
  const uid = toInt(user.id);
  if (await isUserBanned(uid)) return { ok: false, error: 'هذا الحساب محظور', code: 'banned' };
  await rateReset(rlKey); // نجاح الدخول يصفّر العدّاد
  return { ok: true, uid, name: user.name || user.userName || 'عضو', type: user.type };
}

/**
 * التحقق الموحّد من بيانات الدخول. تستخدمه صفحتا دخول تربح ودخول المتجر: حساب
 * واحد وجلسة واحدة، وأي تعديل لكلمة المرور يسري على البابين معاً.
 *
 * عند تفعيل الدخول الموحّد (SSO) وفشل الدخول المحلي لأن الحساب غير موجود/كلمة
 * المرور لا تطابق النسخة المحلية، نسأل الموقع النظير خادم-لخادم؛ فإن صحّت البيانات
 * عنده أنشأنا نسخة محلية للحساب (مع مزامنة البصمة) ودخل العضو مباشرة — فيعمل
 * الدخول على أي موقع بنفس بيانات التسجيل حتى دون انتقال مسبق.
 */
export async function verifyLogin(identifier: string, password: string): Promise<LoginResult> {
  const local = await verifyLoginLocal(identifier, password);
  if (local.ok) return local;

  // نُفدرِل فقط عند «غير موجود/كلمة مرور خاطئة» — لا نتجاوز حظراً/تحديد معدّل/بيانات ناقصة
  if (local.code !== 'bad') return local;

  const { ssoEnabled, federatedVerify, resolveLocalUser } = await import('./sso');
  if (!ssoEnabled()) return local;

  const fed = await federatedVerify(identifier, password);
  if (!fed) return local;

  const resolved = await resolveLocalUser(fed);
  if ('blocked' in resolved) return local; // محظور/مدموج/إداري محلياً — لا يُدخَل عبر الفيدرالية

  // صفّر عدّاد المحاولات الذي زاده الفشل المحلي قبل نجاح الفيدرالية
  const { rateReset } = await import('./redis');
  await rateReset(`rl:login:${identifier.toLowerCase().replace(/\s+/g, '')}`).catch(() => {});

  return {
    ok: true,
    uid: toInt(resolved.user.id),
    name: resolved.user.name || resolved.user.userName || 'عضو',
    type: resolved.user.type,
  };
}
