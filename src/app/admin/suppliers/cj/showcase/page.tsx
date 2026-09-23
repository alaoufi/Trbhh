import Link from 'next/link';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { listVisibleCjProducts } from '@/lib/cj/mapping';
import { cjStorefrontPublic, cjImg } from '@/lib/cj/storefront';
import { setCjStorefront } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة سلع CJ المختارة', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/**
 * صفحة معاينة داخلية (غير معلنة، غير عامة) تعرض السلع المختارة فعلياً من CJ
 * ببياناتها الحقيقية (اسم عربي + صورة + سعر بالريال). محميّة بصلاحية التكاملات،
 * ولا رابط لها من واجهة العضو. للتجربة الواقعية قبل النشر. لا شراء ولا دفع.
 */
export default async function CjShowcasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const [items, isPublic] = await Promise.all([listVisibleCjProducts(200), cjStorefrontPublic()]);
  const readyCount = items.filter((r) => r.status === 'ready').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">معاينة السلع المختارة</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/cj" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">افتح متجر العملاء /cj ←</Link>
          <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">إدارة/استيراد ←</Link>
        </div>
      </div>

      {/* مفتاح النشر للعامة */}
      <div className={`rounded-xl border p-3 ${isPublic ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm">
            حالة متجر CJ للعامة: {isPublic ? <b className="text-emerald-700">مفعّل (ظاهر للجميع)</b> : <b className="text-amber-800">معاينة فقط (غير معلن — المشرفون فقط)</b>}
            {sp.published === '1' && <span className="ms-2 text-emerald-700">تم التفعيل.</span>}
            {sp.published === '0' && <span className="ms-2 text-amber-800">تم الإيقاف (رجع للمعاينة).</span>}
            <div className="text-xs text-muted-foreground">السلع «الجاهزة» التي ستظهر للعامة عند التفعيل: {readyCount} من {items.length}. (الشراء يبقى معطّلاً بمفتاحه المستقل.)</div>
          </div>
          <AccessBoundary module={'products'} action={isPublic ? 'suspend' : 'approve'}>
            <form action={setCjStorefront}>
              <input type="hidden" name="value" value={isPublic ? '0' : '1'} />
              <button className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${isPublic ? 'bg-amber-600' : 'bg-emerald-600'}`}>{isPublic ? 'إيقاف الإعلان (رجوع للمعاينة)' : 'تفعيل الإعلان للعامة'}</button>
            </form>
          </AccessBoundary>
        </div>
      </div>

      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        هذه الصفحة معاينة داخلية. متجر العملاء الحقيقي على <code>/cj</code> (وصفحة السلعة <code>/cj/[id]</code>) يظهر ضمن شكل الموقع؛
        وهو <b>غير معلن للعامة</b> حتى تفعيله أعلاه — قبله يراه المشرفون فقط. لا شراء ولا دفع.
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
                    ? <img src={cjImg(r.image)} alt="" className="aspect-square w-full object-cover" loading="lazy" />
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
