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

/**
 * اهتمامات مُستنتَجة تلقائياً من سلوك التصفّح: الأقسام التي زار فيها العضو
 * (أو الزائر عبر معرّف جهازه) إعلانات أو متاجر أكثر من غيرها — تُستخدم كبديل
 * عندما لا يحدد العضو اهتماماته يدوياً (تعمل للزوّار أيضاً عبر معرّف الزيارة).
 */
export async function getInferredInterests(viewerKey: string, limit = 6): Promise<number[]> {
  await ensure();
  try {
    const rows = await prisma.$queryRaw<{ category_id: number | null; cnt: bigint }[]>`
      SELECT category_id, COUNT(*) AS cnt FROM (
        SELECT a.category_id AS category_id FROM ads_views v
          JOIN ads a ON a.id = v.ads_id
          WHERE v.user_id = ${viewerKey}
        UNION ALL
        SELECT s.category_id AS category_id FROM store_visits sv
          JOIN stores s ON s.id = sv.store_id
          WHERE sv.viewer = ${viewerKey}
      ) t
      WHERE category_id IS NOT NULL
      GROUP BY category_id
      ORDER BY cnt DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => Number(r.category_id)).filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}
