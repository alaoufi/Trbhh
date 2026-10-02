import Link from 'next/link';
import { normalizeCategoryAttributeFilters, normalizeSearchParams, positiveSearchId } from '@/lib/search-filters';
import { getSettingBool } from '@/lib/settings';
import { PublicSearchForm } from '@/components/public-search-form';
import { Bell, Trash2 } from 'lucide-react';
import { searchAds, searchAdsRelaxed, countSearchAds, getCities, getAreas } from '@/lib/data';

import { AdminPager } from '@/components/admin-pager';
import { AdGrid } from '@/components/ad-card';

import { Breadcrumb } from '@/components/breadcrumb';
import { getSession } from '@/lib/auth';
import { listSavedSearches, savedSearchEnabled, searchSuggestEnabled } from '@/lib/saved-search';
import { saveSearchAction, deleteSavedSearchAction } from './actions';
import { ConfirmSubmit } from '@/components/confirm-submit';
import {getCategoryFormConfig} from '@/lib/ad-categories/service';
import {fieldApplies} from '@/lib/ad-categories/validation';
import {selectedHomeCategory} from '@/lib/home-feed';

export const metadata = {
  title: 'بحث متقدم',
  description: 'ابحث بين آلاف إعلانات البيع والشراء من متاجر وأفراد — فلترة بالمنطقة والمدينة والسعر والنوع (عرض/طلب) على منصة تربح.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [cities, areas, session, alertsOn, recoveryOn, priceOn,categoryConfig] = await Promise.all([
    getCities(), getAreas(), getSession(), savedSearchEnabled(), searchSuggestEnabled(),
    getSettingBool('search_price_filter_on', true),
    getCategoryFormConfig(),
  ]);
  const saved = session && alertsOn ? await listSavedSearches(session.uid) : [];
  const sq = normalizeSearchParams(priceOn ? sp : { ...sp, minPrice: undefined, maxPrice: undefined });
  // Accept only Saudi regions and a city belonging to that region.
  const cityId = cities.some((item) => item.countryId === 1 && item.id === sq.cityId) ? sq.cityId : undefined;
  const areaId = cityId && areas.some((item) => item.cityId === cityId && item.id === sq.areaId) ? sq.areaId : undefined;
  const requestedSubcategory=positiveSearchId(sp.subcategory);
  const selectedGroup=selectedHomeCategory(categoryConfig,sp.category);
  const selectedSubcategory=categoryConfig.subcategories.find(item=>item.active&&item.version>0&&requestedSubcategory!==undefined&&(item.sourceSubcategoryIds||[item.id]).includes(requestedSubcategory)&&(selectedGroup?item.groupKey===selectedGroup.key:true));
  const listingType=selectedSubcategory?.listingPolicy?.types.some(item=>item.key===sp.listingType)?sp.listingType:undefined;
  const dependencyValues=Object.fromEntries(Object.entries(sp).filter(([key,value])=>key.startsWith('attr_')&&!key.endsWith('_min')&&!key.endsWith('_max')&&value).map(([key,value])=>[key.slice(5),value!]));
  const visibleFilterFields=(selectedSubcategory?.fields||[]).filter(field=>field.filterable&&fieldApplies(field,{listingType,values:dependencyValues}));
  const attributes=normalizeCategoryAttributeFilters(visibleFilterFields,sp,listingType,dependencyValues);
  const query = { ...sq,categoryId:undefined,categoryIds:undefined,subcategoryId:undefined,subcategoryIds:selectedSubcategory?.sourceSubcategoryIds||selectedGroup?.subcategoryIds||[],listingType,attributeFilters:attributes.filters,searchableFields:(selectedSubcategory?.fields||[]).filter(field=>field.searchable).map(field=>({key:field.key})), cityId, areaId };
  const PAGE_SIZE = 48;
  const total = await countSearchAds(query);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(positiveSearchId(sp.page) || 1, pages);
  const ads = await searchAds({ ...query, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  const hasFilters = !!(query.subcategoryIds.length || query.listingType || query.attributeFilters.length || query.q || cityId || query.type || query.special || query.minPrice !== undefined || query.maxPrice !== undefined);
  const relaxedAds = ads.length === 0 && hasFilters && recoveryOn ? await searchAdsRelaxed(query) : [];
  const params = {
    category:selectedGroup?.key,
    subcategory:selectedSubcategory?.id.toString(),listingType:query.listingType,
    q: query.q, city: cityId?.toString(), area: areaId?.toString(), type: query.type,
    sort: query.sort, special: query.special ? '1' : undefined,
    minPrice: query.minPrice?.toString(), maxPrice: query.maxPrice?.toString(),
    ...attributes.params,
  };
  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'بحث متقدم' }]} />
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <h1 className="mb-3 text-xl font-bold text-foreground">البحث في الإعلانات</h1>
        <PublicSearchForm key={JSON.stringify(params)} regions={cities} areas={areas} params={params} priceOn={priceOn} categoryConfig={categoryConfig} />
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
      {ads.length > 0 ? <AdGrid ads={ads} /> : relaxedAds.length > 0 ? (
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <div>
            <h2 className="font-extrabold text-foreground">نتائج قريبة بعد تخفيف الفلاتر</h2>
            <p className="mt-1 text-sm text-muted-foreground">لم نجد تطابقاً كاملاً، فخففنا المدينة والسعر وبعض شروط الكلمات مع إبقاء المنطقة ونوع الإعلان.</p>
          </div>
          <AdGrid ads={relaxedAds} />
          <Link href="/search" className="inline-block text-sm font-semibold text-primary underline underline-offset-4">تصفح جميع الإعلانات</Link>
        </section>
      ) : <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-semibold">لا توجد إعلانات تطابق بحثك.</p><Link href="/search" className="mt-3 inline-block text-sm text-primary underline">امسح الفلاتر لتصفح جميع الإعلانات</Link></div>}

      {total > 0 && <AdminPager basePath="/search" page={page} pages={pages} total={total} params={params} />}
    </div>
  );
}
