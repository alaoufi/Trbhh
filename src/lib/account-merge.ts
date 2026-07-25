import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

/** إخفاء وسط رقم الجوال للعرض: يُبقي أول رقمين وآخر ثلاثة (مثال: 05••••789). */
export function maskPhone(phone: string | null | undefined): string {
  const s = (phone || '').replace(/\s+/g, '');
  if (s.length < 6) return s || '';
  return `${s.slice(0, 2)}${'•'.repeat(Math.max(3, s.length - 5))}${s.slice(-3)}`;
}

type ResolvedUser = { id: number; name: string | null; userName: string | null; phone: string | null; is_admin: number; merged: boolean };

/** يحلّ مُعرّفاً (جوال/اسم مستخدم/بريد) إلى حساب واحد — بنفس مطابقة صيغ الجوال في الدخول. */
async function resolveUserByIdentifier(identifier: string): Promise<ResolvedUser | null> {
  await ensureSchema();
  const sel = { id: true, name: true, userName: true, phoneNumber: true, is_admin: true, merged_into: true } as const;
  let u = await prisma.users.findFirst({ where: { OR: [{ userName: identifier }, { email: identifier }, { phoneNumber: identifier }] }, select: sel }).catch(() => null);
  if (!u) {
    const digits = identifier.replace(/\D/g, '');
    if (digits.length >= 8) {
      let sig = digits.startsWith('966') ? digits.slice(3) : digits;
      sig = sig.replace(/^0+/, '');
      const forms = [sig, `0${sig}`, `966${sig}`, `00966${sig}`];
      const rows = await prisma.$queryRawUnsafe<{ id: bigint }[]>(
        `SELECT id FROM users
         WHERE REPLACE(REPLACE(REPLACE(IFNULL(phoneNumber,''),' ',''),'-','') , '+','') IN (?,?,?,?)
         ORDER BY id LIMIT 1`,
        forms[0], forms[1], forms[2], forms[3],
      ).catch(() => [] as { id: bigint }[]);
      if (rows[0]) u = await prisma.users.findUnique({ where: { id: rows[0].id }, select: sel }).catch(() => null);
    }
  }
  if (!u) return null;
  return { id: toInt(u.id), name: u.name, userName: u.userName, phone: u.phoneNumber || null, is_admin: u.is_admin, merged: !!(u.merged_into && Number(u.merged_into) > 0) };
}

/** يتحقّق أن الحساب الآخر قابل للدمج (موجود، ليس نفسه، غير مدموج، غير إداري). */
export async function findMergeableAccount(identifier: string, selfUid: number): Promise<{ ok: boolean; uid?: number; phone?: string | null; name?: string; error?: string }> {
  const u = await resolveUserByIdentifier(identifier);
  if (!u) return { ok: false, error: 'notfound' };
  if (u.id === selfUid) return { ok: false, error: 'self' };
  if (u.merged) return { ok: false, error: 'alreadymerged' };
  if (u.is_admin === 1) return { ok: false, error: 'admin' };
  return { ok: true, uid: u.id, phone: u.phone, name: u.name || u.userName || 'حساب' };
}

/** حسابات «مرشّحة للدمج»: تشارك العضو نفس رقم الهوية الوطنية أو البريد (إثبات قوي أنها له). */
export async function getMergeCandidates(selfUid: number): Promise<{ uid: number; name: string; maskedPhone: string; phone: string | null; via: 'national' | 'email' }[]> {
  await ensureSchema();
  const me = await prisma.users.findUnique({ where: { id: BigInt(selfUid) }, select: { national_identity: true, email: true } }).catch(() => null);
  if (!me) return [];
  const or: { national_identity?: number; email?: string }[] = [];
  if (me.national_identity && me.national_identity > 0) or.push({ national_identity: me.national_identity });
  if (me.email && me.email.trim()) or.push({ email: me.email.trim() });
  if (!or.length) return [];
  const rows = await prisma.users.findMany({
    where: { AND: [{ OR: or }, { id: { not: BigInt(selfUid) } }, { is_admin: 0 } ] },
    select: { id: true, name: true, userName: true, phoneNumber: true, national_identity: true, email: true, merged_into: true },
    take: 12,
  }).catch(() => []);
  return rows
    .filter((r) => !(r.merged_into && Number(r.merged_into) > 0))
    .filter((r) => !!(r.phoneNumber && r.phoneNumber.trim())) // الدمج المقترح برمز SMS يتطلّب رقماً
    .map((r) => ({
      uid: toInt(r.id),
      name: (r.name || r.userName || 'حساب').slice(0, 60),
      phone: r.phoneNumber || null,
      maskedPhone: maskPhone(r.phoneNumber),
      via: (me.national_identity && r.national_identity === me.national_identity ? 'national' : 'email') as 'national' | 'email',
    }));
}

