import Link from 'next/link';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { CjProductImage } from '@/components/cj/product-image';
import { CjLiveNumbers } from '@/components/cj/cj-live-numbers';
import { requireAccess } from '@/lib/access-control/guards';
import { loadAdminCjCatalog } from '@/lib/cj/admin-catalog';
import { CjAdminCatalogControls } from '@/components/cj/admin-catalog-controls';
import { getCategories } from '@/lib/data';
import { cjImg, cjProductImages } from '@/lib/cj/storefront';
import { getCachedArabic, isArabicText } from '@/lib/cj/translate';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'معاينة سلع المورد المختارة', robots: { index: false, follow: false } };


/**
 * صفحة معاينة داخلية (غير معلنة، غير عامة) تعرض السلع المختارة فعلياً من CJ
 * ببياناتها الحقيقية (اسم عربي + صورة + سعر بالريال). محميّة بصلاحية عرض المنتجات،
 * ولا رابط لها من واجهة العضو. للتجربة الواقعية قبل النشر. لا شراء ولا دفع.
 */
export default async function CjShowcasePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('products', 'view');
  const sp = await searchParams;
  const [catalog, categories] = await Promise.all([loadAdminCjCatalog(sp, true), getCategories()]);
  const items = catalog.items;
  const translations = await getCachedArabic(items.map(r => r.name));
  const readyCount = catalog.ready;

  return (
    <div className="space-y-4">
      <CjAdminNav current="showcase" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">معاينة السلع المختارة</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/cj" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">افتح تجربة المورد الخاصة ←</Link>
          <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">إدارة/استيراد ←</Link>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-7">
        <b>تجربة خاصة بالمشرفين — التعميم غير مفعّل.</b>
        <p>السلع المراجعة: {readyCount} من {catalog.total}. اعتماد السلعة هنا لا ينشرها للعامة ولا يفعّل شراءها.</p>
        {sp.published !== undefined && <p>إعدادات النشر السابقة لا تتيح هذه النسخة للعامة؛ المرحلة الحالية تجربة خاصة فقط.</p>}
      </div>
      <CjAdminCatalogControls path="/admin/suppliers/cj/showcase" catalog={catalog} categories={categories} />

      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        افتح تجربة المورد لمراجعة الصور وتفاصيل الجوال وتجميع السلع في السلة. يتطلب الوصول صلاحية عرض المنتجات؛ لا شراء ولا دفع.
      </p>

      {!items.length ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا سلع مختارة بعد. استورد سلعاً من صفحة «تصفّح منتجات المورد».</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">عدد السلع المعروضة: <b className="text-primary">{items.length}</b></p>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => {
              const saved = isArabicText(r.name_ar) ? r.name_ar : translations.get(r.name.trim());
              // لا نعرض «الترجمة غير متاحة» كحالة نهائية: نُظهر «بانتظار الترجمة» (حالة
              // مؤقتة تكملها مهمة الترجمة الدورية تلقائياً)، والنص الأصلي يبقى ظاهراً أدناه.
              const title = isArabicText(saved) ? saved! : 'بانتظار الترجمة';
              return (
                <div key={r.id} className="card-3d flex flex-col overflow-hidden rounded-xl">
                  <CjProductImage src={cjImg(cjProductImages(r)[0])} alt={title} className="aspect-square w-full object-cover" />
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-5">{title}</div>
                    <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">النص الأصلي من المصدر</summary><p dir="auto">{r.name}</p></details>
                    <div className="mt-auto"><CjLiveNumbers pid={r.cj_product_id} productId={r.id}/></div>
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
