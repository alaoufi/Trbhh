import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;
const num = (v: number | bigint | null | undefined): number => (typeof v === 'bigint' ? Number(v) : v || 0);

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export type VisitSource = 'direct' | 'internal' | 'search' | 'whatsapp' | 'social' | 'external';
export const SOURCE_LABELS: Record<VisitSource, string> = {
  direct: 'مباشر',
  internal: 'من داخل تربح',
  search: 'محركات البحث',
  whatsapp: 'واتساب',
  social: 'تواصل اجتماعي',
  external: 'مواقع خارجية',
};

/** Classify a visit source from the HTTP Referer (and our own host). */
export function classifySource(referer: string | null | undefined, selfHost: string): VisitSource {
  const r = (referer || '').trim().toLowerCase();
  if (!r) return 'direct';
  let host = '';
  try { host = new URL(r).hostname; } catch { host = ''; }
  if (!host) return 'direct';
  const base = selfHost.replace(/^www\./, '').toLowerCase();
  if (host === base || host.endsWith(`.${base}`)) return 'internal'; // trbhh.com or *.trbhh.com
  if (/(google|bing|yahoo|duckduckgo|yandex|baidu)\./.test(host)) return 'search';
  if (/(whatsapp|wa\.me)/.test(host)) return 'whatsapp';
  if (/(facebook|fb\.|instagram|twitter|x\.com|t\.co|snapchat|tiktok|telegram|t\.me|youtube|linkedin)/.test(host)) return 'social';
  return 'external';
}

/** Increment the store's page-view counter — one per store entry/refresh
 *  (NOT deduped; a store view ≠ an ad view). */
export async function bumpStoreView(storeId: number) {
  try {
    await ensure();
    await prisma.stores.update({ where: { id: BigInt(storeId) }, data: { views: { increment: 1 } } });
  } catch {
    /* best-effort */
  }
}

/** Total store page views (entries/refreshes). */
export async function getStoreViews(storeId: number): Promise<number> {
  await ensure();
  const s = await prisma.stores.findUnique({ where: { id: BigInt(storeId) }, select: { views: true } }).catch(() => null);
  return s?.views ?? 0;
}

/** Total ad views for a specific set of ads (e.g. the ads displayed in a store). */
export async function getAdViewsFor(adIds: number[]): Promise<number> {
  await ensure();
  if (!adIds.length) return 0;
  return prisma.ads_views.count({ where: { ads_id: { in: adIds.map((n) => BigInt(n)) } } }).catch(() => 0);
}

/** Record a store storefront visit — deduped to one row per viewer per day. */
export async function recordStoreVisit(storeId: number, viewerKey: string, source: VisitSource = 'direct') {
  try {
    await ensure();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const existing = await prisma.store_visits.findFirst({
      where: { store_id: BigInt(storeId), viewer: viewerKey, created_at: { gte: start } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.store_visits.create({ data: { store_id: BigInt(storeId), viewer: viewerKey, source, created_at: new Date() } });
    }
  } catch {
    /* visits are best-effort */
  }
}

/** Record a contact conversion (WhatsApp/call) — deduped per viewer/kind/day. */
export async function recordStoreContact(storeId: number, viewerKey: string, kind: 'whatsapp' | 'call') {
  try {
    await ensure();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const existing = await prisma.store_contacts.findFirst({
      where: { store_id: BigInt(storeId), viewer: viewerKey, kind, created_at: { gte: start } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.store_contacts.create({ data: { store_id: BigInt(storeId), viewer: viewerKey, kind, created_at: new Date() } });
    }
  } catch {
    /* best-effort */
  }
}

export type VisitPoint = { date: string; visits: number };
export type SourceSlice = { source: VisitSource; label: string; count: number };
export type StoreConversions = { whatsapp: number; call: number; uniqueContacts: number; rate: number };
export type StoreVisitorStats = {
  totalVisits: number;    // كل الزيارات (زائر واحد/يوم)
  uniqueVisitors: number; // زوّار مختلفون
  visits7: number;
  visits30: number;
  daily: VisitPoint[];    // آخر 30 يوماً
  sources: SourceSlice[]; // مصادر الزيارات
  conversions: StoreConversions; // نِسب التحويل (تواصل)
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

  // مصادر الزيارات
  const srcGroups = await prisma.store_visits.groupBy({ by: ['source'], where: { store_id: sid }, _count: true }).catch(() => [] as { source: string | null; _count: number }[]);
  const srcMap = new Map<VisitSource, number>();
  for (const g of srcGroups) {
    const key = (g.source || 'direct') as VisitSource;
    srcMap.set(key, (srcMap.get(key) || 0) + num(g._count as unknown as number));
  }
  const sources: SourceSlice[] = (Object.keys(SOURCE_LABELS) as VisitSource[])
    .map((s) => ({ source: s, label: SOURCE_LABELS[s], count: srcMap.get(s) || 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  // نِسب التحويل (تواصل)
  const [waCount, callCount, uniqContacts] = await Promise.all([
    prisma.store_contacts.count({ where: { store_id: sid, kind: 'whatsapp' } }).catch(() => 0),
    prisma.store_contacts.count({ where: { store_id: sid, kind: 'call' } }).catch(() => 0),
    prisma.store_contacts.findMany({ where: { store_id: sid }, distinct: ['viewer'], select: { id: true } }).catch(() => [] as { id: bigint }[]),
  ]);
  const uniqueContacts = uniqContacts.length;
  const rate = uniqRows.length > 0 ? Math.round((uniqueContacts / uniqRows.length) * 100) : 0;

  return {
    totalVisits: total,
    uniqueVisitors: uniqRows.length,
    visits7,
    visits30,
    daily: daily.length ? daily : empty(),
    sources,
    conversions: { whatsapp: waCount, call: callCount, uniqueContacts, rate },
  };
}
