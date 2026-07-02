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
