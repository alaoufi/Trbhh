import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE } from '@/lib/constants';

// Rendered on demand so the build never needs a live database.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${SITE.domain}`;
  const staticPages = ['', '/categories', '/companies', '/search', '/debates', '/pages/about', '/pages/privacy', '/pages/terms', '/pages/faq'];
  const entries: MetadataRoute.Sitemap = staticPages.map((p) => ({
    url: `${base}${p}`,
    changeFrequency: 'daily' as const,
    priority: p === '' ? 1 : 0.6,
  }));

  try {
    const [cats, ads] = await Promise.all([
      prisma.categories.findMany({ where: { is_active: 'yes' }, select: { id: true } }),
      prisma.ads.findMany({ where: { status: 1, state: 'active', store_only: 0 }, select: { id: true, updated_at: true }, orderBy: { id: 'desc' }, take: 5000 }),
    ]);
    for (const c of cats) entries.push({ url: `${base}/categories/${Number(c.id)}`, changeFrequency: 'daily', priority: 0.7 });
    for (const a of ads) entries.push({ url: `${base}/ads/${Number(a.id)}`, lastModified: a.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.5 });
  } catch {
    // DB unavailable (e.g. at build time) — return the static entries only.
  }
  return entries;
}
