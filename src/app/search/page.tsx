import { Search as SearchIcon } from 'lucide-react';
import { searchAds, getCategories, getCountries } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';

export const metadata = { title: 'البحث' };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [categories, countries] = await Promise.all([getCategories(), getCountries()]);
  const ads = await searchAds({
    q: sp.q,
    categoryId: sp.category ? Number(sp.category) : undefined,
    countryId: sp.country ? Number(sp.country) : undefined,
    type: sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined,
    take: 48,
  });

  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-5">
        <div className="relative md:col-span-2">
          <SearchIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={sp.q}
            placeholder="كلمة البحث"
            className="h-10 w-full rounded-lg border bg-background pr-10 pl-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select name="category" defaultValue={sp.category} className="h-10 rounded-lg border bg-background px-3 text-sm">
          <option value="">كل الأقسام</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="type" defaultValue={sp.type} className="h-10 rounded-lg border bg-background px-3 text-sm">
          <option value="">عرض وطلب</option>
          <option value="offer">عروض</option>
          <option value="request">طلبات</option>
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
