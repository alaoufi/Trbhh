import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';
import { loadBanned, censorSync } from './censor';
import { getSettingBool } from './settings';

/** معايير تقييم الإعلان (تجارب العملاء) — كأسلوب المتاجر الكبرى (أمازون/علي بابا). */
export const AD_REVIEW_CRITERIA = [
  { key: 'match', col: 'star_match', label: 'مطابقة الإعلان للواقع', icon: '🎯' },
  { key: 'trust', col: 'star_trust', label: 'مصداقية صاحب الإعلان', icon: '🤝' },
  { key: 'quality', col: 'star_quality', label: 'جودة المنتج / الخدمة', icon: '💎' },
  { key: 'comm', col: 'star_comm', label: 'سهولة التواصل والاستجابة', icon: '💬' },
] as const;
export type CriterionKey = (typeof AD_REVIEW_CRITERIA)[number]['key'];

/** مفتاح تحكّم: تفعيل تقييم الإعلانات (مفعّل افتراضياً). */
export async function adReviewsEnabled(): Promise<boolean> {
  return getSettingBool('ad_reviews_on', true).catch(() => true);
}

type Row = {
  id: bigint; sender_id: bigint; star: number; comment: string | null;
  star_match: number | null; star_trust: number | null; star_quality: number | null; star_comm: number | null;
  recommend: number | null; verified_deal: number | null; profile_id: bigint | null; created_at: Date | null;
};

const avg = (nums: number[]) => (nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10 : 0);

export type AdRating = {
  avg: number; count: number;
  dist: Record<1 | 2 | 3 | 4 | 5, number>;
  criteria: { key: CriterionKey; label: string; icon: string; avg: number }[];
  recommendPct: number;
};

/** ملخّص تقييم إعلان: المتوسط، العدد، توزيع النجوم، متوسط كل معيار، ونسبة التوصية. */
export async function getAdRating(adId: number): Promise<AdRating> {
  const rows = (await prisma.review_ads.findMany({
    where: { ads_id: BigInt(adId) },
    select: { star: true, star_match: true, star_trust: true, star_quality: true, star_comm: true, recommend: true },
  }).catch(() => [])) as Pick<Row, 'star' | 'star_match' | 'star_trust' | 'star_quality' | 'star_comm' | 'recommend'>[];
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) { const s = Math.min(5, Math.max(1, r.star || 0)) as 1 | 2 | 3 | 4 | 5; if (s >= 1) dist[s]++; }
  const criteria = AD_REVIEW_CRITERIA.map((c) => ({
    key: c.key, label: c.label, icon: c.icon,
    avg: avg(rows.map((r) => (r as unknown as Record<string, number | null>)[c.col]).filter((v): v is number => v != null && v > 0)),
  }));
  const recos = rows.map((r) => r.recommend).filter((v) => v != null);
  const recommendPct = recos.length ? Math.round((recos.filter((v) => v === 1).length / recos.length) * 100) : 0;
  return { avg: avg(rows.map((r) => r.star || 0).filter((v) => v > 0)), count: rows.length, dist, criteria, recommendPct };
}

/** ملخّصات تقييم دفعة واحدة (لبطاقات الإعلانات) — {adId: {avg, count}}. */
export async function getAdRatingsBrief(adIds: number[]): Promise<Map<number, { avg: number; count: number }>> {
  const out = new Map<number, { avg: number; count: number }>();
  const ids = [...new Set(adIds.filter((n) => n > 0))];
  if (!ids.length) return out;
  const rows = await prisma.review_ads.groupBy({
    by: ['ads_id'], where: { ads_id: { in: ids.map((n) => BigInt(n)) } }, _avg: { star: true }, _count: true,
  }).catch(() => [] as { ads_id: bigint; _avg: { star: number | null }; _count: number }[]);
  for (const g of rows) out.set(toInt(g.ads_id), { avg: Math.round((g._avg.star || 0) * 10) / 10, count: Number(g._count) });
  return out;
}

