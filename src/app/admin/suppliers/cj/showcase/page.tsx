import Link from 'next/link';
import { requireAccess } from '@/lib/access-control/guards';
import { listVisibleCjProducts } from '@/lib/cj/mapping';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة سلع CJ المختارة', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/**
 * صفحة معاينة داخلية (غير معلنة، غير عامة) تعرض السلع المختارة فعلياً من CJ
 * ببياناتها الحقيقية (اسم عربي + صورة + سعر بالريال). محميّة بصلاحية التكاملات،
 * ولا رابط لها من واجهة العضو. للتجربة الواقعية قبل النشر. لا شراء ولا دفع.
 */
export default async function CjShowcasePage() {
  await requireAccess('integrations', 'view');
  const items = await listVisibleCjProducts(200);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">معاينة السلع المختارة</h1>
        <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">إدارة/استيراد ←</Link>
      </div>

      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        <b>معاينة داخلية فقط</b> — هذه الصفحة غير معلنة وغير ظاهرة للعامة (محميّة بصلاحية الإدارة). تعرض السلع المستوردة غير المخفية
        ببياناتها الحقيقية من CJ والسعر بالريال. لا شراء ولا دفع ولا نشر تلقائي.
      </p>

      {!items.length ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا سلع مختارة بعد. استورد سلعاً من صفحة «تصفّح منتجات CJ».</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">عدد السلع المعروضة: <b className="text-primary">{items.length}</b></p>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => {
              const priceMinor = r.sale_price_override_minor ?? r.sale_price_minor;
              const title = r.name_ar || r.name || '—';
              return (
                <div key={r.id} className="card-3d flex flex-col overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.image
                    ? <img src={r.image} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    : <div className="grid aspect-square w-full place-items-center bg-primary/5 text-xs text-muted-foreground">لا صورة</div>}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5">{title}</div>
                    <div className="mt-auto text-base font-extrabold text-primary">{sar(priceMinor)}</div>
                    {!r.name_ar && <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">بلا عنوان عربي</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
