import 'server-only';
import { prisma } from './prisma';
import { PLACEHOLDER } from './media';
import { toInt } from './utils';
import { primaryImages, scopeWhere, type MyAdsScope } from './account';

export type DailyPoint = { date: string; views: number };
export type AdPerf = { id: number; title: string | null; status: number; views: number; image: string };
export type SellerAnalytics = {
  totalAds: number; activeAds: number; totalViews: number; views7: number; views30: number;
  daily: DailyPoint[]; topAds: AdPerf[];
};
export type AdPeriod = '7d' | '30d' | 'all';
export type AdPeriodStats = {
  periods: Record<AdPeriod, { views: number; contacts: number }>;
  /** The legacy favorites table has no date: this is a current count, not a period metric. */
  favorites: number;
};

const DAY_MS = 86400000;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const isoDay = (d: Date): string => new Date(d.getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
function periodBounds(now: Date) {
  const today = new Date(`${isoDay(now)}T00:00:00+03:00`);
  return { since7: new Date(+today - 6 * DAY_MS), since30: new Date(+today - 29 * DAY_MS), before: new Date(+today + DAY_MS) };
}
function emptyDaily(now: Date): DailyPoint[] {
  const { since30 } = periodBounds(now);
  return Array.from({ length: 30 }, (_, i) => ({ date: isoDay(new Date(+since30 + i * DAY_MS)), views: 0 }));
}

/** One source for per-ad cards and the seller dashboard. Undated legacy views
 * count in all-time only; date windows cover calendar days in Asia/Riyadh (UTC+3, no DST) on both pages. */
async function adViewAnalytics(ids: number[], now: Date) {
  const bounds = periodBounds(now);
  const byAd = new Map(ids.map((id) => [id, { all: 0, views7: 0, views30: 0 }]));
  const daily = emptyDaily(now);
  if (!ids.length) return { byAd, daily };
  const [all, rows] = await Promise.all([
    prisma.ads_views.groupBy({ by: ['ads_id'], where: { ads_id: { in: ids.map(BigInt) } }, _count: true }),
    prisma.$queryRawUnsafe<{ ads_id: bigint; d: string; c: number | bigint }[]>(
      `SELECT v.ads_id, DATE_FORMAT(DATE_ADD(v.created_at, INTERVAL 3 HOUR), '%Y-%m-%d') AS d, COUNT(*) AS c
       FROM ads_views v WHERE v.ads_id IN (${ids.map(() => '?').join(',')})
       AND v.created_at >= ? AND v.created_at < ?
       GROUP BY v.ads_id, DATE_FORMAT(DATE_ADD(v.created_at, INTERVAL 3 HOUR), '%Y-%m-%d')`,
      ...ids, bounds.since30, bounds.before,
    ),
  ]);
  for (const row of all) {
    const count = byAd.get(toInt(row.ads_id));
    if (count) count.all = Number(row._count);
  }
  const dayMap = new Map(daily.map((p) => [p.date, p]));
  const start7 = isoDay(bounds.since7);
  for (const row of rows) {
    const count = byAd.get(toInt(row.ads_id));
    const point = dayMap.get(row.d);
    if (!count || !point) continue;
    const value = Number(row.c);
    count.views30 += value;
    if (row.d >= start7) count.views7 += value;
    point.views += value;
  }
  return { byAd, daily };
}

/** Bulk metrics scoped to the ads already authorized by the account page. */
export async function getAdPeriodStats(adIds: number[]): Promise<Map<number, AdPeriodStats>> {
  const ids = [...new Set(adIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return new Map();
  const now = new Date();
  const { since7, since30, before } = periodBounds(now);
  const bigIds = ids.map(BigInt);
  const periods = ['7d', '30d', 'all'] as const;
  const [views, favorites, ...contacts] = await Promise.all([
    adViewAnalytics(ids, now),
    prisma.favorites.groupBy({ by: ['ads_id'], where: { ads_id: { in: bigIds } }, _count: { _all: true } }),
    ...periods.map((period) => prisma.ad_contacts.groupBy({
      by: ['ad_id'],
      where: { ad_id: { in: bigIds }, ...(period === 'all' ? {} : { created_at: { gte: period === '7d' ? since7 : since30, lt: before } }) },
      _count: { _all: true },
    })),
  ]);
  const contactMaps = contacts.map((rows) => new Map(rows.map((r) => [toInt(r.ad_id), r._count._all])));
  const favoriteMap = new Map(favorites.map((r) => [toInt(r.ads_id), r._count._all]));
  return new Map(ids.map((id) => {
    const v = views.byAd.get(id)!;
    return [id, {
      periods: {
        '7d': { views: v.views7, contacts: contactMaps[0].get(id) ?? 0 },
        '30d': { views: v.views30, contacts: contactMaps[1].get(id) ?? 0 },
        all: { views: v.all, contacts: contactMaps[2].get(id) ?? 0 },
      },
      favorites: favoriteMap.get(id) ?? 0,
    }];
  }));
}

export async function getSellerAnalytics(userId: number, scope?: MyAdsScope): Promise<SellerAnalytics> {
  const ads = await prisma.ads.findMany({
    where: scopeWhere(userId, scope), select: { id: true, title: true, status: true }, orderBy: { id: 'desc' },
  });
  const { byAd, daily } = await adViewAnalytics(ads.map((ad) => toInt(ad.id)), new Date());
  const totalViews = [...byAd.values()].reduce((sum, a) => sum + a.all, 0);
  const ranked = [...ads].sort((a, b) => (byAd.get(toInt(b.id))?.all ?? 0) - (byAd.get(toInt(a.id))?.all ?? 0)).slice(0, 20);
  const images = await primaryImages(ranked.map((a) => a.id));
  return {
    totalAds: ads.length, activeAds: ads.filter((a) => a.status === 1).length,
    totalViews, views7: daily.slice(-7).reduce((sum, d) => sum + d.views, 0), views30: daily.reduce((sum, d) => sum + d.views, 0), daily,
    topAds: ranked.map((ad) => ({ id: toInt(ad.id), title: ad.title, status: ad.status, views: byAd.get(toInt(ad.id))?.all ?? 0, image: images.get(toInt(ad.id)) ?? PLACEHOLDER })),
  };
}
