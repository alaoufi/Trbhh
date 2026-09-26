import { AccessPage } from '@/components/access-boundary';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAdminPage } from '@/lib/access-control/guards';
import Link from 'next/link';

import { cjConfig } from '@/lib/cj/config';
import { defaultMarginBps, computePrice } from '@/lib/cj/pricing';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { countCjProducts } from '@/lib/cj/mapping';
import { testConnection, listProducts, getInventoryByPid, getWarehouses, calculateFreightToKSA } from '@/lib/cj/client';
import { sampleCjProducts } from '@/lib/cj/sample';
import { cjSyncSettings } from '@/lib/cj/sync';
import { getSetting } from '@/lib/settings';
import { getCjCategoryText } from '@/lib/cj/categories';
import { saveCjMargin, saveCjSync, runCjSync, processAllCjImported } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تكامل CJ — وضع الاختبار' };

const input = 'min-h-9 rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
const btn = 'rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white';
const card = 'card-3d rounded-xl p-4 space-y-2';

function Result({ r }: { r: { ok: true; data: unknown } | { ok: false; error: string; status?: number } }) {
  if (!r.ok) return <p className="rounded-lg bg-red-50 p-2 text-sm font-bold text-red-700">تعذّر: {r.error}{r.status ? ` (HTTP ${r.status})` : ''}</p>;
  return <pre className="max-h-80 overflow-auto rounded-lg bg-[#0f1d38] p-3 text-xs leading-5 text-[#e5ebf6]" dir="ltr">{JSON.stringify(r.data, null, 2)}</pre>;
}

