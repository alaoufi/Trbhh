import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { primaryOrigin } from '@/lib/public-origin';

// Rendered on demand so the build never needs a live database.
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = primaryOrigin;
  const [dealsOn, auctionsOn] = await Promise.all([
    import('@/lib/store-extras').then((m) => m.dealsEnabled()).catch(() => false),
    import('@/lib/settings').then((m) => m.auctionsEnabled()).catch(() => false),
  ]);
  const staticPages = [
    '', '/companies', '/search', '/classified', '/nearby', '/site-map',
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
    const [ads, stores] = await Promise.all([
      // كل الإعلانات النشطة تقريباً — سقف 45000 وقائي فقط لبقاء الملف ضمن حد بروتوكول
      // خرائط الموقع (50000 رابط)؛ عند الاقتراب من هذا العدد يلزم تقسيم الملف لعدة ملفات.
      prisma.ads.findMany({ where: { status: 1, state: 'active', AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date() } }] }] }, select: { id: true, updated_at: true }, orderBy: { id: 'desc' }, take: 45000 }),
      prisma.stores.findMany({ where: { status: 1 }, select: { id: true, updated_at: true } }),
    ]);
    for (const a of ads) entries.push({ url: `${base}/ads/${Number(a.id)}`, lastModified: a.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.5 });
    for (const s of stores) entries.push({ url: `${base}/companies/${Number(s.id)}`, lastModified: s.updated_at ?? undefined, changeFrequency: 'weekly', priority: 0.7 });

    // منتجات المتاجر — كل منتج نشره تاجر داخل واجهة متجره المستقلة (/companies/{id}/p/{adId}).
    // صفحة المنتج تظهر للعموم فقط إن كان اشتراك المتجر سارياً (أو ضمن المهلة) — نفس قاعدة
    // الصفحة نفسها (store-product-access). كانت الخريطة تُدرج منتجات متاجر موقوفة فتقود
    // محركات البحث إلى صفحات «غير موجود».
    const [{ publicStoreWhere }, { getStoreSubPricing }] = await Promise.all([import('@/lib/store-subscription-access'), import('@/lib/settings')]);
    const publicStores = await prisma.stores.findMany({ where: publicStoreWhere(await getStoreSubPricing()), select: { id: true } });
    const storeIds = publicStores.map((s) => Number(s.id));
    if (storeIds.length) {
      const products = await prisma.store_products.findMany({ where: { store_id: { in: storeIds } }, select: { store_id: true, ad_id: true } });
      if (products.length) {
        const productAdIds = [...new Set(products.map((p) => p.ad_id))];
        const now = new Date();
        const productAds = await prisma.ads.findMany({
          where: { id: { in: productAdIds.map((n) => BigInt(n)) }, status: 1, state: 'active', paused_by_owner: 0,
            AND: [{ OR: [{ data_archive: null }, { data_archive: '' }] }, { OR: [{ publish_at: null }, { publish_at: { lte: now } }] }] },
          select: { id: true, updated_at: true },
        });
        const adInfo = new Map(productAds.map((a) => [Number(a.id), a.updated_at]));
        for (const p of products) {
          if (!adInfo.has(p.ad_id)) continue; // منتج غير منشور/محذوف
          entries.push({ url: `${base}/companies/${p.store_id}/p/${p.ad_id}`, lastModified: adInfo.get(p.ad_id) ?? undefined, changeFrequency: 'weekly', priority: 0.6 });
        }
      }
    }
  } catch {
    // DB unavailable (e.g. at build time) — return the static entries only.
  }
  return entries;
}
