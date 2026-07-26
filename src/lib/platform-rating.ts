import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';

const ensure = ensureSchema;

/** متوسط تقييم منصة تربح ونجومها — للزوّار والأعضاء معاً. */
export async function getPlatformRating(): Promise<{ avg: number; count: number }> {
  await ensure();
  const rows = await prisma.platform_reviews.findMany({ select: { star: true } }).catch(() => []);
  if (!rows.length) return { avg: 0, count: 0 };
  const sum = rows.reduce((a, r) => a + (r.star || 0), 0);
  return { avg: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}

export type PlatformReview = { star: number; note: string | null; at: string | null; name: string; username: string | null; city: string | null };

/** كل تقييمات المنصة للإدارة — مع اسم العضو ومعرّفه ومنطقته وملاحظته. الأحدث أولاً. */
export async function getPlatformReviews(limit = 300): Promise<PlatformReview[]> {
  await ensure();
  const rows = await prisma.platform_reviews
    .findMany({ orderBy: { id: 'desc' }, take: limit, select: { star: true, note: true, created_at: true, user_id: true, viewer_key: true } })
    .catch(() => []);
  const uidOf = (r: { user_id: number | null; viewer_key: string | null }) =>
    r.user_id ?? (r.viewer_key && r.viewer_key.startsWith('u') ? Number(r.viewer_key.slice(1)) || 0 : 0);
  const ids = [...new Set(rows.map(uidOf).filter((n) => n > 0))];
  const users = ids.length
    ? await prisma.users.findMany({ where: { id: { in: ids.map((n) => BigInt(n)) } }, select: { id: true, name: true, userName: true, city_id: true } }).catch(() => [])
    : [];
  const cityIds = [...new Set(users.map((u) => u.city_id).filter((c): c is bigint => !!c))];
  const cities = cityIds.length
    ? await prisma.cities.findMany({ where: { id: { in: cityIds } }, select: { id: true, name: true } }).catch(() => [])
    : [];
  const cityName = new Map(cities.map((c) => [Number(c.id), c.name]));
  const userMap = new Map(
    users.map((u) => [Number(u.id), { name: u.name || u.userName || 'عضو', username: u.userName ?? null, city: u.city_id ? cityName.get(Number(u.city_id)) ?? null : null }]),
  );
  return rows.map((r) => {
    const uid = uidOf(r);
    const u = uid ? userMap.get(uid) : null;
    return {
      star: r.star,
      note: r.note ?? null,
      at: r.created_at ? r.created_at.toISOString() : null,
      name: u?.name ?? (uid ? `#${uid}` : 'زائر'),
      username: u?.username ?? null,
      city: u?.city ?? null,
    };
  });
}

/** هل سبق أن قيّم هذا الزائر/العضو المنصة؟ (viewer_key: u{id} أو g{vid}). */
export async function hasRatedPlatform(viewerKey: string | null): Promise<boolean> {
  if (!viewerKey) return false;
  await ensure();
  const existing = await prisma.platform_reviews.findUnique({ where: { viewer_key: viewerKey } }).catch(() => null);
  return !!existing;
}

/** تقييم العضو الحالي (نجومه وملاحظته) — لعرضه وتعبئته عند التعديل. */
export async function getMyPlatformReview(viewerKey: string | null): Promise<{ star: number; note: string | null } | null> {
  if (!viewerKey) return null;
  await ensure();
  const r = await prisma.platform_reviews.findUnique({ where: { viewer_key: viewerKey }, select: { star: true, note: true } }).catch(() => null);
  return r ? { star: r.star, note: r.note ?? null } : null;
}
