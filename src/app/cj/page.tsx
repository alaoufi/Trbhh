import Link from 'next/link';
import { cjStorefrontView } from '@/lib/cj/storefront';
import { listStorefrontCjProducts } from '@/lib/cj/mapping';
import { AdGrid } from '@/components/ad-card';
import { getHomeLatestAds } from '@/lib/data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'سلع مختارة', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

export default async function CjStorePage() {
  const view = await cjStorefrontView();
  if (!view.visible) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-extrabold text-primary">قريباً</h1>
        <p className="mt-3 text-muted-foreground">هذا القسم قيد التجهيز وسيُعلَن قريباً بإذن الله.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 font-bold text-white">العودة للرئيسية</Link>
      </div>
    );
  }
  const readyOnly = !view.isStaff; // الزائر يرى «الجاهزة» فقط؛ المشرف يعاين الكل
  const [items, latestAds] = await Promise.all([listStorefrontCjProducts(readyOnly, 120), getHomeLatestAds(24)]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {!view.isPublic && view.isStaff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <b>معاينة إدارية</b> — صفحة مطابقة للرئيسية، مخفية عن الأعضاء والزوار (تراها بصفتك مشرفاً فقط). فعّلها من لوحة الإدارة بعد نجاح التجربة. المورد لا يظهر للعميل.
        </p>
      )}

      {/* السلع المختارة (المستوردة) — المورد مخفي */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-primary">سلع مختارة</h2>
        {!items.length ? (
          <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا سلع معروضة بعد.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => {
              const price = r.sale_price_override_minor ?? r.sale_price_minor;
              const title = r.name_ar || r.name || '—';
              return (
                <Link key={String(r.id)} href={`/cj/${r.id}`} className="card-3d flex flex-col overflow-hidden rounded-xl transition hover:shadow-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.image
                    ? <img src={r.image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-xs text-muted-foreground">لا صورة</div>}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5">{title}</div>
                    {r.trbhh_category && <div className="text-[11px] text-muted-foreground">{r.trbhh_category}</div>}
                    <div className="mt-auto text-base font-extrabold text-primary">{sar(price)}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* أحدث الإعلانات — كما في الرئيسية (بنفس بطاقات الإعلانات) */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-primary">أحدث الإعلانات</h2>
        <AdGrid ads={latestAds} />
      </section>
    </div>
  );
}
