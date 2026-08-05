import Link from 'next/link';
import { Bell, Trash2 } from 'lucide-react';
import { searchAds, countSearchAds, getCities, getAreas } from '@/lib/data';
import { SearchAreaPicker } from '@/components/search-area-picker';
import { AdminPager } from '@/components/admin-pager';
import { AdGrid } from '@/components/ad-card';
import { SearchSuggestInput } from '@/components/search-suggest';
import { SmartSearch } from '@/components/smart-search';
import { Breadcrumb } from '@/components/breadcrumb';
import { getSession } from '@/lib/auth';
import { listSavedSearches, savedSearchEnabled } from '@/lib/saved-search';
import { saveSearchAction, deleteSavedSearchAction } from './actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const metadata = {
  title: 'بحث متقدم',
  description: 'ابحث بين آلاف إعلانات البيع والشراء من متاجر وأفراد — فلترة بالقسم والمدينة والسعر والنوع (عرض/طلب) على عقار تربح.',
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [cities, areas, session, alertsOn] = await Promise.all([
    getCities(), getAreas(), getSession(), savedSearchEnabled(),
  ]);
  const saved = session && alertsOn ? await listSavedSearches(session.uid) : [];
  const sort = (sp.sort as 'newest' | 'price_asc' | 'price_desc') || 'newest';

  const page = Math.max(1, parseInt(sp.page || '1') || 1);
  const PAGE_SIZE = 48;
  const sq = {
    q: sp.q,
    categoryId: sp.category ? Number(sp.category) : undefined,
    cityId: sp.city ? Number(sp.city) : undefined,
    areaId: sp.area ? Number(sp.area) : undefined,
    type: sp.type === 'offer' || sp.type === 'request' ? (sp.type as 'offer' | 'request') : undefined,
    special: sp.special === '1',
    // فلاتر عقارية (من البحث الذكي أو الرابط)
    reType: sp.reType || undefined,
    purpose: sp.purpose === 'rent' || sp.purpose === 'sale' ? (sp.purpose as 'rent' | 'sale') : undefined,
    priceMin: sp.priceMin ? Number(sp.priceMin) : undefined,
    priceMax: sp.priceMax ? Number(sp.priceMax) : undefined,
    beds: sp.beds ? Number(sp.beds) : undefined,
    areaMin: sp.areaMin ? Number(sp.areaMin) : undefined,
  };
  const [ads, total] = await Promise.all([
    searchAds({ ...sq, sort, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
    countSearchAds(sq),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const sel = 'h-10 rounded-lg border bg-background px-3 text-sm';

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: 'بحث متقدم' }]} />

      {/* البحث الذكي بالكلام الطبيعي */}
      <SmartSearch />

      {/* ملخّص الفلاتر المستخرجة من البحث الذكي (لتوضيح ما فُهم من الجملة) */}
      {(sq.reType || sq.purpose || sq.priceMin || sq.priceMax || sq.beds || sq.areaMin) && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-bold text-muted-foreground">الفلاتر المطبّقة:</span>
          {sq.reType && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">🏢 {sq.reType}</span>}
          {sq.purpose && <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">{sq.purpose === 'rent' ? '🔑 للإيجار' : '💰 للبيع'}</span>}
          {sq.beds ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">🛏️ {sq.beds}+ غرف</span> : null}
          {sq.areaMin ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary">📐 {sq.areaMin}+ م²</span> : null}
          {sq.priceMin ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary" dir="ltr">≥ {sq.priceMin.toLocaleString('en-US')} ر.س</span> : null}
          {sq.priceMax ? <span className="rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary" dir="ltr">≤ {sq.priceMax.toLocaleString('en-US')} ر.س</span> : null}
          <Link href="/search" className="rounded-full border border-red-200 px-2.5 py-1 font-bold text-red-600 hover:bg-red-50">✕ مسح</Link>
        </div>
      )}

      <form className="grid gap-3 card-3d rounded-xl p-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <SearchSuggestInput name="q" defaultValue={sp.q || ''} />
        </div>
        {/* المنطقة ثم المدينة — اختيار المنطقة يحدّث المدن فوراً */}
        <SearchAreaPicker regions={cities} areas={areas} region={sp.city || ''} area={sp.area || ''} className={sel} />
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
        {/* الحفاظ على فلاتر البحث الذكي عند إعادة الفلترة اليدوية */}
        {sq.reType && <input type="hidden" name="reType" value={sq.reType} />}
        {sq.purpose && <input type="hidden" name="purpose" value={sq.purpose} />}
        {sq.priceMin ? <input type="hidden" name="priceMin" value={sq.priceMin} /> : null}
        {sq.priceMax ? <input type="hidden" name="priceMax" value={sq.priceMax} /> : null}
        {sq.beds ? <input type="hidden" name="beds" value={sq.beds} /> : null}
        {sq.areaMin ? <input type="hidden" name="areaMin" value={sq.areaMin} /> : null}
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
                  <ConfirmSubmit msg={`إلغاء تنبيه البحث «${s0.query}»؟`} title="حذف" className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></ConfirmSubmit>
                </form>
              </span>
            ))}
          </div>
          {saved.length === 0 && !sp.q && <p className="text-[11px] text-muted-foreground">ابحث عن شيء ثم اضغط «نبّهني» ليصلك إشعار عند نشر إعلان مطابق.</p>}
        </div>
      )}

      <p className="text-sm text-muted-foreground">النتائج: {total}</p>
      <AdGrid ads={ads} />

      <AdminPager basePath="/search" page={page} pages={pages} total={total} params={{ q: sp.q, category: sp.category, city: sp.city, area: sp.area, type: sp.type, sort: sp.sort, special: sp.special, reType: sp.reType, purpose: sp.purpose, priceMin: sp.priceMin, priceMax: sp.priceMax, beds: sp.beds, areaMin: sp.areaMin }} />
    </div>
  );
}
