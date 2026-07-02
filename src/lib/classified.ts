import 'server-only';
import { prisma } from './prisma';
import { mediaUrl } from './media';
import { loadBanned, censorSync } from './censor';
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
  // idempotent column additions for the smart-designer style options
  for (const col of [
    `ADD COLUMN content_pos VARCHAR(10) NOT NULL DEFAULT 'bottom'`,
    `ADD COLUMN text_align VARCHAR(10) NOT NULL DEFAULT 'right'`,
    `ADD COLUMN font_size VARCHAR(4) NOT NULL DEFAULT 'md'`,
    `ADD COLUMN bold TINYINT NOT NULL DEFAULT 1`,
    `ADD COLUMN pattern VARCHAR(10) NOT NULL DEFAULT 'none'`,
    `ADD COLUMN accent VARCHAR(10) NOT NULL DEFAULT 'none'`,
  ]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE classified_ads ${col}`).catch(() => {});
  }
  ensured = true;
}

type Row = {
  id: bigint | number; user_id: bigint | number | null; title: string | null;
  body: string | null; image: string | null; phone: string | null;
  whatsapp: string | null; link: string | null; theme: number; created_at: Date | null;
  content_pos?: string | null; text_align?: string | null; font_size?: string | null; bold?: number | null;
  pattern?: string | null; accent?: string | null;
};

function toClassified(r: Row): Classified {
  const pos = (r.content_pos as Classified['pos']) || 'bottom';
  const align = (r.text_align as Classified['align']) || 'right';
  const size = (r.font_size as Classified['size']) || 'md';
  const pattern = (r.pattern as Classified['pattern']) || 'none';
  const accent = (r.accent as Classified['accent']) || 'none';
  return {
    id: Number(r.id),
    userId: r.user_id == null ? null : Number(r.user_id),
    title: censorSync(r.title) || null,
    text: censorSync(r.body) || null,
    image: r.image ? mediaUrl(r.image) : null,
    phone: r.phone,
    whatsapp: r.whatsapp,
    link: r.link,
    theme: Number(r.theme) || 0,
    pos: ['top', 'center', 'bottom'].includes(pos) ? pos : 'bottom',
    align: align === 'center' ? 'center' : 'right',
    size: ['sm', 'md', 'lg'].includes(size) ? size : 'md',
    bold: r.bold == null ? true : Number(r.bold) === 1,
    pattern: (['none', 'dots', 'stripes', 'grid', 'rays'].includes(pattern) ? pattern : 'none') as Classified['pattern'],
    accent: (['none', 'bar', 'corner', 'frame'].includes(accent) ? accent : 'none') as Classified['accent'],
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

export async function getClassifieds(limit = 30): Promise<Classified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads WHERE status = 1 ORDER BY id DESC LIMIT ${Math.max(1, Math.min(100, limit))}`,
  );
  return rows.map(toClassified);
}

/** All classifieds for admin moderation. */
export async function getAllClassifieds(limit = 120): Promise<Classified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads ORDER BY id DESC LIMIT ${Math.max(1, Math.min(200, limit))}`,
  );
  return rows.map(toClassified);
}

export async function countClassifieds(): Promise<number> {
  await ensureClassifiedTable();
  const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(`SELECT COUNT(*) AS c FROM classified_ads WHERE status = 1`);
  return Number(rows[0]?.c || 0);
}

export async function deleteClassified(id: number) {
  await ensureClassifiedTable();
  await prisma.$executeRawUnsafe(`DELETE FROM classified_ads WHERE id = ?`, id);
}

/** Random classified ads for the entry splash (cycles through them). */
export async function getSplashClassifieds(limit = 5): Promise<Classified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads WHERE status = 1 ORDER BY RAND() LIMIT ${Math.max(1, Math.min(10, limit))}`,
  );
  return rows.map(toClassified);
}

export async function createClassified(data: {
  userId: number | null; title: string | null; body: string | null; image: string | null;
  phone: string | null; whatsapp: string | null; link: string | null;
  theme?: number; pos?: string; align?: string; size?: string; bold?: boolean; pattern?: string; accent?: string;
}): Promise<number> {
  await ensureClassifiedTable();
  const theme = typeof data.theme === 'number' && data.theme >= 0
    ? data.theme % CLASSIFIED_THEMES.length
    : Math.abs((data.title || data.body || data.image || '').length * 7 + (data.userId || 0)) % CLASSIFIED_THEMES.length;
  const pos = ['top', 'center', 'bottom'].includes(data.pos || '') ? data.pos : 'bottom';
  const align = data.align === 'center' ? 'center' : 'right';
  const size = ['sm', 'md', 'lg'].includes(data.size || '') ? data.size : 'md';
  const bold = data.bold === false ? 0 : 1;
  const pattern = ['none', 'dots', 'stripes', 'grid', 'rays'].includes(data.pattern || '') ? data.pattern : 'none';
  const accent = ['none', 'bar', 'corner', 'frame'].includes(data.accent || '') ? data.accent : 'none';
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO classified_ads (user_id, title, body, image, phone, whatsapp, link, theme, content_pos, text_align, font_size, bold, pattern, accent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      data.userId, data.title, data.body, data.image, data.phone, data.whatsapp, data.link, theme, pos, align, size, bold, pattern, accent,
    );
  } catch {
    // fallback: guarantee the ad persists even if the style columns are unavailable
    await prisma.$executeRawUnsafe(
      `INSERT INTO classified_ads (user_id, title, body, image, phone, whatsapp, link, theme, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      data.userId, data.title, data.body, data.image, data.phone, data.whatsapp, data.link, theme,
    );
  }
  const rows = await prisma.$queryRawUnsafe<{ id: bigint | number }[]>(`SELECT LAST_INSERT_ID() AS id`);
  return Number(rows[0]?.id || 0);
}
