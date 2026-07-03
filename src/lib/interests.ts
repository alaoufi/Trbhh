import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

/** Categories a member marked as "of interest" — pinned to the top of home. */
let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS member_interests (
      user_id BIGINT UNSIGNED NOT NULL,
      category_id INT NOT NULL,
      PRIMARY KEY (user_id, category_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `).catch(() => {});
  ensured = true;
}

export async function getInterests(userId: number): Promise<number[]> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ category_id: number | bigint }[]>(
    `SELECT category_id FROM member_interests WHERE user_id = ?`, userId,
  ).catch(() => []);
  return rows.map((r) => toInt(r.category_id));
}

/** Replace the member's interest set (max 12 categories). */
export async function setInterests(userId: number, categoryIds: number[]) {
  await ensure();
  const ids = [...new Set(categoryIds.filter((n) => Number.isFinite(n) && n > 0))].slice(0, 12);
  await prisma.$executeRawUnsafe(`DELETE FROM member_interests WHERE user_id = ?`, userId).catch(() => {});
  for (const id of ids) {
    await prisma.$executeRawUnsafe(
      `INSERT IGNORE INTO member_interests (user_id, category_id) VALUES (?, ?)`, userId, id,
    ).catch(() => {});
  }
}
