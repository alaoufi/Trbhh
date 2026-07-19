import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE } from '@/lib/constants';

// Rendered on demand so the build never needs a live database.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${SITE.domain}`;
  const [debatesOn, dealsOn, auctionsOn] = await Promise.all([
    import('@/lib/settings').then((m) => m.debatesEnabled()).catch(() => true),
    import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false),
    import('@/lib/settings').then((m) => m.auctionsEnabled()).catch(() => false),
  ]);
  const staticPages = [
    '', '/categories', '/companies', '/search', '/classified', '/nearby',
    ...(debatesOn ? ['/debates'] : []),
    ...(dealsOn ? ['/deals'] : []),
    ...(auctionsOn ? ['/auctions'] : []),
    '/pages/about', '/pages/contact', '/pages/privacy', '/pages/terms', '/pages/faq',
  ];
  const entries: MetadataRoute.Sitemap = staticPages.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: 'daily' as const,
    priority: p === '' ? 1 : 0.6,
  }));

  try {
    const [cats, ads, stores] = await Promise.all([
      prisma.categories.findMany({ where: { is_active: 'yes' }, select: { id: true } }),
      prisma.ads.findMany({ where: { status: 1, state: 'active', AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }] }, select: { id: true, updated_at: true }, orderBy: { id: 'desc' }, take: 5000 }),
      prisma.stores.findMany({ where: { status: 1 }, select: { id: true, updated_at: true } }),
    ]);
    for (const c of cats) entries.push({ url: `${base}/categories/${Number(c.id)}`, changeFrequency: 'daily', priority: 0.7 });
    for (const a of ads) entries.push({ url: `${base}/ads/${Number(a.id)}`, lastModified: a.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.5 });
    for (const s of stores) entries.push({ url: `${base}/companies/${Number(s.id)}`, lastModified: s.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.7 });
  } catch {
    // DB unavailable (e.g. at build time) — return the static entries only.
  }
  return entries;
}
