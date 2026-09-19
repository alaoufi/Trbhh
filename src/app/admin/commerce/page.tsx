import Link from 'next/link';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { assertCommerceSchemaReady } from '@/lib/commerce/schema';
import { COMMERCE_DEFAULTS } from '@/lib/commerce/config';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { formatSar } from '@/lib/commerce/money';
import { saveCommerceProduct, saveCommerceSettings, deliverCommerceNotification } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'السلع المعتمدة والطلبات' };
const input = 'min-h-9 w-full rounded-lg border border-primary/25 bg-white px-2 py-1 text-sm';
const button = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
type Product = { id: bigint; title: string; price_minor: number; stock_available: number; stock_reserved: number; approved: number; visible: number; enabled: number; ad_id: bigint | null };
type Order = { id: bigint; member_id: bigint; total_minor: number; status: string; fulfillment_status: string };
type Notice = { id: bigint; order_id: bigint; channel: string; status: string };
const labels: Record<string, string> = {
  commerce_enabled: 'عرض كتالوج السلع المعتمدة', commerce_payments_enabled: 'تفعيل الدفع المباشر بعد اجتياز اختبارات البنك',
  commerce_notifications_enabled: 'إرسال تنبيهات الطلب عبر القنوات المتاحة', commerce_admin_phone: 'جوال مسؤول تربح',
  commerce_title: 'عنوان الكتالوج', commerce_description: 'وصف الكتالوج', commerce_buy_label: 'نص متابعة الطلب',
  commerce_unavailable_text: 'نص عدم الإتاحة', commerce_shipping_terms: 'شروط التوصيل', commerce_shipping_fee_sar: 'رسوم التوصيل بالريال — حدد 0.00 إذا كان مجانيًا',
  commerce_payment_pending_text: 'نص انتظار التحقق', commerce_payment_confirmed_text: 'نص تأكيد الدفع', commerce_paid_message: 'قالب تنبيه الدفع: {order} {amount} {reference}',
  commerce_checkout_error_text: 'خطأ إنشاء الطلب', commerce_rate_limit_text: 'تنبيه كثرة المحاولات', commerce_location_error_text: 'خطأ المنطقة والمدينة',
  commerce_payment_action_required_text: 'نص الحاجة لمراجعة نتيجة الدفع', commerce_payment_rate_limit_text: 'نص حد محاولات التحقق من الدفع', commerce_payment_unavailable_text: 'نص تعذر الدفع أو التحقق',
};
function ProductForm({ product }: { product?: Product }) {
  return <form action={saveCommerceProduct} className="grid gap-2 rounded-xl border border-primary/15 p-3 sm:grid-cols-2">
    {product && <input type="hidden" name="id" value={product.id.toString()} />}
    <label className="text-sm">اسم السلعة<input className={input} name="title" required maxLength={200} defaultValue={product?.title} /></label>
    <label className="text-sm">السعر النهائي بالريال<input className={input} name="price" inputMode="decimal" required defaultValue={product ? formatSar(product.price_minor) : ''} /></label>
    {product ? <label className="text-sm">تعديل المخزون (+ إضافة / - سحب)، المتاح الآن {product.stock_available}<input type="hidden" name="stock" value="0" /><input className={input} name="stockDelta" type="number" min={-1000000} max={1000000} defaultValue={0} /></label>
      : <label className="text-sm">الكمية الأولية المتاحة للبيع<input className={input} name="stock" type="number" min={0} max={1000000} required defaultValue={0} /></label>}
    <label className="text-sm">رقم الإعلان المرجعي الداخلي (اختياري)<input className={input} name="adId" inputMode="numeric" defaultValue={product?.ad_id?.toString() || ''} /></label>
    <div className="flex flex-wrap gap-3 text-sm sm:col-span-2">
      <label><input type="checkbox" name="approved" value="1" defaultChecked={product?.approved === 1} /> أعتمد البيع باسم تربح</label>
      <label><input type="checkbox" name="visible" value="1" defaultChecked={product?.visible === 1} /> ظاهر في الكتالوج</label>
      <label><input type="checkbox" name="enabled" value="1" defaultChecked={product?.enabled === 1} /> متاح للطلب</label>
      {product && <span>محجوز للطلبات: {product.stock_reserved}</span>}
    </div>
    <button className={button}>حفظ السلعة</button>
  </form>;
}
export default async function CommerceAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAction('commerce', 'view');
  let schemaReady = true;
  try { await assertCommerceSchemaReady(prisma); } catch { schemaReady = false; }
  if (!schemaReady) return <div className="card-3d rounded-xl p-5">مخطط التجارة غير جاهز. لا يمكن تفعيل الشراء قبل تجهيز الجداول والتحقق من فهارس منع التكرار.</div>;
  const [sp, settings, products, orders, notices, gateway] = await Promise.all([
    searchParams,
    prisma.site_settings.findMany({ where: { k: { in: Object.keys(COMMERCE_DEFAULTS) } } }),
    prisma.$queryRaw<Product[]>`SELECT id,title,price_minor,stock_available,stock_reserved,approved,visible,enabled,ad_id FROM commerce_products ORDER BY id DESC LIMIT 100`,
    prisma.$queryRaw<Order[]>`SELECT id,member_id,total_minor,status,fulfillment_status FROM commerce_orders ORDER BY id DESC LIMIT 100`,
    prisma.$queryRaw<Notice[]>`SELECT id,order_id,channel,status FROM commerce_notifications WHERE channel IN ('sms','whatsapp') ORDER BY id DESC LIMIT 100`,
    getCommerceGateway(),
  ]);
  const values = new Map(settings.map(r => [r.k, r.v]));
  return <div className="space-y-4">
    <h1 className="text-xl font-extrabold text-primary">السلع المعتمدة والطلبات</h1>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">العميل يشتري من تربح. تسوية المورد تتم خارج الموقع. لا شحن محفظة ولا دفع آلي للمورد. {gateway?.ready ? '' : 'الدفع المباشر محجوب حتى التحقق من عقد البنك واختبارات بيئته التجريبية.'}</p>
    {sp.saved && <p className="text-emerald-700">تم الحفظ.</p>}
    {sp.error && <p role="alert" className="text-red-700">لم يتم الحفظ. تحقق من الحقول وجاهزية البوابة.</p>}
    {sp.delivery && <p role="status">نتيجة الإرسال: {String(sp.delivery)}. لا تؤثر على حالة الدفع.</p>}
    <nav className="flex flex-wrap gap-4 text-primary underline"><Link href="/shop">معاينة كتالوج السلع المعتمدة</Link><Link href="/admin/suppliers">الموردون وربط السلع</Link><Link href="/admin/commerce/accounts">الإيصالات والاستحقاقات</Link></nav>
    <details className="card-3d rounded-xl p-4"><summary className="cursor-pointer font-bold">الإعدادات والنصوص</summary>
      <form action={saveCommerceSettings} className="mt-3 grid gap-3 sm:grid-cols-2">
        {Object.entries(COMMERCE_DEFAULTS).map(([key, fallback]) => {
          const value = values.get(key) ?? fallback;
          return key.endsWith('_enabled') ? <label key={key} className="text-sm"><input type="checkbox" name={key} value="1" defaultChecked={value === '1'} disabled={key === 'commerce_payments_enabled' && !gateway?.ready} /> {labels[key]}</label>
            : <label key={key} className="text-sm">{labels[key]}<textarea className={input} name={key} rows={2} maxLength={1600} defaultValue={value} /></label>;
        })}
        <button className={button}>حفظ الإعدادات</button>
      </form>
    </details>
    <details className="card-3d rounded-xl p-4"><summary className="cursor-pointer font-bold">إضافة سلعة معتمدة</summary><div className="mt-3"><ProductForm /></div></details>
    <section className="space-y-2"><h2 className="font-bold">السلع — آخر 100</h2>
      {products.map(product => <details key={product.id.toString()} className="card-3d rounded-xl p-3"><summary className="cursor-pointer">#{product.id.toString()} {product.title} — {formatSar(product.price_minor)} ر.س</summary><div className="mt-2"><ProductForm product={product} /></div></details>)}
    </section>
    <section className="card-3d overflow-x-auto rounded-xl p-4"><h2 className="mb-2 font-bold">آخر 100 طلب</h2>
      <table className="w-full text-right text-sm"><thead><tr><th>الطلب</th><th>العضو</th><th>الإجمالي</th><th>الدفع</th><th>تنفيذ المورد خارج الموقع</th></tr></thead>
        <tbody>{orders.map(o => <tr key={o.id.toString()} className="border-t"><td className="py-2"><Link href={`/admin/commerce/orders/${o.id}`} className="text-primary underline">{o.id.toString()}</Link></td><td>{o.member_id.toString()}</td><td>{formatSar(o.total_minor)} ر.س</td><td>{o.status}</td><td>{o.fulfillment_status}</td></tr>)}</tbody></table>
    </section>
    <section className="card-3d rounded-xl p-4"><h2 className="font-bold">تنبيهات الدفع</h2><p className="my-2 text-xs">الحالة sending أو unknown تحتاج مراجعة لدى مزود الرسائل؛ لا تُعاد تلقائيًا. زر الإرسال يتصل بالمزود الفعلي وقد تُحسب تكلفته.</p>
      {notices.map(n => <div key={n.id.toString()} className="flex flex-wrap items-center gap-3 border-t py-2 text-sm"><span>طلب #{n.order_id.toString()} · {n.channel} · {n.status}</span>
        {n.status === 'pending' && <form action={deliverCommerceNotification}><input type="hidden" name="id" value={n.id.toString()} /><label><input name="confirm" value="1" type="checkbox" required /> تأكيد إرسال هذه الرسالة</label> <button className={button}>إرسال</button></form>}
      </div>)}
    </section>
  </div>;
}
