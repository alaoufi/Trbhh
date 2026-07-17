import 'server-only';
import { prisma } from './prisma';
import { toInt } from './utils';

/** Normalize Arabic text so reposts with tiny differences group together. */
function normalizeAr(s: string): string {
  return (s || '')
    .normalize('NFKD')
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[آأإا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export type DupGroup = {
  key: string;
  keepId: number;
  keepTitle: string;
  dups: { id: number; title: string; createdAt: string | null }[];
};

/**
 * Find duplicate ads: same seller + identical normalized (title + detail).
 * The OLDEST ad in each group is kept; the rest are reported as duplicates.
 */
export async function findDuplicateAds(): Promise<{ groups: DupGroup[]; dupCount: number }> {
  const ads = await prisma.ads.findMany({
    select: { id: true, title: true, detail: true, user_id: true, created_at: true },
    orderBy: { id: 'asc' },
  });

  const buckets = new Map<string, typeof ads>();
  for (const a of ads) {
    const key = `${toInt(a.user_id)}|${normalizeAr(a.title)}|${normalizeAr(a.detail)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(a);
    else buckets.set(key, [a]);
  }

  const groups: DupGroup[] = [];
  let dupCount = 0;
  for (const [key, arr] of buckets) {
    if (arr.length < 2) continue;
    // arr is already ascending by id → first is oldest, keep it
    const [keep, ...rest] = arr;
    dupCount += rest.length;
    groups.push({
      key,
      keepId: toInt(keep.id),
      keepTitle: keep.title,
      dups: rest.map((r) => ({ id: toInt(r.id), title: r.title, createdAt: r.created_at ? r.created_at.toISOString() : null })),
    });
  }
  // biggest groups first
  groups.sort((a, b) => b.dups.length - a.dups.length);
  return { groups, dupCount };
}

export type CrossDupGroup = {
  key: string;
  keepId: number;
  keepTitle: string;
  keepUserId: number;
  dups: { id: number; title: string; userId: number; createdAt: string | null }[];
};

/**
 * Find duplicate ads across DIFFERENT sellers (identical normalized title + detail,
 * regardless of owner) — spam networks reposting the same ad under multiple
 * accounts/phone numbers. Same-seller duplicates are covered by findDuplicateAds()
 * already, so groups here are strictly cross-user only. Oldest ad is kept.
 */
export async function findCrossUserDuplicateAds(): Promise<{ groups: CrossDupGroup[]; dupCount: number }> {
  const ads = await prisma.ads.findMany({
    select: { id: true, title: true, detail: true, user_id: true, created_at: true },
    orderBy: { id: 'asc' },
  });

  const buckets = new Map<string, typeof ads>();
  for (const a of ads) {
    const key = `${normalizeAr(a.title)}|${normalizeAr(a.detail)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(a);
    else buckets.set(key, [a]);
  }

  const groups: CrossDupGroup[] = [];
  let dupCount = 0;
  for (const [key, arr] of buckets) {
    if (arr.length < 2) continue;
    if (new Set(arr.map((a) => toInt(a.user_id))).size < 2) continue; // نفس العضو فقط ← تُغطّى بالأداة الأخرى
    const [keep, ...rest] = arr;
    dupCount += rest.length;
    groups.push({
      key,
      keepId: toInt(keep.id),
      keepTitle: keep.title,
      keepUserId: toInt(keep.user_id),
      dups: rest.map((r) => ({ id: toInt(r.id), title: r.title, userId: toInt(r.user_id), createdAt: r.created_at ? r.created_at.toISOString() : null })),
    });
  }
  groups.sort((a, b) => b.dups.length - a.dups.length);
  return { groups, dupCount };
}


/* ===================== صور مستخدمة من أكثر من عضو (سرقة صور محتملة) ===================== */

export type StolenImageGroup = { phash: string; files: { file: string; userId: number; userName: string }[] };

/** مجموعات الصور المتطابقة (phash) المرفوعة من أعضاء مختلفين — مؤشر سرقة صور. */
export async function findCrossUserImages(limit = 20): Promise<StolenImageGroup[]> {
  const { prisma } = await import('./prisma');
  const { toInt } = await import('./utils');
  type Row = { phash: string; uc: unknown };
  const groups = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT phash, COUNT(DISTINCT user_id) uc FROM uploads
     WHERE phash IS NOT NULL AND phash <> '' AND user_id IS NOT NULL
     GROUP BY phash HAVING uc > 1
     ORDER BY uc DESC LIMIT ${Math.max(1, limit)}`,
  ).catch(() => [] as Row[]);
  if (!groups.length) return [];
  const phashes = groups.map((g) => g.phash);
  const rows = await prisma.uploads.findMany({
    where: { phash: { in: phashes } },
    select: { phash: true, file_name: true, user_id: true },
    orderBy: { id: 'desc' },
    take: 200,
  }).catch(() => []);
  const uids = [...new Set(rows.map((r) => r.user_id).filter((u): u is number => !!u))];
  const users = uids.length ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true } }).catch(() => []) : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const byHash = new Map<string, StolenImageGroup>();
  for (const r of rows) {
    if (!r.phash || !r.user_id || !r.file_name) continue;
    let g = byHash.get(r.phash);
    if (!g) { g = { phash: r.phash, files: [] }; byHash.set(r.phash, g); }
    if (g.files.length < 6 && !g.files.some((f) => f.userId === r.user_id)) {
      g.files.push({ file: r.file_name, userId: r.user_id, userName: nameById.get(r.user_id) || `#${r.user_id}` });
    }
  }
  return [...byHash.values()].filter((g) => g.files.length > 1);
}
