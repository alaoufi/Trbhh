import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { getSettingBool, getSettingNum } from './settings';

const ensure = ensureSchema;

/* نظام النقاط والمكافآت — كل المعدلات من التحكم (الإيرادات). */
export const pointsEnabled = () => getSettingBool('points_on', false);

export type PointsConfig = { daily: number; firstAd: number; verify: number; rate: number; minConvert: number };
export async function getPointsConfig(): Promise<PointsConfig> {
  const [daily, firstAd, verify, rate, minConvert] = await Promise.all([
    getSettingNum('pts_daily', 5),
    getSettingNum('pts_first_ad', 50),
    getSettingNum('pts_verify', 100),
    getSettingNum('pts_rate', 100), // نقاط لكل ١ ريال
    getSettingNum('pts_min_convert', 500),
  ]);
  return { daily: Math.max(0, daily), firstAd: Math.max(0, firstAd), verify: Math.max(0, verify), rate: Math.max(1, rate), minConvert: Math.max(1, minConvert) };
}

export async function getPoints(userId: number): Promise<number> {
  await ensure();
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { points: true } }).catch(() => null);
  return u?.points ?? 0;
}

/** منح نقاط (مع سجل) — reason يُستخدم أيضاً لمنع التكرار عبر once. */
export async function grantPoints(userId: number, points: number, reason: string, once = false): Promise<void> {
  try {
    if (points <= 0 || !(await pointsEnabled())) return;
    await ensure();
    if (once) {
      const prior = await prisma.point_txns.count({ where: { user_id: BigInt(userId), reason } }).catch(() => 1);
      if (prior > 0) return;
    }
    await prisma.users.update({ where: { id: BigInt(userId) }, data: { points: { increment: points } } });
    await prisma.point_txns.create({ data: { user_id: BigInt(userId), points, reason } }).catch(() => {});
  } catch { /* لا يعطّل شيئاً */ }
}

/** نقطة الزيارة اليومية — مرة كل ٢٤ ساعة. */
export async function grantDailyVisit(userId: number): Promise<void> {
  try {
    if (!(await pointsEnabled())) return;
    const cfg = await getPointsConfig();
    if (cfg.daily <= 0) return;
    await ensure();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await prisma.point_txns.findFirst({ where: { user_id: BigInt(userId), reason: 'daily', created_at: { gt: dayAgo } }, select: { id: true } }).catch(() => null);
    if (recent) return;
    await grantPoints(userId, cfg.daily, 'daily');
  } catch { /* ignore */ }
}

/** تحويل النقاط إلى رصيد — بالمعدل والحد الأدنى من التحكم. */
export async function convertPoints(userId: number): Promise<{ ok: boolean; sar: number }> {
  await ensure();
  if (!(await pointsEnabled())) return { ok: false, sar: 0 };
  const cfg = await getPointsConfig();
  const pts = await getPoints(userId);
  if (pts < cfg.minConvert) return { ok: false, sar: 0 };
  const sar = Math.floor(pts / cfg.rate);
  if (sar <= 0) return { ok: false, sar: 0 };
  const used = sar * cfg.rate;
  const r = await prisma.users.updateMany({ where: { id: BigInt(userId), points: { gte: used } }, data: { points: { decrement: used } } }).catch(() => ({ count: 0 }));
  if (r.count === 0) return { ok: false, sar: 0 };
  await prisma.point_txns.create({ data: { user_id: BigInt(userId), points: -used, reason: 'convert' } }).catch(() => {});
  const { adjustBalance } = await import('./wallet');
  const credited = await adjustBalance(userId, sar, 'points_convert', { note: `تحويل ${used} نقطة` });
  if (!credited.ok) {
    // أعد النقاط إن فشل الإيداع
    await prisma.users.update({ where: { id: BigInt(userId) }, data: { points: { increment: used } } }).catch(() => {});
    return { ok: false, sar: 0 };
  }
  return { ok: true, sar };
}

/* ===================== الإحالة (دعوة صديق) ===================== */

export const referralEnabled = () => getSettingBool('referral_on', false);
export async function getReferralReward(): Promise<number> {
  return Math.max(0, await getSettingNum('referral_reward', 0));
}

/** مكافأة الإحالة (مرة واحدة لكل مدعو): عند أول إعلان أو توثيق للمدعو — للطرفين. */
export async function rewardReferral(invitedId: number): Promise<void> {
  try {
    if (!(await referralEnabled())) return;
    const reward = await getReferralReward();
    if (reward <= 0) return;
    await ensure();
    const invited = await prisma.users.findUnique({ where: { id: BigInt(invitedId) }, select: { ref_by: true, name: true } }).catch(() => null);
    const refBy = invited?.ref_by || 0;
    if (!refBy || refBy === invitedId) return;
    // مرة واحدة: علامة في سجل المحفظة
    const marker = `ref:${invitedId}`;
    const prior = await prisma.wallet_txns.count({ where: { reason: 'referral', note: marker } }).catch(() => 1);
    if (prior > 0) return;
    const { adjustBalance } = await import('./wallet');
    await adjustBalance(refBy, reward, 'referral', { note: marker });
    await adjustBalance(invitedId, reward, 'referral', { note: `${marker}:self` });
    // إشعار الداعي
    const [{ getPrimaryAdminId }, { sendChat }] = await Promise.all([import('./admin-inbox'), import('./chat')]);
    const adminId = await getPrimaryAdminId().catch(() => 0);
    if (adminId && adminId !== refBy) {
      await sendChat(adminId, refBy, `🎉 مكافأة دعوة صديق: انضم ${invited?.name || 'صديقك'} وتفاعل — أُضيف ${reward} ر.س لرصيدك ولرصيده.`).catch(() => {});
    }
  } catch { /* ignore */ }
}

/* ===================== الرصيد الترحيبي ===================== */

export async function getWelcomeCredit(): Promise<number> {
  return Math.max(0, await getSettingNum('welcome_credit', 0));
}

/** رصيد ترحيبي عند التسجيل (مرة واحدة بطبيعة الحال — يُستدعى من التسجيل فقط). */
export async function grantWelcome(userId: number): Promise<void> {
  try {
    const amount = await getWelcomeCredit();
    if (amount <= 0) return;
    const { adjustBalance } = await import('./wallet');
    await adjustBalance(userId, amount, 'welcome', { note: 'رصيد ترحيبي' });
  } catch { /* ignore */ }
}

