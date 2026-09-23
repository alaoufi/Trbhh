import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { getOrderById, listOrderEvents } from '@/lib/cj/orders/store';
import { nextStatuses, statusLabel, isException, isStatus } from '@/lib/cj/orders/state';
import { advanceCjOrder, setCjOrderTracking } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلب CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const input = 'mt-1 min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';
const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const dt = (d: Date | null) => (d ? new Date(d).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh' }) : '—');

export default async function CjOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('integrations', 'view');
  const { id: idStr } = await params;
  const sp = await searchParams;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getOrderById(id);
  if (!order) notFound();
  const events = await listOrderEvents(id);
  const nexts = isStatus(order.status) ? nextStatuses(order.status) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">طلب #{String(order.id)}</h1>
        <Link href="/admin/suppliers/cj/orders" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">لوحة المراقبة ←</Link>
      </div>
      {sp.moved === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم تغيير الحالة.</p>}
      {sp.tracked === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم تحديث التتبّع.</p>}
      {typeof sp.err === 'string' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر الانتقال: {sp.err === 'invalid_transition' ? 'انتقال غير مسموح من الحالة الحالية' : sp.err}</p>}

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
          </ul>
          <div className="border-t pt-2 text-sm">
            <div className="font-bold">التتبّع</div>
            <div>شركة الشحن: {order.carrier || '—'} · رقم: <span dir="ltr">{order.tracking_number || '—'}</span></div>
            {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="text-primary underline" dir="ltr">رابط التتبّع</a>}
          </div>
        </div>

        {/* أدوات الاختبار (تحريك الحالة/التتبّع) */}
        <AccessBoundary module={'integrations'} action={'manage_settings'}>
          <div className={card}>
            <h2 className="font-bold">أدوات (اختبار الدورة — بلا شراء)</h2>
            {nexts.length ? (
              <form action={advanceCjOrder} className="space-y-2">
                <input type="hidden" name="id" value={String(order.id)} />
                <label className="block text-sm">الانتقال إلى
                  <select name="to" className={input} defaultValue={nexts[0]}>
                    {nexts.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </label>
                <label className="block text-sm">السبب/ملاحظة<input className={input} name="reason" placeholder="اختياري" /></label>
                <button className={btn}>تغيير الحالة</button>
              </form>
            ) : <p className="text-sm text-muted-foreground">لا انتقالات متاحة (حالة نهائية).</p>}
            <form action={setCjOrderTracking} className="space-y-2 border-t pt-2">
              <input type="hidden" name="id" value={String(order.id)} />
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm">شركة الشحن<input className={input} name="carrier" defaultValue={order.carrier} /></label>
                <label className="block text-sm">رقم التتبّع<input className={input} name="trackingNumber" defaultValue={order.tracking_number} dir="ltr" /></label>
              </div>
              <label className="block text-sm">رابط التتبّع<input className={input} name="trackingUrl" defaultValue={order.tracking_url} dir="ltr" placeholder="https://…" /></label>
              <button className={btn}>حفظ التتبّع</button>
            </form>
          </div>
        </AccessBoundary>
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
  );
}
