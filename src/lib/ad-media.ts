import 'server-only';
import { prisma } from './prisma';

let ensured = false;
async function ensure() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ad_media (
      ad_id BIGINT UNSIGNED NOT NULL,
      kind VARCHAR(10) NOT NULL,
      path VARCHAR(255) NOT NULL,
      PRIMARY KEY (ad_id, kind)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export async function setAdMedia(adId: number | bigint, kind: 'audio' | 'video', path: string) {
  await ensure();
  await prisma.$executeRawUnsafe(
    `INSERT INTO ad_media (ad_id, kind, path) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE path = VALUES(path)`,
    Number(adId), kind, path,
  );
}

export async function getAdAudio(adId: number | bigint): Promise<string | null> {
  await ensure();
  const rows = await prisma.$queryRawUnsafe<{ path: string }[]>(
    `SELECT path FROM ad_media WHERE ad_id = ? AND kind = 'audio' LIMIT 1`, Number(adId),
  ).catch(() => []);
  return rows[0]?.path ?? null;
}
