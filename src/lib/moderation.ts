import 'server-only';
import { prisma } from './prisma';

/** Max duplicate attempts before the account is banned. */
export const DUP_LIMIT = 3;

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS dup_attempts (
      user_id BIGINT UNSIGNED NOT NULL,
      count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

/** Increment a user's duplicate-attempt counter and return the new total. */
export async function bumpDupAttempts(userId: number): Promise<number> {
  await ensureTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO dup_attempts (user_id, count) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1, updated_at = CURRENT_TIMESTAMP`,
    userId,
  );
  const rows = await prisma.$queryRawUnsafe<{ count: number }[]>(
    `SELECT count FROM dup_attempts WHERE user_id = ?`, userId,
  );
  return Number(rows[0]?.count || 0);
}

export async function resetDupAttempts(userId: number) {
  await ensureTable();
  await prisma.$executeRawUnsafe(`DELETE FROM dup_attempts WHERE user_id = ?`, userId).catch(() => {});
}

/** Ban a user's account. */
export async function banUser(userId: number) {
  await prisma.users.update({ where: { id: BigInt(userId) }, data: { ban: 'checked' } }).catch(() => {});
}
