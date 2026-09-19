import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAction } from '@/lib/roles';
import { prisma } from '@/lib/prisma';
import { formatSar } from '@/lib/commerce/money';
import type { ShippingSnapshot } from '@/lib/commerce/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'تفاصيل طلب تربح — الإدارة', robots: { index: false, follow: false } };
type Order = {
  id: bigint; member_id: bigint; status: string; fulfillment_status: string;
  subtotal_minor: number; shipping_fee_minor: number; total_minor: number;
  shipping: ShippingSnapshot | string;
};
type Item = { id: bigint; title: string; quantity: number; unit_price_minor: number; total_minor: number };
type SupplierSnapshot = { product_id:bigint; supplier_id:bigint; supplier_name:string; supplier_sku:string; quantity:number; unit_cost_minor:number; total_cost_minor:number };
const paymentLabels: Record<string, string> = { building: 'قيد الإنشاء', awaiting_payment: 'بانتظار تأكيد الدفع', paid: 'مدفوع — مؤكد خادميًا', cancelled: 'ملغي' };
const fulfillmentLabels: Record<string, string> = {
  awaiting_payment: 'بانتظار الدفع — لم يبدأ التنفيذ', offline_pending: 'بانتظار التنفيذ والتسوية مع المورد خارج الموقع',
  action_required: 'تحتاج العملية إلى مراجعة', cancelled: 'ملغي',
};

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAction('commerce', 'view');
  const { id } = await params;
  if (!/^[1-9]\d{0,14}$/.test(id)) notFound();
  const [order] = await prisma.$queryRaw<Order[]>`SELECT id,member_id,status,fulfillment_status,subtotal_minor,shipping_fee_minor,total_minor,shipping FROM commerce_orders WHERE id=${BigInt(id)} LIMIT 1`;
  if (!order) notFound();
  // Order creation permits at most 100 lines. Read the purchased snapshots,
  // never the mutable product catalog or the member's current profile.
  const items = await prisma.$queryRaw<Item[]>`SELECT id,title,quantity,unit_price_minor,total_minor FROM commerce_order_items WHERE order_id=${order.id} ORDER BY id LIMIT 100`;
  const suppliers = await prisma.$queryRaw<SupplierSnapshot[]>`SELECT product_id,supplier_id,supplier_name,supplier_sku,quantity,unit_cost_minor,total_cost_minor FROM commerce_order_suppliers WHERE order_id=${order.id} ORDER BY product_id LIMIT 100`;
  const shipping: ShippingSnapshot = typeof order.shipping === 'string' ? JSON.parse(order.shipping) : order.shipping;
  return <section className="card-3d space-y-4 rounded-xl p-5">
    <Link href="/admin/commerce" className="text-primary underline">العودة إلى السلع والطلبات</Link>
    <h1 className="text-xl font-bold text-primary">تفاصيل الطلب #{order.id.toString()}</h1>
    <p className="text-sm">رقم العضو: {order.member_id.toString()}</p>
    <p>حالة دفع العميل: {paymentLabels[order.status] ?? 'حالة غير معروفة — راجع المسؤول'}</p>
    <p>حالة التنفيذ الداخلي: {fulfillmentLabels[order.fulfillment_status] ?? 'حالة غير معروفة — راجع المسؤول'}</p>
    <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">بيانات داخلية لموظفي تربح المخولين لتنفيذ الطلب. تنسيق التنفيذ وتسوية مستحقات المورد يتمان خارج الموقع؛ حالة دفع العميل لا تعني أن المورد استلم مستحقاته. هذه الصفحة للعرض فقط ولا تنفذ دفعًا للمورد أو تأكيدًا يدويًا للدفع.</p>
    <div className="overflow-x-auto">
      <table className="w-full text-right text-sm">
        <caption className="mb-2 text-right font-bold">السلع كما حُفظت عند إنشاء الطلب</caption>
        <thead><tr><th>السلعة</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id.toString()} className="border-t"><td className="py-2">{item.title}</td><td>{item.quantity}</td><td>{formatSar(item.unit_price_minor)} ر.س</td><td>{formatSar(item.total_minor)} ر.س</td></tr>)}</tbody>
      </table>
    </div>
    <p>قيمة السلع: {formatSar(order.subtotal_minor)} ر.س · التوصيل: {formatSar(order.shipping_fee_minor)} ر.س</p>
    <p className="font-bold">الإجمالي: {formatSar(order.total_minor)} ر.س</p>
    <section className="space-y-2 rounded-lg border p-3">
      <h2 className="font-bold">الموردون وقت إنشاء الطلب — بيانات داخلية</h2>
      <p className="text-xs">هذه تكاليف التوريد المحفوظة وليست إثباتًا لسداد المورد. الاستحقاق المحاسبي لا يُسجل قبل تأكيد البنك.</p>
      {suppliers.length===0 ? <p className="text-sm">لا توجد بنود مسندة لمورد؛ مخزون داخلي أو غير مسند.</p> : <div className="overflow-x-auto"><table className="w-full text-right text-sm">
        <thead><tr><th>السلعة</th><th>المورد</th><th>رمز المورد</th><th>الكمية</th><th>تكلفة الوحدة</th><th>إجمالي التكلفة</th></tr></thead>
        <tbody>{suppliers.map(s=><tr key={s.product_id.toString()} className="border-t"><td>{s.product_id.toString()}</td><td><Link className="text-primary underline" href={`/admin/commerce/accounts?supplier=${s.supplier_id}`}>{s.supplier_name} #{s.supplier_id.toString()}</Link></td><td>{s.supplier_sku}</td><td>{s.quantity}</td><td>{formatSar(s.unit_cost_minor)} ر.س</td><td>{formatSar(s.total_cost_minor)} ر.س</td></tr>)}</tbody>
      </table></div>}
    </section>
    <section className="space-y-2 rounded-lg border p-3">
      <h2 className="font-bold">بيانات المستلم والتوصيل المحفوظة للطلب</h2>
      <dl className="grid gap-2 sm:grid-cols-2">
        <div><dt>المستلم</dt><dd>{shipping.name}</dd></div>
        <div><dt>الجوال</dt><dd><bdi>{shipping.phone}</bdi></dd></div>
        <div><dt>العنوان</dt><dd className="whitespace-pre-wrap">{shipping.addressLine}</dd></div>
        <div><dt>المدينة</dt><dd>{shipping.city}</dd></div>
        <div><dt>الرمز البريدي</dt><dd>{shipping.postalCode}</dd></div>
        <div><dt>الدولة</dt><dd>{shipping.country}</dd></div>
      </dl>
    </section>
  </section>;
}
