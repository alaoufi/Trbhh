import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

export type AdAddonNow = { icon: string; label: string; until: Date | null; active: boolean };
export type AdAddonTxn = { id: number; label: string; amount: number; date: Date | null };

export type AdAddonsInfo = {
  current: AdAddonNow[];
  history: AdAddonTxn[];
};

/**
 * إضافات الإعلان المدفوعة: الحالة الحالية (من حقول الإعلان نفسها) + سجل
 * عمليات الشراء لهذا الإعلان من حركات المحفظة (الملاحظة موسومة بـ #رقم_الإعلان).
 * تظهر في صفحة الإعلان لأدوات الإدارة ولصاحب الإعلان.
 */
export async function getAdAddons(adId: number): Promise<AdAddonsInfo | null> {
  const ad = await prisma.ads.findUnique({
    where: { id: BigInt(adId) },
    select: { user_id: true, adsSpecial: true, expires_at: true, urgent_until: true, trbhh_until: true, bumped_at: true, store_only: true },
  }).catch(() => null);
  if (!ad) return null;

  const now = Date.now();
  const current: AdAddonNow[] = [];

  // تمييز الإعلان — adsSpecial=checked وتاريخ الانتهاء في expires_at
  if (ad.adsSpecial === 'checked') {
    current.push({ icon: '⭐', label: 'تمييز الإعلان', until: ad.expires_at, active: !ad.expires_at || ad.expires_at.getTime() > now });
  }
  // شارة عاجل
  if (ad.urgent_until) {
    current.push({ icon: '🔥', label: 'شارة عاجل', until: ad.urgent_until, active: ad.urgent_until.getTime() > now });
  }
  // عرض منتج المتجر في تربح
  if (ad.trbhh_until) {
    current.push({ icon: '📣', label: 'عرض في قوائم تربح', until: ad.trbhh_until, active: ad.trbhh_until.getTime() > now });
  }
  // آخر تحديث (رفع للأعلى) — معلومة بلا انتهاء
  if (ad.bumped_at) {
    current.push({ icon: '⬆️', label: 'آخر تحديث (رفع للأعلى)', until: ad.bumped_at, active: false });
  }

  // سجل الشراء: حركات خصم موسومة بـ #رقم_الإعلان في الملاحظة
  const re = new RegExp(`#${adId}(\\D|$)`);
  const txns = await prisma.wallet_txns.findMany({
    where: { user_id: BigInt(toInt(ad.user_id)), amount: { lt: 0 }, reason: { in: ['featured', 'urgent', 'bump', 'ad_show'] } },
    select: { id: true, note: true, amount: true, created_at: true },
    orderBy: { id: 'desc' },
    take: 300,
  }).catch(() => []);
  const history: AdAddonTxn[] = txns
    .filter((t) => re.test(t.note || ''))
    .slice(0, 30)
    .map((t) => ({ id: toInt(t.id), label: (t.note || '').replace(re, (m) => m.replace(`#${adId}`, '')).trim() || 'إضافة مدفوعة', amount: Math.abs(t.amount), date: t.created_at }));

  return { current, history };
}
