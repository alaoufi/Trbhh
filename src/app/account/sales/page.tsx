import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { canMemberSellDirectly } from '@/lib/commerce/seller-types';
import { listMemberSoldOrders } from '@/lib/commerce/member-sell';
import { formatAddressLine } from '@/lib/commerce/addresses';
import { setSaleTrackingAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مبيعاتي', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const input = 'min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';

function shipInfo(shipping: unknown): { name: string; phone: string; line: string } {
  let s: Record<string, unknown> = {};
  try { s = (typeof shipping === 'string' ? JSON.parse(shipping) : shipping) as Record<string, unknown>; } catch { s = {}; }
  let line = '';
  try { line = formatAddressLine(s as never); } catch { line = String(s.city || ''); }
  return { name: String(s.fullName || ''), phone: String(s.phone || ''), line };
}

export default async function MySalesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const allowed = await canMemberSellDirectly(session.uid);
  const orders = allowed ? await listMemberSoldOrders(session.uid) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">مبيعاتي ({orders.length})</h1>
        <Link href="/account/ads" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">إعلاناتي ←</Link>
      </div>

      {sp.tracked === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">حُفظ تتبّع الشحن. {sp.wa === 'sent' ? 'وأُرسل واتساب للعميل.' : sp.wa === 'skipped' ? '(الواتساب غير مُفعّل حالياً — لم يُرسل.)' : sp.wa === 'failed' ? '(تعذّر إرسال الواتساب — تحقّق من إعداد الواتساب.)' : ''}</p>}
      {sp.error === 'not_paid' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">لا يُضاف التتبّع إلا لطلب مدفوع.</p>}
      {sp.error === 'invalid' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">أدخل شركة الشحن ورقم التتبّع.</p>}
      {sp.error === 'not_found' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">الطلب غير موجود ضمن مبيعاتك.</p>}

      {!allowed ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">البيع المباشر غير مُفعّل لحسابك. يُفعّله من الإدارة للأعضاء الموثوقين.</p>
      ) : !orders.length ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا مبيعات بعد. تظهر هنا طلباتك المدفوعة لتضيف شركة الشحن ورقم التتبّع.</p>
      ) : (
        <div className="space-y-3">
          {orders.map(o => {
            const info = shipInfo(o.shipping);
            const shipped = !!o.tracking_number;
            return (
              <div key={String(o.id)} className="card-3d rounded-xl p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-primary">طلب #{String(o.id)}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${shipped ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{shipped ? 'تم الشحن' : 'بانتظار الشحن'}</span>
                </div>
                <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>الإجمالي: <b className="text-primary">{sar(o.total_minor)}</b></div>
                  <div>العميل: {info.name || '—'}{info.phone ? ` · ${info.phone}` : ''}</div>
                  <div className="sm:col-span-2">عنوان الشحن: {info.line || '—'}</div>
                </div>
                {shipped ? (
                  <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">شركة الشحن: <b>{o.carrier}</b> · رقم التتبّع: <b dir="ltr">{o.tracking_number}</b></p>
                ) : (
                  <form action={setSaleTrackingAction} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input type="hidden" name="orderId" value={String(o.id)} />
                    <input name="carrier" required maxLength={120} placeholder="شركة الشحن" className={input} />
                    <input name="tracking" required maxLength={160} placeholder="رقم التتبّع" dir="ltr" className={input} />
                    <button className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white">حفظ وإرسال للعميل</button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
