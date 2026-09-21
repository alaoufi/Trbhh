/** Local visual fixture only: real presentation components, synthetic public ads, no data services. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CommerceHero } from '@/components/commerce/commerce-hero';
import { NationalDayBanner, NationalDayHeroFrame } from '@/components/national-day-banner';
import { AdCardMarketplace } from '@/components/ad-card';
import { publicHomeHero } from '@/lib/public-home';
import { isNationalDayCampaignActive } from '@/lib/national-day';
import { homeGridClass, pickHomeLayout } from '@/lib/commerce/home-layout';
import type { AdCard } from '@/lib/data';

const fixtureAds: AdCard[] = [
  { title: 'سيارة عائلية للبيع بحالة ممتازة', price: 67500, cityName: 'الرياض', special: true, tier: 'gold', oldPrice: 70000, sellerTrusted: true, ratingAvg: 4.8, ratingCount: 12 },
  { title: 'رافعة شوكية للإيجار اليومي', price: 450, priceType: 'rent', rentPeriod: 'يومي', cityName: 'الدمام', storeName: 'متجر تجريبي للمعدات', sellerTrusted: true },
  { title: 'مطلوب أثاث مجلس بحالة جيدة', price: 0, adsType: 'request', cityName: 'جدة' },
  { title: 'جهاز إلكتروني مستعمل على السوم', price: 0, priceType: 'som', cityName: 'مكة المكرمة', urgent: true },
  { title: 'عرض خدمات تصميم داخلي بدون سعر معلن', price: 990, priceEnabled: false, cityName: 'القصيم' },
  { title: 'معدات زراعية متوفرة لدى صاحب الإعلان', price: 3200, cityName: 'الأحساء', special: true, tier: 'silver', storeName: 'متجر تجريبي زراعي' },
].map((ad, index) => ({ id: 900001 + index, adsType: 'offer', image: `/fixture-${index + 1}.svg`, categoryName: null, createdAt: '2026-09-21T08:00:00.000Z', special: false, urgent: false, views: 30 + index * 11, sellerName: `معلن تجريبي ${index + 1}`, sellerTrusted: false, ...ad })) as AdCard[];

function Fixture() {
  const [single, setSingle] = useState(false);
  const nationalDay = isNationalDayCampaignActive();
  const hero = publicHomeHero(fixtureAds, 'بيع. اشترِ. وتربح.', 'اعرض اللي عندك، واكتشف اللي تحتاجه، وتواصل مباشرة.');
  return <>
    <aside className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" aria-label="حدود المعاينة">
      معاينة محلية للمكونات فقط — البيانات والصور تجريبية، وليست الموقع الحي أو صفحة الرئيسية كاملة.
      <details className="mt-2"><summary className="cursor-pointer font-bold">أدوات المعاينة</summary><div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded border px-3 py-2" onClick={() => setSingle(true)}>عرض شريحة واحدة</button>
        <button type="button" className="rounded border px-3 py-2" onClick={() => setSingle(false)}>عرض ثلاث شرائح</button>
      </div></details>
    </aside>
    <div className="commerce-scope public-marketplace-home space-y-7 sm:space-y-10" data-fixture="public-home-components">
      {nationalDay && <NationalDayBanner />}
      <section className="space-y-4" aria-label="اكتشف سوق تربح">
        <NationalDayHeroFrame active={nationalDay}><CommerceHero headingLevel={1} label="اكتشف تربح" slides={single ? hero.slice(0, 1) : hero} /></NationalDayHeroFrame>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-extrabold text-[#16294a]">وش تبحث عنه اليوم؟</h2><span className="inline-flex min-h-11 items-center rounded-xl bg-[#ff6a1a] px-4 py-2 text-sm font-extrabold text-white">أضف إعلانك</span></div>
          <form onSubmit={event => event.preventDefault()} role="search" aria-label="نموذج تجريبي للبحث" className="space-y-3">
            <div className="flex items-end gap-2"><label className="min-w-0 flex-1 space-y-1 text-xs font-semibold">البحث في الإعلانات<input type="search" placeholder="ماذا تبحث عنه؟" className="h-11 w-full rounded-lg border bg-background px-3 text-sm" /></label><button className="h-11 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground">بحث</button></div>
            <details className="rounded-lg border bg-background px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">المنطقة والمدينة · نوع الإعلان · السعر</summary><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><label>المنطقة<select className="mt-1 h-11 w-full rounded-lg border px-2"><option>جميع المناطق</option><option>الرياض</option></select></label><label>نوع الإعلان<select className="mt-1 h-11 w-full rounded-lg border px-2"><option>عرض وطلب</option><option>عروض</option><option>طلبات</option></select></label></div></details>
          </form>
        </div>
      </section>
      <section aria-label="السوق" className="space-y-4"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-extrabold text-[#16294a]"><span className="h-6 w-1.5 rounded-full bg-[#ff6a1a]" />اكتشف السوق</h2><span className="py-2 text-sm font-bold text-[#16294a]">عرض الكل ←</span></div>
        <div className={`${homeGridClass(pickHomeLayout(fixtureAds.length))} gap-3 sm:gap-5`}>{fixtureAds.map(ad => <AdCardMarketplace key={ad.id} ad={ad} />)}</div>
      </section>
    </div>
  </>;
}

createRoot(document.getElementById('root')!).render(<Fixture />);
