import 'server-only';
import { prisma } from './prisma';
import { ensureSchema } from '@/data/schema-sync';
import type { Prisma } from '@prisma/client';
import { mediaUrl } from './media';
import { loadBanned, censorSync } from './censor';
import { getClassifiedLifetimeDays } from './settings';
import { CLASSIFIED_THEMES, type Classified } from './classified-theme';

export { CLASSIFIED_THEMES };
export type { Classified };

/** DDL lives in src/data/schema-sync.ts (single source of truth). */
export const ensureClassifiedTable = ensureSchema;

type Row = {
  id: bigint | number; user_id: bigint | number | null; title: string | null;
  body: string | null; image: string | null; phone: string | null;
  whatsapp: string | null; link: string | null; theme: number; created_at: Date | null;
  content_pos?: string | null; text_align?: string | null; font_size?: string | null; bold?: number | null;
  pattern?: string | null; accent?: string | null; views?: number | null; clicks?: number | null; layout?: string | null;
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
    layout: r.layout === 'manual' ? 'manual' : 'auto',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    views: Number(r.views) || 0,
    clicks: Number(r.clicks) || 0,
  };
}

/**
 * Visibility filter: enabled (status=1) AND not expired.
 * Per-ad `expires_at` (set by the admin) OVERRIDES the global lifetime setting;
 * ads without it follow the global window (unlimited when the setting is 0).
 */
async function visibilityWhere(): Promise<Prisma.classified_adsWhereInput> {
  const days = await getClassifiedLifetimeDays().catch(() => 0);
  const now = new Date();
  const followsGlobal: Prisma.classified_adsWhereInput = days > 0
    ? { expires_at: null, OR: [{ created_at: null }, { created_at: { gte: new Date(now.getTime() - Math.floor(days) * 86_400_000) } }] }
    : { expires_at: null };
  return { status: 1, OR: [followsGlobal, { expires_at: { gt: now } }] };
}

export async function getClassifieds(limit = 30): Promise<Classified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.classified_ads.findMany({
    where: await visibilityWhere(), orderBy: { id: 'desc' }, take: Math.max(1, Math.min(100, limit)),
  });
  return rows.map(toClassified);
}

/** Classified + moderation state, for the admin manager. */
export type AdminClassified = Classified & { status: number; expiresAt: string | null };

/** All classifieds for admin moderation (including disabled/expired ones). */
export async function getAllClassifieds(limit = 120): Promise<AdminClassified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.classified_ads.findMany({ orderBy: { id: 'desc' }, take: Math.max(1, Math.min(200, limit)) });
  return rows.map((r) => ({ ...toClassified(r), status: r.status, expiresAt: r.expires_at ? r.expires_at.toISOString() : null }));
}

/** Admin: enable/disable a classified ad (hidden everywhere while disabled). */
export async function setClassifiedStatus(id: number, enabled: boolean) {
  await ensureClassifiedTable();
  await prisma.classified_ads.updateMany({ where: { id: BigInt(id) }, data: { status: enabled ? 1 : 0 } }).catch(() => {});
}

/**
 * Admin: set how long a classified stays live, in days from NOW.
 * days > 0 → explicit expiry (overrides the global setting); 0 → back to the global default.
 */
export async function setClassifiedLifetime(id: number, days: number) {
  await ensureClassifiedTable();
  const expires_at = days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000) : null;
  await prisma.classified_ads.updateMany({ where: { id: BigInt(id) }, data: { expires_at } }).catch(() => {});
}

