import 'server-only';
import { prisma } from './prisma';
import { mediaUrl } from './media';
import { CLASSIFIED_THEMES, type Classified } from './classified-theme';

export { CLASSIFIED_THEMES };
export type { Classified };

let ensured = false;
/** Self-provision the table so the feature works on any DB without migrations. */
export async function ensureClassifiedTable() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS classified_ads (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      user_id BIGINT UNSIGNED NULL,
      title VARCHAR(255) NULL,
      body TEXT NULL,
      image VARCHAR(255) NULL,
      phone VARCHAR(40) NULL,
      whatsapp VARCHAR(40) NULL,
      link VARCHAR(500) NULL,
      theme TINYINT NOT NULL DEFAULT 0,
      status TINYINT NOT NULL DEFAULT 1,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

type Row = {
  id: bigint | number; user_id: bigint | number | null; title: string | null;
  body: string | null; image: string | null; phone: string | null;
  whatsapp: string | null; link: string | null; theme: number; created_at: Date | null;
};

function toClassified(r: Row): Classified {
  return {
    id: Number(r.id),
    userId: r.user_id == null ? null : Number(r.user_id),
    title: r.title,
    text: r.body,
    image: r.image ? mediaUrl(r.image) : null,
    phone: r.phone,
    whatsapp: r.whatsapp,
    link: r.link,
    theme: Number(r.theme) || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

export async function getClassifieds(limit = 30): Promise<Classified[]> {
  await ensureClassifiedTable();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads WHERE status = 1 ORDER BY id DESC LIMIT ${Math.max(1, Math.min(100, limit))}`,
  );
  return rows.map(toClassified);
}

/** One random classified ad for the entry splash. */
export async function getRandomClassified(): Promise<Classified | null> {
  await ensureClassifiedTable();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads WHERE status = 1 ORDER BY RAND() LIMIT 1`,
  );
  return rows.length ? toClassified(rows[0]) : null;
}

export async function createClassified(data: {
  userId: number | null; title: string | null; body: string | null; image: string | null;
  phone: string | null; whatsapp: string | null; link: string | null;
}): Promise<number> {
  await ensureClassifiedTable();
  // random-ish theme for visual variety
  const theme = Math.abs((data.title || data.body || data.image || '').length * 7 + (data.userId || 0)) % CLASSIFIED_THEMES.length;
  await prisma.$executeRawUnsafe(
    `INSERT INTO classified_ads (user_id, title, body, image, phone, whatsapp, link, theme, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    data.userId, data.title, data.body, data.image, data.phone, data.whatsapp, data.link, theme,
  );
  const rows = await prisma.$queryRawUnsafe<{ id: bigint | number }[]>(`SELECT LAST_INSERT_ID() AS id`);
  return Number(rows[0]?.id || 0);
}
