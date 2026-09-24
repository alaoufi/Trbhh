import { notFound } from 'next/navigation';
import Link from 'next/link';
import { financeSchemaAvailable } from '@/lib/finance/schema';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { formatSar } from '@/lib/commerce/money';
import { memberOrderTracking } from '@/lib/suppliers/tracking';
import { payCommerceOrder, cancelCommerceOrder, checkCommercePayment } from '../actions';
import {OrderVariantDetails} from '@/components/commerce/order-variant-details';

export const dynamic = 'force-dynamic';
export default async function MemberOrder({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireUser();
  const { id } = await params;
  if (!/^[1-9]\d{0,14}$/.test(id)) notFound();
  const [order] = await prisma.$queryRaw<{ id: bigint; status: string; total_minor: number; shipping_fee_minor: number; fulfillment_status: string }[]>`SELECT id,status,total_minor,shipping_fee_minor,fulfillment_status FROM commerce_orders WHERE id=${BigInt(id)} AND member_id=${BigInt(session.uid)}`;
  if (!order) notFound();
  const [items, attempts, config, gateway] = await Promise.all([
    prisma.$queryRaw<{ title: string; quantity: number; total_minor: number;unit_price_minor:number;list_unit_price_minor:number|null;discount_minor:number;variant_snapshot:unknown }[]>`SELECT title,quantity,total_minor,unit_price_minor,list_unit_price_minor,discount_minor,variant_snapshot FROM commerce_order_items WHERE order_id=${order.id} ORDER BY id`,
    prisma.$queryRaw<{ status: string }[]>`SELECT status FROM commerce_payment_attempts WHERE order_id=${order.id}`,
    getCommerceConfig(), getCommerceGateway(),
  ]);
  const attempt = attempts[0];
  const documents = await financeSchemaAvailable(prisma)
    ? await prisma.$queryRaw<{id:bigint;number:string|null;status:string}[]>`SELECT i.id,i.number,i.status FROM finance_invoices i INNER JOIN commerce_orders o ON o.id=i.order_id WHERE o.id=${order.id} AND o.member_id=${BigInt(session.uid)} ORDER BY i.id`
    : [];
  const tracking = config.enabled && order.status === 'paid'
    ? await memberOrderTracking(prisma, order.id, BigInt(session.uid)) : [];
  let trackingLabels: string[] = [];
  if (tracking.length) {
    const { getSetting } = await import('@/lib/settings');
    trackingLabels = await Promise.all([
      getSetting('supplier_tracking_title', 'تتبع الشحن'),
      getSetting('supplier_tracking_carrier_label', 'شركة الشحن'),
      getSetting('supplier_tracking_number_label', 'رقم التتبع'),
      getSetting('supplier_tracking_status_label', 'حالة الشحن'),
    ]);
  }
  const canPay = order.status === 'awaiting_payment' && (!attempt || attempt.status === 'pending')
    && config.enabled && config.paymentsEnabled && gateway?.ready;
  const query = await searchParams;
  // URL values select advisory text only; ownership, payment state and controls
  // remain derived from the database. Ignore stale feedback on terminal orders.
  const feedback = order.status !== 'awaiting_payment' ? null
    : query.error === 'rate' ? config.text.paymentRateLimit
      : query.error === 'unavailable' || query.payment === 'unavailable' ? config.text.paymentUnavailable
        : query.payment === 'action_required' ? config.text.paymentActionRequired : null;
  return <section className="card-3d space-y-4 rounded-xl p-5">
    <h1 className="text-xl font-bold text-primary">طلب #{id}</h1>
    {documents.length>0&&<section className="space-y-2" aria-label="مستندات الطلب">{documents.map(document=><Link key={String(document.id)} href={`/account/invoices/${document.id}`} className="block rounded-lg border p-3 text-sm">عرض {document.number||'سجل العملية — بيانات الإصدار قيد المراجعة'}</Link>)}</section>}
    {order.status === 'paid' ? <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{config.text.confirmed}</p>
      : order.status === 'cancelled' ? <p>تم إلغاء الطلب قبل بدء الدفع.</p>
        : <p className="rounded-lg bg-amber-50 p-3">{attempt ? config.text.pending : config.text.unavailable}</p>}
    {feedback && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{feedback}</p>}
    <ul className="space-y-2">{items.map((item, index) => <li key={index} className="flex justify-between gap-4 border-b pb-2 text-sm"><span className="min-w-0">{item.title} × {item.quantity}<OrderVariantDetails value={item.variant_snapshot}/><small className="mt-1 block text-slate-600">سعر الوحدة {formatSar(item.unit_price_minor)} ر.س{item.list_unit_price_minor?` · قبل الخصم ${formatSar(item.list_unit_price_minor)} ر.س`:''}{item.discount_minor?` · الخصم ${formatSar(item.discount_minor)} ر.س`:''}</small></span><span className="shrink-0">{formatSar(item.total_minor)} ر.س</span></li>)}</ul>
    <p className="text-sm">التوصيل: {formatSar(order.shipping_fee_minor)} ر.س</p>
    <p className="text-lg font-bold">الإجمالي النهائي: {formatSar(order.total_minor)} ر.س</p>
    {tracking.length > 0 && <section aria-labelledby="shipment-tracking-title" className="space-y-3 border-t pt-4">
      <h2 id="shipment-tracking-title" className="font-bold">{trackingLabels[0]}</h2>
      <ul className="space-y-3">{tracking.map(shipment => <li key={shipment.id} className="rounded-lg border p-3 text-sm">
        <dl className="space-y-1">
          {shipment.carrier && <div><dt className="inline font-semibold">{trackingLabels[1]}: </dt><dd className="inline">{shipment.carrier}</dd></div>}
          {shipment.trackingNumber && <div><dt className="inline font-semibold">{trackingLabels[2]}: </dt><dd className="inline break-all" dir="ltr">{shipment.trackingNumber}</dd></div>}
          <div><dt className="inline font-semibold">{trackingLabels[3]}: </dt><dd className="inline">{shipment.status || shipment.fulfillmentStatus}</dd></div>
        </dl>
      </li>)}</ul>
    </section>}
    {canPay && <form action={payCommerceOrder} className="space-y-2">
      <input type="hidden" name="orderId" value={id} />
      <label className="block text-sm"><input type="checkbox" name="confirm" value="1" required /> أوافق على دفع إجمالي هذا الطلب.</label>
      <button className="rounded-lg bg-primary px-5 py-2 font-bold text-white">الدفع بالبطاقة عبر بوابة البنك</button>
    </form>}
    {!attempt && order.status === 'awaiting_payment' && <form action={cancelCommerceOrder}><input type="hidden" name="orderId" value={id} /><button className="rounded-lg border px-4 py-2 text-sm">إلغاء الطلب دون دفع</button></form>}
    {attempt && order.status === 'awaiting_payment' && <form action={checkCommercePayment}><input type="hidden" name="orderId" value={id} /><button className="rounded-lg border px-4 py-2 text-sm">التحقق من الدفع — دون خصم جديد</button></form>}
  </section>;
}
