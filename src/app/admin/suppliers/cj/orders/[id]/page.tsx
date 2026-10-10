import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessBoundary } from '@/components/access-boundary';
import { hasAccess, requireAccess } from '@/lib/access-control/guards';
import { getOrderById, listOrderEvents } from '@/lib/cj/orders/store';
import { nextStatuses, statusLabel, customerStatusLabel, isException, isStatus } from '@/lib/cj/orders/state';
import { parseOrderLines } from '@/lib/cj/orders/store';
import { canDispatch } from '@/lib/cj/orders/dispatch';
import { listOrderLedger } from '@/lib/cj/orders/ledger';
import { cjOrderCapUsdMinor } from '@/lib/cj/orders/payment';
import { advanceCjOrder, setCjOrderTracking, dispatchCjOrderToSupplier, approveAndPayCjOrder } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلب CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';
const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const dt = (d: Date | null) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) : '—');

export default async function CjOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAccess('orders', 'view');
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getOrderById(id);
  if (!order) notFound();
  const events = await listOrderEvents(id);
  const canRefund = await hasAccess(session.uid, 'orders', 'refund');
  const nexts = isStatus(order.status) ? nextStatuses(order.status).filter(status => status !== 'refunded' || canRefund) : [];
  const orderLines = parseOrderLines(order.cj_lines_json);
  const dispatchable = canDispatch(order.status) && !order.cj_order_id && orderLines.length > 0;
  const ledger = await listOrderLedger(id);
  const capUsdMinor = order.approved_cap_usd_minor || (await cjOrderCapUsdMinor());
  const { getSetting } = await import('@/lib/settings');
  const topupUrl = (await getSetting('cj_wallet_topup_url', 'https://app.cjdropshipping.com/myCJ.html#/myCJWallet/recharge').catch(() => '')) || 'https://app.cjdropshipping.com/myCJ.html#/myCJWallet/recharge';
  const usd = (m: number) => `$${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const canPay = !order.paid_at && orderLines.length > 0 && (order.status === 'awaiting_payment' || order.status === 'awaiting_approval' || order.status === 'needs_action');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">طلب #{String(order.id)}</h1>
        <Link href="/admin/suppliers/cj/orders" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">لوحة المراقبة ←</Link>
      </div>
      {/* ===== معاينة العميل: نسخة طبق الأصل مما يراه العميل — أسعار ودفع تربح فقط، بلا أي ذكر لمورّد ===== */}
      <section className="card-3d space-y-3 rounded-xl p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-primary">معاينة العميل</h2>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">هكذا يراها العميل تماماً</span>
        </div>
        <p className="text-xs text-muted-foreground">نسخة مطابقة لِما يظهر للعميل في «طلباتي»: الأسعار والدفع عبر بوابة تربح (الراجحي) فقط، بلا أي ذكر للمورّد. العميل لا يدخل هذه الصفحة — هي للتجربة والمطابقة قبل التفعيل.</p>
        <div className="rounded-xl border border-primary/15 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold text-primary">طلب #{String(order.id)}</h3>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-sm font-bold text-emerald-800">{customerStatusLabel(order.status)}</span>
          </div>
          {order.status === 'cancelled'
            ? <p className="rounded-lg bg-slate-50 p-3 text-sm">تم إلغاء الطلب.</p>
            : (order.status === 'delivered' || order.status === 'completed')
              ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">تم تسليم طلبك بنجاح.</p>
              : <p className="rounded-lg bg-amber-50 p-3 text-sm">طلبك قيد المعالجة، وسيتم تحديث حالته تباعاً.</p>}
          <div className="flex justify-between gap-4 border-b pb-2 text-sm">
            <span className="min-w-0">{order.product_name || 'منتج'}{orderLines.length > 0 ? ` × ${orderLines.reduce((n, l) => n + l.quantity, 0)}` : ''}</span>
            <span className="shrink-0">{sar(order.items_total_minor)}</span>
          </div>
          <p className="text-sm">التوصيل: {sar(order.shipping_total_minor)}</p>
          {order.tax_total_minor > 0 && <p className="text-sm">الضريبة: {sar(order.tax_total_minor)}</p>}
          <p className="text-lg font-bold">الإجمالي النهائي: {sar(order.grand_total_minor)}</p>
          {(order.carrier || order.tracking_number) && <div className="border-t pt-2 text-sm">
            <div className="font-bold">تتبع الشحن</div>
            <div>شركة الشحن: {order.carrier || '—'} · رقم التتبع: <span dir="ltr">{order.tracking_number || '—'}</span></div>
          </div>}
          <button type="button" disabled className="w-full cursor-not-allowed rounded-lg bg-primary px-5 py-2 font-bold text-white opacity-60">الدفع بالبطاقة عبر بوابة البنك</button>
          <p className="text-center text-[11px] text-muted-foreground">زر الدفع الفعلي للعميل عبر بوابة الراجحي — معطّل في المعاينة فقط.</p>
        </div>
      </section>

      {/* ===== الإجراءات الداخلية (إدارة فقط) — لا يراها العميل إطلاقاً ===== */}
      <details open className="group/i card-3d rounded-xl p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
          <span className="font-bold text-primary">الإجراءات الداخلية (إدارة فقط — لا يراها العميل)</span>
          <span className="text-xs text-muted-foreground">▾</span>
        </summary>
        <div className="mt-3 space-y-4">
      {sp.moved === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم تغيير الحالة.</p>}
      {sp.tracked === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم تحديث التتبّع.</p>}
      {sp.created === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">أُنشئ الطلب بعد تحقّق حيّ. الخطوة التالية: «اعتماد ودفع» من لوحة الدفع أدناه (ضمن السقف)، ثم يُتابَع حتى التسليم.</p>}
      {sp.sent === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">أُرسل الطلب إلى المورد.</p>}
      {sp.senderr === 'blocked' && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">الشراء الحيّ غير مفعّل — الطلب جاهز للإرسال، ولن يُرسَل فعلياً للمورد إلا بعد التفعيل اليدوي. لم يحدث أي خصم أو شراء.</p>}
      {typeof sp.senderr === 'string' && sp.senderr !== 'blocked' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الإرسال: {sp.senderr === 'not_ready' ? 'الطلب ليس بحالة مؤكَّدة الدفع بعد' : sp.senderr === 'no_lines' ? 'لا توجد بنود قابلة للإرسال' : sp.senderr}</p>}
      {typeof sp.err === 'string' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الانتقال: {sp.err === 'invalid_transition' ? 'انتقال غير مسموح من الحالة الحالية' : sp.err}</p>}
      {sp.paid === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تمّ الدفع من محفظة CJ بنجاح. سُجّل القيد المحاسبي.</p>}
      {sp.paid === 'already' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">الطلب مدفوع مسبقاً — لم يُكرَّر الخصم.</p>}
      {sp.payerr === 'over_cap' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">المبلغ الفعلي من CJ ({sp.amount ? usd(Number(sp.amount)) : ''}) تجاوز السقف المعتمَد ({sp.cap ? usd(Number(sp.cap)) : ''}) — مُنع الخصم. ارفع السقف أو راجع الطلب.</p>}
      {sp.payerr === 'blocked' && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">الشراء الحيّ غير مفعّل — اعتُمد الطلب ولن يُخصَم شيء حتى التفعيل اليدوي (مفتاح الشراء + SUPPLIER_ALLOW_LIVE_ORDERS).</p>}
      {sp.payerr === 'no_amount' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">لم يُعِد CJ مبلغاً فعلياً — مُنع الدفع حتى التحقق (لا دفع بمبلغ غير متحقق منه).</p>}
      {sp.payerr === 'cj_create_error' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر إنشاء الطلب لدى CJ — راجع الخط الزمني. لم يحدث خصم.</p>}
      {sp.payerr === 'pay_error' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الدفع من محفظة CJ — راجع الخط الزمني.</p>}
      {sp.payerr === 'no_lines' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">لا بنود للطلب — تعذّر الدفع.</p>}
      {sp.payerr === 'confirm_required' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">يلزم تأكيد الدفع صراحةً.</p>}
      {sp.payerr === 'pay_in_progress' && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">هناك محاولة دفع قائمة على هذا الطلب — مُنع الخصم المكرّر. حدّث الصفحة بعد لحظات للتأكد من النتيجة.</p>}
      {sp.payerr === 'insufficient_balance' && <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
        <p>رصيد محفظة CJ غير كافٍ — لم يُخصم شيء ولم يُكرَّر الطلب. المستحق: <b dir="ltr">{sp.amount ? usd(Number(sp.amount)) : '—'}</b> · الرصيد: <b dir="ltr">{sp.bal ? usd(Number(sp.bal)) : '—'}</b> · الفرق: <b dir="ltr">{sp.amount && sp.bal ? usd(Number(sp.amount) - Number(sp.bal)) : '—'}</b></p>
        <a href={topupUrl} target="_blank" rel="noreferrer" className={`${btn} inline-block text-xs`}>شحن محفظة CJ (الموقع الرسمي) ↗</a>
        <p className="text-xs">بعد الشحن، عُد لهذه الصفحة واضغط «اعتماد ودفع» على نفس الطلب — سيُعاد فحص الرصيد والمبلغ قبل الخصم.</p>
      </div>}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ملخّص الطلب */}
        <div className={card}>
          <h2 className="font-bold">الملخّص</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">الحالة:</span>
            <span className={`rounded px-2 py-0.5 text-sm font-bold ${isException(order.status as never) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>{statusLabel(order.status)}</span>
          </div>
          <ul className="grid gap-1 text-sm">
            <li dir="ltr" className="text-xs text-muted-foreground">المرجع: {order.internal_ref}</li>
            <li>المنتج: {order.product_name || '—'} {order.cj_product_id && <span dir="ltr" className="text-xs text-muted-foreground">(PID {order.cj_product_id})</span>}</li>
            <li>السلع: {sar(order.items_total_minor)} · الشحن: {sar(order.shipping_total_minor)} · الضريبة: {sar(order.tax_total_minor)}</li>
            <li className="font-bold text-primary">الإجمالي: {sar(order.grand_total_minor)}</li>
            <li className="text-xs text-muted-foreground">أُرسل للمورد: {dt(order.placed_at)} · سُلّم: {dt(order.delivered_at)}</li>
            {order.cj_order_id && <li className="text-xs text-muted-foreground" dir="ltr">معرّف طلب المورد: {order.cj_order_id}</li>}
            {orderLines.length > 0 && <li className="text-xs text-muted-foreground">بنود الإرسال: {orderLines.length} · {orderLines.reduce((n, l) => n + l.quantity, 0)} قطعة</li>}
          </ul>
          <div className="border-t pt-2 text-sm">
            <div className="font-bold">التتبّع</div>
            <div>شركة الشحن: {order.carrier || '—'} · رقم: <span dir="ltr">{order.tracking_number || '—'}</span></div>
            {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">رابط التتبّع</a>}
          </div>
        </div>

        {/* الدفع والاعتماد — الطبقة المالية */}
        <div className={card}>
          <h2 className="font-bold">الدفع من محفظة CJ</h2>
          <ul className="grid gap-1 text-sm">
            <li>حالة الدفع: {order.paid_at ? <span className="font-bold text-emerald-700">مدفوع · {dt(order.paid_at)}</span> : <span className="font-bold text-amber-700">غير مدفوع</span>}</li>
            <li>المبلغ الفعلي من CJ: <span className="font-bold" dir="ltr">{order.actual_payment_usd_minor ? usd(order.actual_payment_usd_minor) : '—'}</span></li>
            <li>السقف المعتمَد: <span dir="ltr">{usd(capUsdMinor)}</span></li>
            <li className="text-xs text-muted-foreground">التحقق: {order.verified_source || '—'} · {dt(order.verified_at)}</li>
            {order.approved_at && <li className="text-xs text-muted-foreground">اعتُمد: {dt(order.approved_at)}{order.approved_by ? ` · بواسطة #${String(order.approved_by)}` : ''}</li>}
            {order.cj_shipment_order_id && <li className="text-xs text-muted-foreground" dir="ltr">shipmentOrderId: {order.cj_shipment_order_id}</li>}
          </ul>
          {canPay ? (
            <AccessBoundary module="orders" action="edit"><form action={approveAndPayCjOrder} className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-2">
              <input type="hidden" name="id" value={String(order.id)} />
              <p className="text-sm font-bold text-red-800">اعتماد ودفع من محفظة CJ</p>
              <p className="text-xs text-red-700">يُنشئ الطلب لدى CJ (بلا خصم) لمعرفة المبلغ الفعلي، ثم يتحقّق من السقف ويخصم من المحفظة. محجوب ما لم يُفعَّل الشراء الحيّ.</p>
              <label className="block text-xs">سقف هذه العملية (دولار، اختياري للتجربة)<input className={input} name="capUsd" type="number" step="0.01" min="0" placeholder={`${(capUsdMinor / 100).toFixed(2)}`} dir="ltr" /></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="confirm" value="pay" required /> أؤكّد الخصم من محفظة CJ</label>
              <button className={`${btn} bg-red-600`}>اعتماد ودفع</button>
            </form></AccessBoundary>
          ) : order.paid_at ? <p className="text-xs text-emerald-700">تمّ الدفع — لا يُعاد الخصم (حماية التكرار).</p> : <p className="text-xs text-muted-foreground">الدفع متاح من حالات: بانتظار الدفع/الموافقة أو «يحتاج تدخّلاً».</p>}
          <div className="border-t pt-2">
            <div className="text-sm font-bold">الدفتر المحاسبي ({ledger.length})</div>
            {!ledger.length ? <p className="text-xs text-muted-foreground">لا قيود.</p> : (
              <ul className="space-y-1 text-xs">
                {ledger.map((l) => (
                  <li key={String(l.id)} className="flex items-center justify-between gap-2 border-b pb-1">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 font-bold text-primary">{l.entry_type}</span>
                    <span dir="ltr" className="font-bold">{usd(l.amount_usd_minor)}</span>
                    <span className="text-muted-foreground" dir="ltr">{dt(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* أدوات الاختبار (تحريك الحالة/التتبّع) */}
          <div className={card}>
            <h2 className="font-bold">أدوات (اختبار الدورة — بلا شراء)</h2>
            {dispatchable && (
              <AccessBoundary module="orders" action="edit"><form action={dispatchCjOrderToSupplier} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
                <input type="hidden" name="id" value={String(order.id)} />
                <p className="text-sm font-bold text-amber-900">إرسال الطلب إلى المورد</p>
                <p className="text-xs text-amber-800">يُرسَل الطلب فعلياً فقط عند تفعيل الشراء الحيّ؛ وإلا يُسجَّل «جاهز للإرسال» بلا أي خصم أو شراء.</p>
                <button className={btn}>إرسال إلى المورد</button>
              </form></AccessBoundary>
            )}
            {nexts.length ? (
              <AccessBoundary module="orders" action="edit"><form action={advanceCjOrder} className="space-y-2">
                <input type="hidden" name="id" value={String(order.id)} />
                <label className="block text-sm">الانتقال إلى
                  <select name="to" className={input} defaultValue={nexts[0]}>
                    {nexts.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </label>
                <label className="block text-sm">السبب/ملاحظة<input className={input} name="reason" placeholder="اختياري" /></label>
                <button className={btn}>تغيير الحالة</button>
              </form></AccessBoundary>
            ) : <p className="text-sm text-muted-foreground">لا انتقالات متاحة (حالة نهائية).</p>}
            <AccessBoundary module="shipping"><AccessBoundary module="shipping" action="edit"><form action={setCjOrderTracking} className="space-y-2 border-t pt-2">
              <input type="hidden" name="id" value={String(order.id)} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">شركة الشحن<input className={input} name="carrier" defaultValue={order.carrier} /></label>
                <label className="block text-sm">رقم التتبّع<input className={input} name="trackingNumber" defaultValue={order.tracking_number} dir="ltr" /></label>
              </div>
              <label className="block text-sm">رابط التتبّع<input className={input} name="trackingUrl" defaultValue={order.tracking_url} dir="ltr" placeholder="https://…" /></label>
              <button className={btn}>حفظ التتبّع</button>
            </form></AccessBoundary></AccessBoundary>
          </div>
      </div>

      {/* الخط الزمني */}
      <div className={card}>
        <h2 className="font-bold">الخط الزمني ({events.length})</h2>
        {!events.length ? <p className="text-sm text-muted-foreground">لا أحداث.</p> : (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={String(e.id)} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm">
                <span className="text-xs text-muted-foreground" dir="ltr">{dt(e.created_at)}</span>
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{e.type}</span>
                {e.to_status && <span className="text-xs">{e.from_status ? `${statusLabel(e.from_status)} ← ` : ''}{statusLabel(e.to_status)}</span>}
                {e.note && <span className="text-muted-foreground">{e.note}</span>}
                <span className="text-[10px] text-muted-foreground">[{e.source}]</span>
              </li>
            ))}
          </ol>
        )}
      </div>
        </div>
      </details>
    </div>
  );
}
