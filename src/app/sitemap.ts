import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE } from '@/lib/constants';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = `https://${SITE.domain}`;
  const [cats, ads] = await Promise.all([
    prisma.categories.findMany({ where: { is_active: 'yes' }, select: { id: true } }),
    prisma.ads.findMany({ where: { status: 1, state: 'active' }, select: { id: true, updated_at: true }, orderBy: { id: 'desc' }, take: 5000 }),
  ]);
  const staticPages = ['', '/categories', '/companies', '/search', '/debates', '/pages/about', '/pages/privacy', '/pages/terms', '/pages/faq'];
  return [
    ...staticPages.map((p) => ({ url: `${base}${p}`, changeFrequency: 'daily' as const, priority: p === '' ? 1 : 0.6 })),
    ...cats.map((c) => ({ url: `${base}/categories/${Number(c.id)}`, changeFrequency: 'daily' as const, priority: 0.7 })),
    ...ads.map((a) => ({ url: `${base}/ads/${Number(a.id)}`, lastModified: a.updated_at ?? undefined, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
