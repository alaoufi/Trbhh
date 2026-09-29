import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/redis';
import { searchSuggestEnabled } from '@/lib/saved-search';
import { getSetting } from '@/lib/settings';
import { DEFAULT_SEARCH_SYNONYMS, expandSearchToken, parseSearchSynonyms } from '@/lib/search-synonyms';

export const dynamic = 'force-dynamic';

/** اقتراحات بحث أثناء الكتابة — عناوين أحدث الإعلانات النشطة المطابقة. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2 || !(await searchSuggestEnabled())) return NextResponse.json({ items: [] });
  const items = await cached(`suggest:${q}`, 60, async () => {
    const synonymsOn = await getSetting('search_synonyms_on', '1').then((value) => value !== '0').catch(() => true);
    const groups = synonymsOn
      ? parseSearchSynonyms(await getSetting('search_synonyms', DEFAULT_SEARCH_SYNONYMS).catch(() => DEFAULT_SEARCH_SYNONYMS))
      : new Map<string, string[]>();
    const terms = Array.from(new Set([
      q,
      ...q.split(/\s+/).filter((term) => term.length >= 2).slice(0, 4).flatMap((term) => expandSearchToken(term, groups)),
    ])).slice(0, 18);
    const rows = await prisma.ads.findMany({
      where: { OR: terms.map((term) => ({ title: { contains: term } })), status: 1, state: 'active', AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }] },
      select: { title: true },
      orderBy: { id: 'desc' },
      take: 30,
    }).catch(() => []);
    // إزالة التكرار مع الحفاظ على الأحدث أولاً
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      const t = (r.title || '').trim();
      if (t && !seen.has(t)) { seen.add(t); out.push(t); }
      if (out.length >= 8) break;
    }
    return out;
  }).catch(() => [] as string[]);
  return NextResponse.json({ items });
}