export default async function CjTestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPage('/admin/suppliers/cj');
  const sp = await searchParams;
  const cfg = cjConfig();
  const [commerce, marginBps, mapped, sync, deliveryDays, categoryTree] = await Promise.all([
    getCommerceConfig().catch(() => null),
    defaultMarginBps(),
    countCjProducts(),
    cjSyncSettings(),
    getSetting('cj_delivery_days_text', '٧–١٥ يوم عمل'),
    getCjCategoryText(),
  ]);
  const liveAllowed = process.env.SUPPLIER_ALLOW_LIVE_ORDERS === 'true';
  const run = typeof sp.run === 'string' ? sp.run : '';
  const pid = typeof sp.pid === 'string' ? sp.pid : '';
  const vid = typeof sp.vid === 'string' ? sp.vid : '';
  const qty = typeof sp.qty === 'string' && /^\d{1,3}$/.test(sp.qty) ? Number(sp.qty) : 1;

  // اختبارات قراءة فقط — تُنفَّذ فقط عند طلبها صراحةً، ولا تُنشئ أي طلب/شراء.
  type AnyResult = { ok: true; data: unknown } | { ok: false; error: string; status?: number };
  let result: AnyResult | null = null;
  if (cfg.configured) {
    if (run === 'connection') result = await testConnection();
    else if (run === 'products') result = await listProducts(1, 20);
    else if (run === 'sample') result = await sampleCjProducts(3);
    else if (run === 'inventory' && pid) result = await getInventoryByPid(pid);
    else if (run === 'warehouses' && pid) result = await getWarehouses(pid);
    else if (run === 'freight' && vid) result = await calculateFreightToKSA([{ vid, quantity: qty }]);
  }

  const sample = computePrice(2000, 1500, 0, marginBps); // مثال: تكلفة ٢٠ + شحن ١٥ ر.س

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">تكامل CJdropshipping — وضع الاختبار</h1>
        <Link href="/admin/suppliers/cj/browse" className="rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white">تصفّح المنتجات واستيرادها ←</Link>
      </div>

      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        هذه الصفحة لاختبار الاتصال والقراءة فقط (منتجات/مخزون/مستودعات/شحن). <b>لا يُنشأ أي طلب شراء حقيقي</b> —
        الشراء مقفل بمفتاحين: «تفعيل الشراء» و<code>SUPPLIER_ALLOW_LIVE_ORDERS</code>.
      </p>

      {/* الحالة */}
      <div className={card}>
        <h2 className="font-bold">الحالة</h2>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          <li>إعداد CJ: {cfg.configured ? <b className="text-emerald-700">جاهز</b> : <b className="text-red-700">ناقص (اضبط متغيّرات البيئة)</b>}</li>
          <li>البريد: <span dir="ltr">{cfg.email || '—'}</span></li>
          <li>مفتاح API: {cfg.apiKey ? '••••••' : '—'}</li>
          <li>مفتاح التشفير: {/^[a-fA-F0-9]{64}$/.test(cfg.encryptionKey) ? 'صحيح' : 'ناقص/غير صالح'}</li>
          <li>تفعيل الشراء (مركزي): {commerce?.purchasingEnabled ? <b className="text-red-700">مفعّل</b> : <b className="text-emerald-700">معطّل ✓</b>}</li>
          <li>SUPPLIER_ALLOW_LIVE_ORDERS: {liveAllowed ? <b className="text-red-700">true</b> : <b className="text-emerald-700">false ✓</b>}</li>
          <li>منتجات CJ المربوطة: {mapped}</li>
          <li>الهامش الافتراضي: {(marginBps / 100).toFixed(2)}٪</li>
        </ul>
      </div>

      {/* الهامش */}
      <div className={card}>
        <h2 className="font-bold">الهامش الافتراضي (قابل للتعديل)</h2>
        {sp.saved === 'margin' && <p className="text-sm text-emerald-700">تم الحفظ.</p>}
        {sp.error === 'margin' && <p className="text-sm text-red-700">قيمة غير صالحة (0–1000٪).</p>}
        <AccessBoundary module="pricing"><AccessBoundary module={'pricing'} action={'manage_settings'}><form action={saveCjMargin} className="flex flex-wrap items-center gap-2">
          <label className="text-sm">النسبة٪<input className={`${input} ms-2 w-24`} name="marginPercent" inputMode="decimal" defaultValue={(marginBps / 100).toString()} /></label>
          <button className={btn}>حفظ الهامش</button>
        </form></AccessBoundary></AccessBoundary>
        <p className="text-xs text-muted-foreground">مثال حساب: تكلفة ٢٠ + شحن ١٥ ر.س بهامش {(marginBps / 100).toFixed(0)}٪ → ربح {(sample.profitMinor / 100).toFixed(2)} · بيع {(sample.salePriceMinor / 100).toFixed(2)} ر.س. (السعر غير مثبّت في الكود.)</p>
      </div>

      {/* مزامنة الكتالوج */}
      <div className={card}>
        <h2 className="font-bold">مزامنة كتالوج CJ (قراءة فقط)</h2>
        <p className="text-xs text-muted-foreground">
          تجلب منتجات CJ إلى جدول التخزين الوسيط <code>cj_products</code> وتحتسب سعر البيع من التكلفة (سعر CJ بالدولار
          × سعر الصرف) + الشحن + الهامش الافتراضي. لا يُنشَر أي منتج تلقائياً في المتجر ولا يُشترى شيء. المزامنة المجدولة
          تعمل فقط عند تفعيلها أدناه (كرون داخلي <code>/api/internal/cj/sync</code>).
        </p>
        {sp.saved === 'sync' && <p className="text-sm text-emerald-700">تم حفظ إعدادات المزامنة.</p>}
        {sp.synced === '1' && <p className="text-sm text-emerald-700">تمّت المزامنة: استُورد {sp.imported} · صفحات {sp.pages} · تُجووز {sp.skipped}.</p>}
        {typeof sp.syncerr === 'string' && <p className="text-sm text-red-700">تعذّرت المزامنة: {sp.syncerr}</p>}
        <AccessBoundary module="integrations" action="manage_settings"><form action={saveCjSync} className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="enabled" value="1" defaultChecked={sync.enabled} className="size-4" />
            تفعيل المزامنة المجدولة (كرون)
          </label>
          <label className="text-sm">حجم الصفحة<input className={`${input} ms-2 w-24`} name="pageSize" type="number" min={1} max={50} defaultValue={sync.pageSize} /></label>
          <label className="text-sm">عدد الصفحات<input className={`${input} ms-2 w-24`} name="maxPages" type="number" min={1} max={20} defaultValue={sync.maxPages} /></label>
          <label className="text-sm">سعر صرف الدولار (ر.س)<input className={`${input} ms-2 w-24`} name="usdToSar" inputMode="decimal" defaultValue={(sync.usdToSarX100 / 100).toString()} /></label>
          <label className="text-sm">تقدير الشحن/منتج (ر.س)<input className={`${input} ms-2 w-24`} name="shippingSar" inputMode="decimal" defaultValue={(sync.shippingMinor / 100).toString()} /></label>
          <label className="text-sm sm:col-span-2">مدّة التوصيل التقديرية (نصّ يظهر للعميل)<input className={`${input} ms-2 w-48`} name="deliveryDays" defaultValue={deliveryDays} placeholder="مثال: ٧–١٥ يوم عمل" /></label>
          <label className="block text-sm sm:col-span-2">التصنيفات (سطر لكل قسم رئيسي، وأقسامه الفرعية بعد «:» مفصولة بفواصل)
            <textarea className="mt-1 w-full rounded-lg border border-primary/25 bg-white px-3 py-2 text-sm" name="categoryTree" rows={6} defaultValue={categoryTree} placeholder={"المنزل والحديقة: وسائد، سجاد، ستائر\nملابس رجالية: ستُرات، أحذية\nإلكترونيات: سماعات، شواحن"} dir="rtl" />
            <span className="mt-1 block text-xs text-muted-foreground">تُعرض هذه الأقسام للاختيار على السلعة (قسم رئيسي أو «رئيسي / فرعي»)، ويمكن كتابة قيمة جديدة أيضاً.</span>
          </label>
          <div className="sm:col-span-2"><button className={btn}>حفظ إعدادات المزامنة</button></div>
        </form></AccessBoundary>
        <AccessBoundary module="integrations" action="sync"><form action={runCjSync}>
          <button className={btn} disabled={!cfg.configured}>مزامنة الآن (يدوية)</button>
          {!cfg.configured && <span className="ms-2 text-xs text-red-700">اضبط متغيّرات CJ أولاً.</span>}
        </form></AccessBoundary>

        <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
          <h3 className="text-sm font-bold text-primary">معالجة شاملة للسلع المستوردة (زر واحد)</h3>
          <p className="mt-1 text-xs text-muted-foreground">يطبّق على المستورد لتربح: تحديث الصور والخيارات والتفاصيل، احتساب <b>الشحن الحقيقي من المورد</b>، وترجمة الاسم والوصف الناقصين. يعالج دفعة (١٠) لكل ضغطة ويكمل الباقي بالضغط ثانيةً حتى تكتمل الدورة. التصنيف يبقى يدوياً على تصنيفات تربح.</p>
          {sp.bulk === '1' && <p className="mt-2 text-sm text-emerald-700">عولجت {sp.processed} سلعة · ظهر شحن حقيقي لـ{sp.shipped} · تُرجمت {sp.tr} · {sp.done === '1' ? 'اكتملت معالجة كل السلع.' : `متبقٍّ ${sp.remaining} — اضغط مجدداً للمتابعة.`}</p>}
          <AccessBoundary module="products" action="edit"><form action={processAllCjImported} className="mt-2">
            <button className={btn} disabled={!cfg.configured}>معالجة شاملة الآن</button>
            {!cfg.configured && <span className="ms-2 text-xs text-red-700">اضبط متغيّرات CJ أولاً.</span>}
          </form></AccessBoundary>
        </div>
      </div>

      {/* اختبارات القراءة */}
      <div className={card}>
        <h2 className="font-bold">اختبارات القراءة (بلا شراء)</h2>
        {!cfg.configured && <p className="text-sm text-red-700">اضبط متغيّرات CJ في البيئة أولاً لتشغيل الاختبارات.</p>}
        <p className="text-xs text-muted-foreground">«اختبار الاتصال»: النجاح يعني ظهور <code dir="ltr">connected: true</code> مع البريد (تمّت المصادقة وجُلب التوكن). ظهور البريد بلا خطأ أحمر = الاتصال سليم.</p>
        <div className="flex flex-wrap gap-2">
          <AccessPage href="/admin/suppliers/cj?run=connection"><Link href="/admin/suppliers/cj?run=connection" className={btn}>اختبار الاتصال</Link></AccessPage>
          <AccessPage href="/admin/suppliers/cj?run=products"><Link href="/admin/suppliers/cj?run=products" className={btn}>عيّنة منتجات (٢٠)</Link></AccessPage>
          <AccessPage href="/admin/suppliers/cj?run=sample"><Link href="/admin/suppliers/cj?run=sample" className={btn}>عيّنة تفصيلية (٣: متغيّرات+وزن+مخزون)</Link></AccessPage>
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="run" value="inventory" />
          <label className="text-sm">pid (منتج)<input className={`${input} ms-2`} name="pid" defaultValue={pid} placeholder="CJ product id" /></label>
          <button className={btn}>المخزون + المستودعات</button>
        </form>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="run" value="freight" />
          <label className="text-sm">vid (متغيّر)<input className={`${input} ms-2`} name="vid" defaultValue={vid} placeholder="CJ variant id" /></label>
          <label className="text-sm">الكمية<input className={`${input} ms-2 w-20`} name="qty" type="number" min={1} max={999} defaultValue={qty} /></label>
          <button className={btn}>احتساب الشحن إلى السعودية</button>
        </form>

        {run && cfg.configured && (
          <div className="pt-2">
            <div className="mb-1 text-sm font-bold">نتيجة: {run}</div>
            {result ? <Result r={result} /> : <p className="text-sm text-muted-foreground">أدخل المعرّف المطلوب ثم شغّل الاختبار.</p>}
            {run === 'warehouses' && pid && result === null && <p className="text-sm text-muted-foreground">استخدم زر «المخزون + المستودعات» مع pid.</p>}
          </div>
        )}
      </div>

      <nav className="text-sm text-primary underline"><AccessPage href="/admin/suppliers"><Link href="/admin/suppliers">العودة للموردين</Link></AccessPage></nav>
    </div>
  );
}
