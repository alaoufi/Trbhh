import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getAccountVerifyRenew } from './settings';
import { charge } from './wallet';

const DAY = 86400000;

/** هل ثقة العضو الحالية مصدرها توثيق متجر مدفوع نشط؟ (نعزل نظامَي التوثيق فلا يمسّ
 *  انتهاءُ توثيق الحساب العاديّ مَن توثيقه من طلب متجر مدفوع ساري.) */
async function hasActiveStoreVerify(userId: number): Promise<boolean> {
  const r = await prisma.verify_orders
    .findFirst({ where: { user_id: BigInt(userId), status: 1, expires_at: { gt: new Date() } }, select: { id: true } })
    .catch(() => null);
  return !!r;
}

export type AccountVerifyState = {
  verified: boolean; // موثّق حالياً (وغير منتهٍ)
  permanent: boolean; // لا انتهاء (المدة = 0)
  storeBased: boolean; // ثقته من توثيق متجر مدفوع — لا يُدار من هنا
  expiresAt: string | null; // نهاية صلاحية توثيق الحساب (إن وُجدت مدة)
  lapsed: boolean; // كان موثّقاً وانتهت مدّته → يحتاج تجديداً مدفوعاً
  canRenew: boolean; // متاح التجديد الفوري بالحسم (رسم > 0)
  fee: number; days: number; balance: number;
};

/** حالة توثيق الحساب العادي — مع «كنس كسول»: إن انتهت المدة يُسحب توثيقه (trusted=0)
 *  فوراً ليُطلَب التجديد. لا يمسّ الموثّقين دائماً (مدة 0) ولا أصحاب توثيق المتجر المدفوع. */
export async function accountVerifyState(userId: number): Promise<AccountVerifyState> {
  await ensureSchema();
  const { days, fee } = await getAccountVerifyRenew();
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { trusted: true, verified_at: true, balance: true } }).catch(() => null);
  const balance = u?.balance ?? 0;
  const base = { permanent: days <= 0, fee, days, balance };
  // مدة غير مفعّلة (0) = توثيق دائم كالسابق تماماً
  if (days <= 0) {
    return { verified: u?.trusted === 1, storeBased: false, expiresAt: null, lapsed: false, canRenew: false, ...base };
  }
  // توثيقه من طلب متجر مدفوع ساري؟ لا يُدار من هنا
  if (await hasActiveStoreVerify(userId)) {
    return { verified: u?.trusted === 1, storeBased: true, expiresAt: null, lapsed: false, canRenew: false, ...base };
  }
  if (u?.trusted !== 1 || !u.verified_at) {
    return { verified: false, storeBased: false, expiresAt: null, lapsed: false, canRenew: false, ...base };
  }
  const expiresMs = u.verified_at.getTime() + days * DAY;
  const expiresAt = new Date(expiresMs).toISOString();
  if (expiresMs > Date.now()) {
    return { verified: true, storeBased: false, expiresAt, lapsed: false, canRenew: false, ...base };
  }
  // انتهت المدة → كنس كسول: اسحب الشارة حتى يُجدّد
  await prisma.users.updateMany({ where: { id: BigInt(userId), trusted: 1 }, data: { trusted: 0 } }).catch(() => {});
  return { verified: false, storeBased: false, expiresAt, lapsed: true, canRenew: fee > 0, ...base };
}

/** تجديد توثيق الحساب العادي فوراً بالحسم من الرصيد — بلا موافقة (أول توثيق فقط بموافقة). */
export async function renewAccountVerification(userId: number): Promise<{ ok: boolean; reason?: 'balance' | 'off' | 'notdue'; balance?: number }> {
  await ensureSchema();
  const { days, fee } = await getAccountVerifyRenew();
  if (days <= 0 || fee <= 0) return { ok: false, reason: 'off' };
  if (await hasActiveStoreVerify(userId)) return { ok: false, reason: 'notdue' };
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { verified_at: true } }).catch(() => null);
  // التجديد متاح فقط لمن سبق توثيقه (له verified_at) — أول توثيق يمرّ بالموافقة لا بالحسم
  if (!u?.verified_at) return { ok: false, reason: 'notdue' };
  const paid = await charge(userId, fee, 'verify_fee', `تجديد توثيق الحساب (${days} يوم)`);
  if (!paid.ok) return { ok: false, reason: 'balance', balance: paid.balance };
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { trusted: 1, step: 0, verified_at: new Date() } }).catch(() => {});
  return { ok: true, balance: paid.balance };
}
