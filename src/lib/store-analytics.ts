import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;
const num = (v: number | bigint | null | undefined): number => (typeof v === 'bigint' ? Number(v) : v || 0);

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Record a store storefront visit — deduped to one row per viewer per day. */
export async function recordStoreVisit(storeId: number, viewerKey: string) {
  try {
    await ensure();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const existing = await prisma.store_visits.findFirst({
      where: { store_id: BigInt(storeId), viewer: viewerKey, created_at: { gte: start } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.store_visits.create({ data: { store_id: BigInt(storeId), viewer: viewerKey, created_at: new Date() } });
    }
  } catch {
    /* visits are best-effort */
  }
}

export type VisitPoint = { date: string; visits: number };
export type StoreVisitorStats = {
  totalVisits: number;    // كل الزيارات (زائر واحد/يوم)
  uniqueVisitors: number; // زوّار مختلفون
  visits7: number;
  visits30: number;
  daily: VisitPoint[];    // آخر 30 يوماً
};

/** Visitor statistics for a store's storefront. */
export async function getStoreVisitorStats(storeId: number): Promise<StoreVisitorStats> {
  await ensure();
  const sid = BigInt(storeId);
  const empty = (): VisitPoint[] => {
    const out: VisitPoint[] = [];
    for (let i = 29; i >= 0; i--) out.push({ date: isoDay(new Date(Date.now() - i * 86400000)), visits: 0 });
    return out;
  };

  const [total, uniqRows] = await Promise.all([
    prisma.store_visits.count({ where: { store_id: sid } }).catch(() => 0),
    prisma.store_visits.findMany({ where: { store_id: sid }, distinct: ['viewer'], select: { id: true } }).catch(() => [] as { id: bigint }[]),
  ]);

  const since = new Date(Date.now() - 29 * 86400000);
  since.setHours(0, 0, 0, 0);
  const rows = await prisma.$queryRawUnsafe<{ d: Date | string; c: number | bigint }[]>(
    `SELECT DATE(created_at) AS d, COUNT(*) AS c
       FROM store_visits
      WHERE store_id = ? AND created_at IS NOT NULL AND created_at >= ?
      GROUP BY DATE(created_at)`,
    storeId,
    since,
  ).catch(() => [] as { d: Date | string; c: number | bigint }[]);

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = typeof r.d === 'string' ? r.d.slice(0, 10) : isoDay(r.d);
    byDay.set(key, num(r.c));
  }
  const daily: VisitPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const key = isoDay(new Date(Date.now() - i * 86400000));
    daily.push({ date: key, visits: byDay.get(key) || 0 });
  }
  const visits30 = daily.reduce((s, p) => s + p.visits, 0);
  const visits7 = daily.slice(-7).reduce((s, p) => s + p.visits, 0);

  return { totalVisits: total, uniqueVisitors: uniqRows.length, visits7, visits30, daily: daily.length ? daily : empty() };
}
