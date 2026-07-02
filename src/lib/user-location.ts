import 'server-only';
import { prisma } from './prisma';

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS user_area (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      area_id INT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export async function getUserArea(userId: number): Promise<number | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ area_id: number }[]>(
    `SELECT area_id FROM user_area WHERE user_id = ?`, userId,
  ).catch(() => []);
  return rows[0] ? Number(rows[0].area_id) : null;
}

export async function setUserArea(userId: number, areaId: number | null) {
  await ensure();
  if (!areaId) {
    await prisma.$executeRawUnsafe(`DELETE FROM user_area WHERE user_id = ?`, userId).catch(() => {});
    return;
  }
  await prisma.$executeRawUnsafe(
    `INSERT INTO user_area (user_id, area_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE area_id = VALUES(area_id)`,
    userId, areaId,
  ).catch(() => {});
}
