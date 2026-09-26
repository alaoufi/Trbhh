import Link from 'next/link';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { CjProductImage } from '@/components/cj/product-image';
import { requireAccess } from '@/lib/access-control/guards';
import { listVisibleCjProducts } from '@/lib/cj/mapping';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { getCachedArabic, isArabicText } from '@/lib/cj/translate';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة سلع CJ المختارة', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/**
 * صفحة معاينة داخلية (غير معلنة، غير عامة) تعرض السلع المختارة فعلياً من CJ
 * ببياناتها الحقيقية (اسم عربي + صورة + سعر بالريال). محميّة بصلاحية عرض المنتجات،
 * ولا رابط لها من واجهة العضو. للتجربة الواقعية قبل النشر. لا شراء ولا دفع.
 */
export default async function CjShowcasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const items = await listVisibleCjProducts(200);
  const translations = await getCachedArabic(items.map(r => r.name));
  const readyCount = items.filter((r) => r.status === 'ready').length;

  return (
    <div className="space-y-4">
      <CjAdminNav current="showcase" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">معاينة السلع المختارة</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/cj" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">افتح تجربة CJ الخاصة ←</Link>
          <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">إدارة/استيراد ←</Link>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-7">
        <b>تجربة خاصة بالمشرفين — التعميم غير مفعّل.</b>
        <p>السلع المراجعة: {readyCount} من {items.length}. اعتماد السلعة هنا لا ينشرها للعامة ولا يفعّل شراءها.</p>
        {sp.published !== undefined && <p>إعدادات النشر السابقة لا تتيح هذه النسخة للعامة؛ المرحلة الحالية تجربة خاصة فقط.</p>}
      </div>

      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        افتح تجربة CJ لمراجعة الصور وتفاصيل الجوال وتجميع السلع في السلة. يتطلب الوصول صلاحية عرض المنتجات؛ لا شراء ولا دفع.
      </p>

      {!items.length ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا سلع مختارة بعد. استورد سلعاً من صفحة «تصفّح منتجات CJ».</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">عدد السلع المعروضة: <b className="text-primary">{items.length}</b></p>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => {
              const priceMinor = r.sale_price_override_minor ?? r.sale_price_minor;
              const saved = isArabicText(r.name_ar) ? r.name_ar : translations.get(r.name.trim());
              const title = isArabicText(saved) ? saved! : 'الترجمة العربية غير متاحة';
              return (
                <div key={r.id} className="card-3d flex flex-col overflow-hidden rounded-xl">
                  <CjProductImage src={cjImg(cjProductImages(r)[0])} alt={title} className="aspect-square w-full object-cover" />
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5">{title}</div>
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النص الأصلي من المصدر</summary><p dir="auto">{r.name}</p></details>
                    <div className="mt-auto text-base font-extrabold text-primary">{sar(priceMinor)}</div>
                    {!isArabicText(saved) && <span className="w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">بلا عنوان عربي</span>}
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
