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

/** هل سبق أن قيّم هذا الزائر/العضو المنصة؟ (viewer_key: u{id} أو g{vid}). */
export async function hasRatedPlatform(viewerKey: string | null): Promise<boolean> {
  if (!viewerKey) return false;
  await ensure();
  const existing = await prisma.platform_reviews.findUnique({ where: { viewer_key: viewerKey } }).catch(() => null);
  return !!existing;
}
