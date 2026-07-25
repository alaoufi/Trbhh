import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

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
