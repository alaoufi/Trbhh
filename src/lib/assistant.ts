import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

const ensure = ensureSchema;

/**
 * المساعد العقاري الذكي — تحليلات مبنية على بيانات المنصّة نفسها (بلا خدمة خارجية):
 * تقييم مبدئي للعقار + تحليل أسعار المناطق + اقتراح عقارات. القيم تُشتقّ من الإعلانات
 * العقارية النشطة للبيع (سعر > 0، مساحة > 0) — سعر المتر المربّع مؤشّر إرشادي لا تقييم رسمي.
 */

type PricedAd = { price: number; area: number };

async function comparableAds(cityId?: number, reType?: string): Promise<PricedAd[]> {
  await ensure();
  const rows = await prisma.ads
    .findMany({
      where: {
        is_realestate: 1,
        status: 1,
        state: 'active',
        price: { gt: 0 },
        re_area: { gt: 0 },
        NOT: { price_type: 'rent' }, // البيع فقط للتقييم
        ...(cityId ? { city_id: BigInt(cityId) } : {}),
        ...(reType ? { re_type: reType } : {}),
      },
      select: { price: true, re_area: true },
      take: 2000,
    })
    .catch(() => [] as { price: number; re_area: number | null }[]);
  return rows
    .map((r) => ({ price: r.price || 0, area: r.re_area || 0 }))
    .filter((r) => r.price > 0 && r.area > 0);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type Valuation = {
  sample: number;
  perM2: number; // متوسط (وسيط) سعر المتر
  low: number; mid: number; high: number; // مدى التقدير للمساحة المطلوبة
};

/** تقييم مبدئي: يقدّر مدى سعر عقار من مقارِناته (سعر المتر × المساحة، ±12%). */
export async function estimateValue(cityId: number | undefined, reType: string | undefined, area: number): Promise<Valuation | null> {
  const ads = await comparableAds(cityId, reType);
  if (ads.length < 3 || !(area > 0)) return null;
  // سعر المتر لكل مقارِن، مع استبعاد الشواذ الطرفية (أدنى/أعلى 10%)
  const perM2All = ads.map((a) => a.price / a.area).sort((x, y) => x - y);
  const cut = Math.floor(perM2All.length * 0.1);
  const trimmed = perM2All.slice(cut, perM2All.length - cut || perM2All.length);
  const perM2 = median(trimmed.length ? trimmed : perM2All);
  const mid = Math.round(perM2 * area);
  return {
    sample: ads.length,
    perM2: Math.round(perM2),
    low: Math.round(mid * 0.88),
    mid,
    high: Math.round(mid * 1.12),
  };
}

export type AreaStat = { reType: string; sample: number; perM2: number; avgPrice: number };

/** تحليل أسعار المناطق: متوسط سعر المتر وعدد العروض لكل نوع عقار في مدينة. */
export async function areaPriceStats(cityId?: number): Promise<AreaStat[]> {
  await ensure();
  const rows = await prisma.ads
    .findMany({
      where: {
        is_realestate: 1, status: 1, state: 'active',
        price: { gt: 0 }, re_area: { gt: 0 }, NOT: { price_type: 'rent' },
        re_type: { not: null },
        ...(cityId ? { city_id: BigInt(cityId) } : {}),
      },
      select: { re_type: true, price: true, re_area: true },
      take: 5000,
    })
    .catch(() => [] as { re_type: string | null; price: number; re_area: number | null }[]);
  const byType = new Map<string, { perM2: number[]; prices: number[] }>();
  for (const r of rows) {
    const t = r.re_type || '';
    if (!t || !r.re_area || r.re_area <= 0 || !r.price) continue;
    if (!byType.has(t)) byType.set(t, { perM2: [], prices: [] });
    const g = byType.get(t)!;
    g.perM2.push(r.price / r.re_area);
    g.prices.push(r.price);
  }
  const out: AreaStat[] = [];
  for (const [reType, g] of byType) {
    if (g.perM2.length < 2) continue;
    out.push({ reType, sample: g.perM2.length, perM2: Math.round(median(g.perM2)), avgPrice: Math.round(median(g.prices)) });
  }
  return out.sort((a, b) => b.sample - a.sample);
}

/** اقتراح عقارات مطابقة لمعايير سريعة (نوع/مدينة/ميزانية) — روابط خفيفة. */
export async function suggestProperties(opts: { cityId?: number; reType?: string; budget?: number; take?: number }): Promise<Array<{ id: number; title: string; price: number }>> {
  await ensure();
  const rows = await prisma.ads
    .findMany({
      where: {
        is_realestate: 1, status: 1, state: 'active',
        AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }],
        ...(opts.reType ? { re_type: opts.reType } : {}),
        ...(opts.cityId ? { city_id: BigInt(opts.cityId) } : {}),
        ...(opts.budget && opts.budget > 0 ? { price: { gt: 0, lte: opts.budget } } : {}),
      },
      orderBy: [{ bumped_at: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      select: { id: true, title: true, price: true },
      take: opts.take || 8,
    })
    .catch(() => [] as { id: bigint; title: string | null; price: number }[]);
  return rows.map((r) => ({ id: toInt(r.id), title: r.title || '', price: r.price || 0 }));
}
