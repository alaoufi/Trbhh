import 'server-only';
import { prisma } from './prisma';
import { mediaUrl, PLACEHOLDER } from './media';
import { toInt } from './utils';

const num = (v: number | bigint | null | undefined): number => (typeof v === 'bigint' ? Number(v) : v || 0);

export type DailyPoint = { date: string; views: number };
export type AdPerf = { id: number; title: string | null; status: number; views: number; image: string };
export type SellerAnalytics = {
  totalAds: number;
  activeAds: number;
  totalViews: number;
  views7: number;
  views30: number;
  daily: DailyPoint[]; // last 30 days, one entry per day (zero-filled)
  topAds: AdPerf[]; // seller's ads sorted by all-time views
};

/** yyyy-mm-dd for a Date in the server's local zone (dates come back already truncated). */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build the full analytics snapshot for one seller (all of their ads). */
export async function getSellerAnalytics(userId: number): Promise<SellerAnalytics> {
  const uid = BigInt(userId);
  const ads = await prisma.ads.findMany({
    where: { user_id: uid },
    select: { id: true, title: true, status: true },
    orderBy: { id: 'desc' },
  });
  const totalAds = ads.length;
  const activeAds = ads.filter((a) => a.status === 1).length;
  if (!totalAds) {
    return { totalAds: 0, activeAds: 0, totalViews: 0, views7: 0, views30: 0, daily: emptyDaily(30), topAds: [] };
  }
  const ids = ads.map((a) => a.id);

  // All-time views per ad (works even for legacy rows with null created_at).
  const perAd = await prisma.ads_views.groupBy({ by: ['ads_id'], where: { ads_id: { in: ids } }, _count: true });
  const viewsByAd = new Map<number, number>();
  for (const g of perAd) viewsByAd.set(toInt(g.ads_id), num(g._count as unknown as number));
  const totalViews = [...viewsByAd.values()].reduce((s, n) => s + n, 0);

  // Daily views for the last 30 days across all the seller's ads.
  const since = new Date(Date.now() - 29 * 86400000);
  since.setHours(0, 0, 0, 0);
  const rows = await prisma.$queryRawUnsafe<{ d: Date | string; c: number | bigint }[]>(
    `SELECT DATE(v.created_at) AS d, COUNT(*) AS c
       FROM ads_views v
       JOIN ads a ON a.id = v.ads_id
      WHERE a.user_id = ? AND v.created_at IS NOT NULL AND v.created_at >= ?
      GROUP BY DATE(v.created_at)`,
    userId,
    since,
  ).catch(() => [] as { d: Date | string; c: number | bigint }[]);

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = typeof r.d === 'string' ? r.d.slice(0, 10) : isoDay(r.d);
    byDay.set(key, num(r.c));
  }
  const daily: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000);
    const key = isoDay(day);
    daily.push({ date: key, views: byDay.get(key) || 0 });
  }
  const views30 = daily.reduce((s, p) => s + p.views, 0);
  const views7 = daily.slice(-7).reduce((s, p) => s + p.views, 0);

  // Per-ad performance table (top by views), with primary image.
  const ranked = [...ads].sort((a, b) => (viewsByAd.get(toInt(b.id)) || 0) - (viewsByAd.get(toInt(a.id)) || 0));
  const topAds: AdPerf[] = await Promise.all(
    ranked.slice(0, 20).map(async (a) => ({
      id: toInt(a.id),
      title: a.title,
      status: a.status,
      views: viewsByAd.get(toInt(a.id)) || 0,
      image: await primaryImage(a.id),
    })),
  );

  return { totalAds, activeAds, totalViews, views7, views30, daily, topAds };
}

function emptyDaily(n: number): DailyPoint[] {
  const out: DailyPoint[] = [];
  for (let i = n - 1; i >= 0; i--) out.push({ date: isoDay(new Date(Date.now() - i * 86400000)), views: 0 });
  return out;
}

async function primaryImage(adId: bigint): Promise<string> {
  const ph = await prisma.photos.findFirst({ where: { other_id: adId }, orderBy: { id: 'asc' } });
  if (!ph) return PLACEHOLDER;
  const up = await prisma.uploads.findUnique({ where: { id: BigInt(parseInt(ph.photo_path, 10) || 0) } });
  return up?.file_name ? mediaUrl(up.file_name) : PLACEHOLDER;
}
