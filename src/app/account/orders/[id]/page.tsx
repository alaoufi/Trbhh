import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCommerceConfig } from '@/lib/commerce/settings';
import { getCommerceGateway } from '@/lib/commerce/runtime';
import { formatSar } from '@/lib/commerce/money';
import { payCommerceOrder, cancelCommerceOrder, checkCommercePayment } from '../actions';

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
    prisma.$queryRaw<{ title: string; quantity: number; total_minor: number }[]>`SELECT title,quantity,total_minor FROM commerce_order_items WHERE order_id=${order.id} ORDER BY id`,
    prisma.$queryRaw<{ status: string }[]>`SELECT status FROM commerce_payment_attempts WHERE order_id=${order.id}`,
    getCommerceConfig(), getCommerceGateway(),
  ]);
  const attempt = attempts[0];
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
    {order.status === 'paid' ? <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{config.text.confirmed}</p>
      : order.status === 'cancelled' ? <p>تم إلغاء الطلب قبل بدء الدفع.</p>
        : <p className="rounded-lg bg-amber-50 p-3">{attempt ? config.text.pending : config.text.unavailable}</p>}
    {feedback && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">{feedback}</p>}
    <ul className="space-y-2">{items.map((item, index) => <li key={index} className="flex justify-between border-b pb-2 text-sm"><span>{item.title} × {item.quantity}</span><span>{formatSar(item.total_minor)} ر.س</span></li>)}</ul>
    <p className="text-sm">التوصيل: {formatSar(order.shipping_fee_minor)} ر.س</p>
    <p className="text-lg font-bold">الإجمالي النهائي: {formatSar(order.total_minor)} ر.س</p>
    {canPay && <form action={payCommerceOrder} className="space-y-2">
      <input type="hidden" name="orderId" value={id} />
      <label className="block text-sm"><input type="checkbox" name="confirm" value="1" required /> أوافق على دفع إجمالي هذا الطلب.</label>
      <button className="rounded-lg bg-primary px-5 py-2 font-bold text-white">الدفع بالبطاقة عبر بوابة البنك</button>
    </form>}
    {!attempt && order.status === 'awaiting_payment' && <form action={cancelCommerceOrder}><input type="hidden" name="orderId" value={id} /><button className="rounded-lg border px-4 py-2 text-sm">إلغاء الطلب دون دفع</button></form>}
    {attempt && order.status === 'awaiting_payment' && <form action={checkCommercePayment}><input type="hidden" name="orderId" value={id} /><button className="rounded-lg border px-4 py-2 text-sm">التحقق من الدفع — دون خصم جديد</button></form>}
  </section>;
}