/**
 * دمج ذاتي آمن لحساب قديم في الحساب الموحّد (بإذن صاحبه بعد التحقق من كلمة مروره).
 * يُنقل: الإعلانات (تحت هوية نشر جديدة) + المتاجر + الرصيد (يُجمع). ويُعطّل دخول
 * الحساب القديم (merged_into). البيانات الأخرى (محادثات/مفضلة/نقاط) تبقى على الحساب
 * القديم دون فقدان — غير قابلة للوصول بعد التعطيل (لا تُحذف).
 */
export async function mergeAccountInto(primaryUid: number, secondaryUid: number): Promise<{ ok: boolean; error?: string; movedAds?: number; movedBalance?: number; profileId?: number }> {
  await ensureSchema();
  if (!primaryUid || !secondaryUid || primaryUid === secondaryUid) return { ok: false, error: 'same' };

  const [primary, secondary] = await Promise.all([
    prisma.users.findUnique({ where: { id: BigInt(primaryUid) }, select: { id: true, merged_into: true } }),
    prisma.users.findUnique({ where: { id: BigInt(secondaryUid) }, select: { id: true, name: true, userName: true, phoneNumber: true, phone_whatsapp: true, email: true, balance: true, is_admin: true, merged_into: true } }),
  ]);
  if (!primary || !secondary) return { ok: false, error: 'notfound' };
  if (primary.merged_into && Number(primary.merged_into) > 0) return { ok: false, error: 'primarymerged' };
  if (secondary.merged_into && Number(secondary.merged_into) > 0) return { ok: false, error: 'alreadymerged' };
  if (secondary.is_admin === 1) return { ok: false, error: 'admin' };

  // 1) هوية نشر جديدة للحساب المستورد (اسمه/جواله/بريده)
  const profile = await prisma.profiles.create({
    data: {
      user_id: BigInt(primaryUid), type: 'personal', is_default: 0,
      name: (secondary.name || secondary.userName || 'حساب مستورد').slice(0, 120),
      phone: secondary.phoneNumber || null, whatsapp: secondary.phone_whatsapp || null, email: secondary.email || null,
    },
  });

  // 2) نقل الإعلانات → الحساب الموحّد وربطها بهوية النشر الجديدة
  const movedAds = await prisma.ads.updateMany({ where: { user_id: BigInt(secondaryUid) }, data: { user_id: BigInt(primaryUid), profile_id: profile.id } }).then((r) => r.count).catch(() => 0);

  // 3) نقل المتاجر → الحساب الموحّد (stores.user_id هو Int)
  await prisma.stores.updateMany({ where: { user_id: secondaryUid }, data: { user_id: primaryUid } }).catch(() => {});

  // 4) جمع الرصيد ثم تصفير القديم
  const bal = Number(secondary.balance) || 0;
  if (bal > 0) {
    await prisma.users.update({ where: { id: BigInt(primaryUid) }, data: { balance: { increment: bal } } }).catch(() => {});
    await prisma.users.update({ where: { id: BigInt(secondaryUid) }, data: { balance: 0 } }).catch(() => {});
  }

  // 5) تعطيل دخول الحساب القديم (مدموج)
  await prisma.users.update({ where: { id: BigInt(secondaryUid) }, data: { merged_into: BigInt(primaryUid) } }).catch(() => {});

  return { ok: true, movedAds, movedBalance: bal, profileId: toInt(profile.id) };
}
