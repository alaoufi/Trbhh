import { Search as SearchIcon } from 'lucide-react';
import { searchAds, getCategories, getCountries, getCities } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';

export const metadata = { title: 'البحث' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [categories, countries, cities] = await Promise.all([getCategories(), getCountries(), getCities()]);
  const countryId = sp.country ? Number(sp.country) : undefined;
  const visibleCities = countryId ? cities.filter((c) => c.countryId === countryId) : cities;
  const sort = (sp.sort as 'newest' | 'price_asc' | 'price_desc') || 'newest';

  const ads = await searchAds({
    q: sp.q,
    categoryId: sp.category ? Number(sp.category) : undefined,
    countryId,
    cityId: sp.city ? Number(sp.city) : undefined,
    type: sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined,
    special: sp.special === '1',
    sort,
    take: 60,
  });

  const sel = 'h-10 rounded-lg border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-6">
        <div className="relative md:col-span-2">
          <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="كلمة البحث"
            className="h-10 w-full rounded-lg border bg-background pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
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

      <p className="text-sm text-muted-foreground">النتائج: {ads.length}</p>
      <AdGrid ads={ads} />
    </div>
  );
}
