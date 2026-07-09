import { notFound } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { getCategory, getAdsByCategory, searchAds, getCities } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCategory(Number(id));
  return { title: cat?.name ?? 'القسم' };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const cat = await getCategory(Number(id));
  if (!cat) notFound();

  const cityId = sp.city ? Number(sp.city) : undefined;
  const type = sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined;
  const sort = (sp.sort as 'newest' | 'price_asc' | 'price_desc') || 'newest';
  const min = sp.min ? Number(sp.min) : 0;
  const max = sp.max ? Number(sp.max) : 0;
  const hasFilters = !!(cityId || type || sort !== 'newest' || min > 0 || max > 0);

  const [cities, base] = await Promise.all([
    getCities(),
    hasFilters ? searchAds({ categoryId: cat.id, cityId, type, sort, take: 96 }) : getAdsByCategory(cat.id, 48),
  ]);
  // فلترة السعر من/إلى بعد الجلب (السعر مخزَّن نصاً أحياناً)
  const ads = base.filter((a) => {
    const p = Number(a.price) || 0;
    if (min > 0 && p < min) return false;
    if (max > 0 && p > max) return false;
    return true;
  });

  const sel = 'h-10 rounded-lg border bg-background px-2 text-sm';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{cat.name}</h1>
        <span className="text-sm text-muted-foreground">{ads.length} إعلان</span>
      </div>

      {/* فلاتر القسم: المدينة، النوع، السعر من/إلى، الترتيب */}
      <form className="card-3d grid grid-cols-2 gap-2 rounded-xl p-3 sm:grid-cols-3 md:grid-cols-6">
        <select name="city" defaultValue={sp.city} className={sel}>
          <option value="">كل المدن</option>
          {cities.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
        </select>
        <select name="type" defaultValue={sp.type} className={sel}>
          <option value="">عرض وطلب</option>
          <option value="offer">عروض</option>
          <option value="request">طلبات</option>
        </select>
        <input name="min" type="number" min={0} defaultValue={sp.min} placeholder="السعر من" className={sel} />
        <input name="max" type="number" min={0} defaultValue={sp.max} placeholder="السعر إلى" className={sel} />
        <select name="sort" defaultValue={sort} className={sel}>
          <option value="newest">الأحدث</option>
          <option value="price_asc">السعر: من الأقل</option>
          <option value="price_desc">السعر: من الأعلى</option>
        </select>
        <button className="btn-3d flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-bold text-white">
          <SlidersHorizontal className="h-4 w-4" /> تصفية
        </button>
      </form>

      {ads.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد إعلانات مطابقة — جرّب تخفيف الفلاتر.</p>}
      <AdGrid ads={ads} />
    </div>
  );
}
