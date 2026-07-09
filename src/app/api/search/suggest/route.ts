import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cached } from '@/lib/redis';
import { searchSuggestEnabled } from '@/lib/saved-search';

export const dynamic = 'force-dynamic';

/** اقتراحات بحث أثناء الكتابة — عناوين أحدث الإعلانات النشطة المطابقة. */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 60);
  if (q.length < 2 || !(await searchSuggestEnabled())) return NextResponse.json({ items: [] });
  const items = await cached(`suggest:${q}`, 60, async () => {
    const rows = await prisma.ads.findMany({
      where: { title: { contains: q }, status: 1, state: 'active', store_only: 0 },
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