export type AdReview = {
  id: number; star: number; text: string; author: string; avatarUrl: string;
  criteria: Record<CriterionKey, number | null>; recommend: number | null; verifiedDeal: boolean; createdAt: string | null;
};

/** قائمة تجارب العملاء على إعلان (بأسماء هوياتهم، مع تشفير المحتوى المخالف). */
export async function getAdReviews(adId: number, limit = 50): Promise<AdReview[]> {
  const rows = (await prisma.review_ads.findMany({
    where: { ads_id: BigInt(adId) }, orderBy: { id: 'desc' }, take: limit,
  }).catch(() => [])) as Row[];
  if (!rows.length) return [];
  const senderIds = [...new Set(rows.map((r) => toInt(r.sender_id)))].map((n) => BigInt(n));
  const users = senderIds.length ? await prisma.users.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const byId = new Map(users.map((u) => [toInt(u.id), u]));
  const { getProfilesDisplayMap } = await import('./profiles');
  const profMap = await getProfilesDisplayMap(rows.map((r) => toInt(r.profile_id ?? 0n))).catch(() => new Map());
  await loadBanned().catch(() => {});
  return rows.map((r) => {
    const u = byId.get(toInt(r.sender_id));
    const pr = r.profile_id ? profMap.get(toInt(r.profile_id)) : undefined;
    return {
      id: toInt(r.id), star: r.star, text: censorSync(r.comment || ''),
      author: pr?.name || u?.name || u?.userName || 'مستخدم',
      avatarUrl: pr?.avatarUrl || '',
      criteria: { match: r.star_match, trust: r.star_trust, quality: r.star_quality, comm: r.star_comm },
      recommend: r.recommend, verifiedDeal: r.verified_deal === 1, createdAt: r.created_at ? r.created_at.toISOString() : null,
    };
  });
}

/** هل يستطيع الزائر تقييم هذا الإعلان؟ (الميزة مفعّلة، ليس صاحبه، ولم يقيّمه سابقاً). */
export async function canReviewAd(adId: number, viewerId: number | undefined, ownerId: number | undefined): Promise<boolean> {
  if (!(await adReviewsEnabled())) return false;
  if (!viewerId || (ownerId && viewerId === ownerId)) return false;
  const existing = await prisma.review_ads.findFirst({ where: { ads_id: BigInt(adId), sender_id: BigInt(viewerId) }, select: { id: true } }).catch(() => null);
  return !existing;
}

/** تقييم الزائر السابق لهذا الإعلان (لعرضه/تعديله). */
export async function myAdReview(adId: number, viewerId: number): Promise<{ id: number } | null> {
  const r = await prisma.review_ads.findFirst({ where: { ads_id: BigInt(adId), sender_id: BigInt(viewerId) }, select: { id: true } }).catch(() => null);
  return r ? { id: toInt(r.id) } : null;
}

/** مصداقية البائع الإجمالية عبر كل إعلاناته (متوسط عام + متوسط المصداقية + العدد). */
export async function getSellerCredibility(userId: number): Promise<{ avg: number; trust: number; count: number }> {
  const ads = await prisma.ads.findMany({ where: { user_id: BigInt(userId) }, select: { id: true } }).catch(() => []);
  if (!ads.length) return { avg: 0, trust: 0, count: 0 };
  const rows = await prisma.review_ads.findMany({
    where: { ads_id: { in: ads.map((a) => a.id) } }, select: { star: true, star_trust: true },
  }).catch(() => []);
  if (!rows.length) return { avg: 0, trust: 0, count: 0 };
  return {
    avg: avg(rows.map((r) => r.star || 0).filter((v) => v > 0)),
    trust: avg(rows.map((r) => r.star_trust).filter((v): v is number => v != null && v > 0)),
    count: rows.length,
  };
}
