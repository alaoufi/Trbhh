import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import { toInt } from './utils';

/** Categories a member marked as "of interest" — pinned to the top of home. */
const ensure = ensureSchema;

export async function getInterests(userId: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.member_interests.findMany({ where: { user_id: BigInt(userId) }, select: { category_id: true } }).catch(() => []);
  return rows.map((r) => r.category_id);
}

/** Replace the member's interest set (max 12 categories). */
export async function setInterests(userId: number, categoryIds: number[]) {
  await ensure();
  const ids = [...new Set(categoryIds.filter((n) => Number.isFinite(n) && n > 0))].slice(0, 12);
  await prisma.member_interests.deleteMany({ where: { user_id: BigInt(userId) } }).catch(() => {});
  if (ids.length) {
    await prisma.member_interests.createMany({
      data: ids.map((id) => ({ user_id: BigInt(userId), category_id: id })),
      skipDuplicates: true,
    }).catch(() => {});
  }
}