/** A member's own classified ads (for editing/deleting). */
export type MyClassified = Classified & { expiresAt: string | null };
export async function getMyClassifieds(userId: number): Promise<MyClassified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT * FROM classified_ads WHERE user_id = ? ORDER BY id DESC LIMIT 100`, userId,
  ).catch(() => []);
  return rows.map((r) => {
    const ex = (r as Row & { expires_at?: Date | string | null }).expires_at;
    const iso = ex ? new Date(ex).toISOString() : null;
    return { ...toClassified(r), expiresAt: iso && !isNaN(Date.parse(iso)) ? iso : null };
  });
}

/** Re-activate/renew a classified for a fresh period (owner-owned only). */
export async function reactivateClassified(id: number, userId: number, days: number): Promise<boolean> {
  await ensureClassifiedTable();
  const own = await prisma.classified_ads.findFirst({ where: { id: BigInt(id), user_id: BigInt(userId) }, select: { id: true } }).catch(() => null);
  if (!own) return false;
  const expires_at = days > 0 ? new Date(Date.now() + Math.min(days, 3650) * 86_400_000) : null;
  await prisma.classified_ads.updateMany({ where: { id: BigInt(id) }, data: { expires_at, status: 1 } }).catch(() => {});
  return true;
}

/** هل المبوّب ظاهر للعامة الآن؟ نفس منطق قائمة المبوّبة تماماً (status + انتهاء/عمر)
 *  — مصدر واحد للحقيقة، فلا تختلف صفحة الإعلان عن ظهوره في القائمة (يمنع 404 لزاحف
 *  المشاركة على إعلان لا يزال ظاهراً، فتظهر صورته في معاينة الرابط). */
export async function classifiedPublicVisible(id: number): Promise<boolean> {
  await ensureClassifiedTable();
  const row = await prisma.classified_ads
    .findFirst({ where: { id: BigInt(id), ...(await visibilityWhere()) }, select: { id: true } })
    .catch(() => null);
  return !!row;
}

/** حالة المبوّب (1 ظاهر · 0 موقوف) ومالكه — لأزرار الإجراءات (المالك/الإدارة). */
export async function getClassifiedOwnerState(id: number): Promise<{ status: number; userId: number | null } | null> {
  await ensureClassifiedTable();
  const r = await prisma.classified_ads.findFirst({ where: { id: BigInt(id) }, select: { status: true, user_id: true } }).catch(() => null);
  return r ? { status: r.status, userId: r.user_id == null ? null : Number(r.user_id) } : null;
}

export async function getClassifiedById(id: number): Promise<Classified | null> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.$queryRawUnsafe<Row[]>(`SELECT * FROM classified_ads WHERE id = ?`, id).catch(() => []);
  return rows[0] ? toClassified(rows[0]) : null;
}

/** Update a classified ad's content/style (image optional — keep existing when null). */
export async function updateClassified(id: number, data: {
  title: string | null; body: string | null; image?: string | null;
  phone: string | null; whatsapp: string | null; link: string | null;
  theme?: number; pos?: string; align?: string; size?: string; bold?: boolean; pattern?: string; accent?: string; layout?: string;
}) {
  await ensureClassifiedTable();
  const theme = typeof data.theme === 'number' && data.theme >= 0 ? data.theme % CLASSIFIED_THEMES.length : 0;
  const pos = ['top', 'center', 'bottom'].includes(data.pos || '') ? data.pos : 'bottom';
  const align = data.align === 'center' ? 'center' : 'right';
  const size = ['sm', 'md', 'lg'].includes(data.size || '') ? data.size : 'md';
  const bold = data.bold === false ? 0 : 1;
  const pattern = ['none', 'dots', 'stripes', 'grid', 'rays'].includes(data.pattern || '') ? data.pattern : 'none';
  const accent = ['none', 'bar', 'corner', 'frame'].includes(data.accent || '') ? data.accent : 'none';
  const layout = data.layout === 'manual' ? 'manual' : 'auto';
  const setImage = data.image !== undefined && data.image !== null;
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE classified_ads SET title=?, body=?, phone=?, whatsapp=?, link=?, theme=?, content_pos=?, text_align=?, font_size=?, bold=?, pattern=?, accent=?, layout=?${setImage ? ', image=?' : ''} WHERE id=?`,
      ...(setImage
        ? [data.title, data.body, data.phone, data.whatsapp, data.link, theme, pos, align, size, bold, pattern, accent, layout, data.image, id]
        : [data.title, data.body, data.phone, data.whatsapp, data.link, theme, pos, align, size, bold, pattern, accent, layout, id]),
    );
  } catch {
    await prisma.$executeRawUnsafe(
      `UPDATE classified_ads SET title=?, body=?, phone=?, whatsapp=?, link=?, theme=?${setImage ? ', image=?' : ''} WHERE id=?`,
      ...(setImage
        ? [data.title, data.body, data.phone, data.whatsapp, data.link, theme, data.image, id]
        : [data.title, data.body, data.phone, data.whatsapp, data.link, theme, id]),
    );
  }
}

export async function countClassifieds(): Promise<number> {
  await ensureClassifiedTable();
  const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(`SELECT COUNT(*) AS c FROM classified_ads WHERE status = 1`);
  return Number(rows[0]?.c || 0);
}

/** Count a unique view for a classified ad (deduped per viewer). */
export async function recordClassifiedView(id: number, viewer: string) {
  await ensureClassifiedTable();
  try {
    await prisma.$executeRawUnsafe(`INSERT INTO classified_views (ad_id, viewer) VALUES (?, ?)`, id, viewer);
    await prisma.$executeRawUnsafe(`UPDATE classified_ads SET views = views + 1 WHERE id = ?`, id);
  } catch {
    // duplicate (ad_id, viewer) → already counted; ignore
  }
}

/** Count a click-through on a classified ad's link. */
export async function recordClassifiedClick(id: number) {
  await ensureClassifiedTable();
  await prisma.$executeRawUnsafe(`UPDATE classified_ads SET clicks = clicks + 1 WHERE id = ?`, id).catch(() => {});
}

export async function deleteClassified(id: number) {
  await ensureClassifiedTable();
  await prisma.classified_views.deleteMany({ where: { ad_id: BigInt(id) } }).catch(() => {});
  await prisma.classified_ads.deleteMany({ where: { id: BigInt(id) } });
}

/** Newest classified ads for the entry splash grid (newest first). */
export async function getSplashClassifieds(limit = 12): Promise<Classified[]> {
  await ensureClassifiedTable();
  await loadBanned();
  const rows = await prisma.classified_ads.findMany({
    where: await visibilityWhere(), orderBy: { id: 'desc' }, take: Math.max(1, Math.min(24, limit)),
  });
  return rows.map(toClassified);
}

export async function createClassified(data: {
  userId: number | null; title: string | null; body: string | null; image: string | null;
  phone: string | null; whatsapp: string | null; link: string | null;
  theme?: number; pos?: string; align?: string; size?: string; bold?: boolean; pattern?: string; accent?: string; layout?: string;
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
  const layout = data.layout === 'manual' ? 'manual' : 'auto';
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO classified_ads (user_id, title, body, image, phone, whatsapp, link, theme, content_pos, text_align, font_size, bold, pattern, accent, layout, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      data.userId, data.title, data.body, data.image, data.phone, data.whatsapp, data.link, theme, pos, align, size, bold, pattern, accent, layout,
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
