import { notFound, redirect } from 'next/navigation';
import { SlidersHorizontal } from 'lucide-react';
import { getCategory, searchAds, countSearchAds, getCities } from '@/lib/data';
import { AdGrid } from '@/components/ad-card';
import { AdminPager } from '@/components/admin-pager';
import { SITE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCategory(Number(id));
  if (!cat) return { title: 'القسم' };
  const title = `إعلانات ${cat.name} — بيع وشراء`;
  const description = `تصفّح أحدث إعلانات ${cat.name}: عروض وطلبات بيع وشراء من شركات وأفراد على منصة ${SITE.name}. أضف إعلانك مجاناً ليصل لعملاء مهتمين بـ${cat.name}.`;
  const url = `https://${SITE.domain}/categories/${id}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: 'website', locale: 'ar_SA', title, description, url },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  // الأقسام مخفية من التحكم — الصفحة تعود للرئيسية
  if (!(await import('@/lib/settings').then((x) => x.categoriesEnabled()).catch(() => true))) redirect('/');
  const { id } = await params;
  const sp = await searchParams;
  const cat = await getCategory(Number(id));
  if (!cat) notFound();

  const cityId = sp.city ? Number(sp.city) : undefined;
  const type = sp.type === 'offer' || sp.type === 'request' ? sp.type : undefined;
  const sort = (sp.sort as 'newest' | 'price_asc' | 'price_desc') || 'newest';
  const min = sp.min ? Number(sp.min) : 0;
  const max = sp.max ? Number(sp.max) : 0;
  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const PAGE_SIZE = 48;

  const [cities, base, total] = await Promise.all([
    getCities(),
    searchAds({ categoryId: cat.id, cityId, type, sort, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    countSearchAds({ categoryId: cat.id, cityId, type }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
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
        <span className="text-sm text-muted-foreground">{total} إعلان</span>
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

      <AdminPager basePath={`/categories/${cat.id}`} page={page} pages={pages} total={total} params={{ city: sp.city, type: sp.type, sort: sp.sort, min: sp.min, max: sp.max }} />
    </div>
  );
}
