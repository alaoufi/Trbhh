import { Bell, Trash2 } from 'lucide-react';
import { searchAds, countSearchAds, getCategories, getCountries, getCities } from '@/lib/data';
import { AdminPager } from '@/components/admin-pager';
import { AdGrid } from '@/components/ad-card';
import { SearchSuggestInput } from '@/components/search-suggest';
import { getSession } from '@/lib/auth';
import { listSavedSearches, savedSearchEnabled } from '@/lib/saved-search';
import { saveSearchAction, deleteSavedSearchAction } from './actions';

export const metadata = { title: 'البحث' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [categories, countries, cities, session, alertsOn] = await Promise.all([
    getCategories(), getCountries(), getCities(), getSession(), savedSearchEnabled(),
  ]);
  const saved = session && alertsOn ? await listSavedSearches(session.uid) : [];
  const countryId = sp.country ? Number(sp.country) : undefined;
  const visibleCities = countryId ? cities.filter((c) => c.countryId === countryId) : cities;
  const sort = (sp.sort as 'newest' | 'price_asc' | 'price_desc') || 'newest';

  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const PAGE_SIZE = 48;
  const sq = {
    q: sp.q,
    categoryId: sp.category ? Number(sp.category) : undefined,
    countryId,
    cityId: sp.city ? Number(sp.city) : undefined,
    type: sp.type === 'offer' || sp.type === 'request' ? (sp.type as 'offer' | 'request') : undefined,
    special: sp.special === '1',
  };
  const [ads, total] = await Promise.all([
    searchAds({ ...sq, sort, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    countSearchAds(sq),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sel = 'h-10 rounded-lg border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <form className="grid gap-3 card-3d rounded-xl p-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <SearchSuggestInput name="q" defaultValue={sp.q || ''} />
        </div>
        <select name="category" defaultValue={sp.category} className={sel}>
          <option value="">كل الأقسام</option>
          {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select name="country" defaultValue={sp.country} className={sel}>
          <option value="">كل الدول</option>
          {countries.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select name="city" defaultValue={sp.city} className={sel}>
          <option value="">كل المدن</option>
          {visibleCities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select name="type" defaultValue={sp.type} className={sel}>
          <option value="">عرض وطلب</option>
          <option value="offer">عروض</option>
          <option value="request">طلبات</option>
        </select>
        <select name="sort" defaultValue={sort} className={sel}>
          <option value="newest">الأحدث</option>
          <option value="price_asc">السعر: من الأقل</option>
          <option value="price_desc">السعر: من الأعلى</option>
        </select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          بحث
        </button>
      </form>

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
                  <button aria-label="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button>
                </form>
              </span>
            ))}
          </div>
          {saved.length === 0 && !sp.q && <p className="text-[11px] text-muted-foreground">ابحث عن شيء ثم اضغط «نبّهني» ليصلك إشعار عند نشر إعلان مطابق.</p>}
        </div>
      )}

      <p className="text-sm text-muted-foreground">النتائج: {total}</p>
      <AdGrid ads={ads} />

      <AdminPager basePath="/search" page={page} pages={pages} total={total} params={{ q: sp.q, category: sp.category, country: sp.country, city: sp.city, type: sp.type, sort: sp.sort, special: sp.special }} />
    </div>
  );
}
