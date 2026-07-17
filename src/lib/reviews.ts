import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';
import { loadBanned, censorSync } from './censor';

export async function getSellerRating(userId: number) {
  const rows = await prisma.reviews.findMany({ where: { reciver_id: BigInt(userId) }, select: { star: true } });
  if (!rows.length) return { avg: 0, count: 0 };
  const sum = rows.reduce((a, r) => a + (r.star || 0), 0);
  return { avg: Math.round((sum / rows.length) * 10) / 10, count: rows.length };
}

export async function getUserReviews(userId: number) {
  const rows = await prisma.reviews.findMany({ where: { reciver_id: BigInt(userId) }, orderBy: { id: 'desc' }, take: 50 });
  const senderIds = [...new Set(rows.map((r) => toInt(r.sender_id)))].map((n) => BigInt(n));
  const users = senderIds.length ? await prisma.users.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, userName: true } }) : [];
  const byId = new Map(users.map((u) => [toInt(u.id), u]));
  await loadBanned().catch(() => {}); // دفاع إضافي: تقييمات قديمة سُجّلت قبل تفعيل فحص المحتوى على هذا الحقل
  return rows.map((r) => {
    const u = byId.get(toInt(r.sender_id));
    return { id: toInt(r.id), star: r.star, review: censorSync(r.review), author: u?.name || u?.userName || 'مستخدم', createdAt: r.created_at ? r.created_at.toISOString() : null };
  });
}

export async function canReview(sellerId: number, viewerId?: number) {
  if (!viewerId || viewerId === sellerId) return false;
  const existing = await prisma.reviews.findFirst({ where: { reciver_id: BigInt(sellerId), sender_id: BigInt(viewerId) } });
  return !existing;
}
