import Link from 'next/link';
import { normalizeSearchParams, positiveSearchId, singleSearchParams, type SearchQueryInput } from '@/lib/search-filters';
import { getSettingBool } from '@/lib/settings';
import { PublicSearchForm } from '@/components/public-search-form';
import { Bell, Trash2 } from 'lucide-react';
import { searchAds, countSearchAds, getCities, getAreas } from '@/lib/data';

import { AdminPager } from '@/components/admin-pager';
import { AdGrid } from '@/components/ad-card';

import { Breadcrumb } from '@/components/breadcrumb';
import { getSession } from '@/lib/auth';
import { listSavedSearches, savedSearchEnabled } from '@/lib/saved-search';
import { saveSearchAction, deleteSavedSearchAction } from './actions';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { isPreviewSandbox } from '@/lib/preview-sandbox';
import { normalizeSandboxCategory, sandboxCatalogOptions } from '@/lib/sandbox-catalog';

export const metadata = {
  title: 'بحث متقدم',
  description: 'ابحث بين آلاف إعلانات البيع والشراء من متاجر وأفراد — فلترة بالمنطقة والمدينة والسعر والنوع (عرض/طلب) على منصة تربح.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<SearchQueryInput>;
}) {
  const sp = singleSearchParams(await searchParams);
  const sandbox = isPreviewSandbox();
  const [cities, areas, session, alertsOn] = await Promise.all([
    getCities(), getAreas(), getSession(), savedSearchEnabled(),
  ]);
  const saved = session && alertsOn ? await listSavedSearches(session.uid) : [];
  const priceOn = await getSettingBool('search_price_filter_on', true);
  const sq = normalizeSearchParams(priceOn ? sp : { ...sp, minPrice: undefined, maxPrice: undefined });
  // Accept only Saudi regions and a city belonging to that region.
  const cityId = cities.some((item) => item.countryId === 1 && item.id === sq.cityId) ? sq.cityId : undefined;
  const areaId = cityId && areas.some((item) => item.cityId === cityId && item.id === sq.areaId) ? sq.areaId : undefined;
  const classification = sandbox ? normalizeSandboxCategory(sp) : {};
  const query = { ...sq, cityId, areaId, ...classification };
  const PAGE_SIZE = 48;
  const total = await countSearchAds(query);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(positiveSearchId(sp.page) || 1, pages);
  const ads = await searchAds({ ...query, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  const params = {
    ...classification,
    q: query.q, city: cityId?.toString(), area: areaId?.toString(), type: query.type,
    sort: query.sort, special: query.special ? '1' : undefined,
    minPrice: query.minPrice?.toString(), maxPrice: query.maxPrice?.toString(),
  };
  const hasFilters = !!(query.category || query.q || cityId || query.type || query.special || query.minPrice !== undefined || query.maxPrice !== undefined);
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'بحث متقدم' }]} />
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h1 className="mb-3 text-xl font-bold text-foreground">البحث في الإعلانات</h1>
        <PublicSearchForm key={JSON.stringify(params)} regions={cities} areas={areas} params={params} priceOn={priceOn} categories={sandbox ? sandboxCatalogOptions : undefined} />
        {sandbox && <p className="mt-3 text-xs text-muted-foreground">الإعلانات القديمة ذات التصنيف غير المطابق تظهر ضمن أخرى / أخرى؛ إعادة تصنيفها مؤجلة. قد تكون بعض الأقسام فارغة.</p>}
        {hasFilters && <Link href="/search" className="mt-3 inline-block text-sm font-semibold text-primary underline underline-offset-4">مسح الفلاتر</Link>}
      </section>
      {/* تنبيهات البحث المحفوظ — للأعضاء وعند تفعيلها من الإدارة */}
      {session && alertsOn && (
        <div className="card-3d space-y-2 rounded-xl p-3">
          {sp.saved === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-xs font-bold text-emerald-800">✓ حُفظ البحث — سيصلك تنبيه عند نشر إعلان مطابق.</div>}
          {sp.saved === 'full' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs font-bold text-amber-900">وصلت للحد الأقصى (١٠ بحوث) — احذف بحثاً قديماً أولاً.</div>}
          <div className="flex flex-wrap items-center gap-2">
            {sp.q && sp.q.trim().length >= 2 && (
              <form action={saveSearchAction}>
                <input type="hidden" name="q" value={sp.q} />
                <button className="btn-3d inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white">
                  <Bell className="h-3.5 w-3.5" /> نبّهني عند نشر إعلان يطابق «{sp.q}»
                </button>
              </form>
            )}
            {saved.map((s0) => (
              <span key={s0.id} className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary">
                🔔 {s0.query}
                <form action={deleteSavedSearchAction}>
                  <input type="hidden" name="id" value={s0.id} />
                  <input type="hidden" name="q" value={sp.q || ''} />
                  <ConfirmSubmit msg={`إلغاء تنبيه البحث «${s0.query}»؟`} title="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></ConfirmSubmit>
                </form>
              </span>
            ))}
          </div>
          {saved.length === 0 && !sp.q && <p className="text-[11px] text-muted-foreground">ابحث عن شيء ثم اضغط «نبّهني» ليصلك إشعار عند نشر إعلان مطابق.</p>}
        </div>
      )}

      <p className="text-sm text-muted-foreground">النتائج: {total}</p>
      {ads.length > 0 ? <AdGrid ads={ads} /> : <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-semibold">لا توجد إعلانات تطابق بحثك.</p><Link href="/search" className="mt-3 inline-block text-sm text-primary underline">امسح الفلاتر لتصفح جميع الإعلانات</Link></div>}

      <AdminPager basePath="/search" page={page} pages={pages} total={total} params={params} />
    </div>
  );
}
