import Link from 'next/link';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { listOrders, countOrdersByStatus } from '@/lib/cj/orders/store';
import { STAGE_GROUPS, statusLabel, isException } from '@/lib/cj/orders/state';
import { cjOrderCapUsdMinor } from '@/lib/cj/orders/payment';
import { reconcileReport } from '@/lib/cj/orders/ledger';
import { getCjBalance } from '@/lib/cj/client';
import { getSetting } from '@/lib/settings';
import { createTestCjOrder, setCjOrderCap } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراقبة طلبات CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const usd = (m: number) => `$${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DEFAULT_TOPUP_URL = 'https://app.cjdropshipping.com/myCJ.html#/myCJWallet/recharge';

export default async function CjOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAccess('orders', 'view');
  const sp = await searchParams;
  const [counts, recent, capUsdMinor, topupUrl] = await Promise.all([
    countOrdersByStatus(), listOrders({ limit: 50 }), cjOrderCapUsdMinor(),
    getSetting('cj_wallet_topup_url', DEFAULT_TOPUP_URL).then((v) => v || DEFAULT_TOPUP_URL),
  ]);
  const stageCount = (statuses: readonly string[]) => statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  // رصيد CJ يُجلب فقط عند الطلب الصريح (?balance=1) تفادياً لحدّ المعدّل في كل تحميل.
  const balance = sp.balance === '1' ? await getCjBalance().catch(() => null) : null;
  // كشف الحركات الكامل غير متاح عبر واجهة الرصيد؛ المطابقة الداخلية تعتمد الدفتر، والرصيد الظاهر للمراجعة.
  const reconcile = await reconcileReport(null);

  return (
    <div className="space-y-4">
      <CjAdminNav current="orders" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">مراقبة طلبات CJ</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">تصفّح/استيراد</Link>
          <AccessBoundary module={'orders'} action={'create'}>
            <Link href="/admin/suppliers/cj/orders/new" className={btn}>تجربة شراء حقيقية</Link>
          </AccessBoundary>
          <AccessBoundary module={'orders'} action={'create'}>
            <form action={createTestCjOrder}><button className="rounded-lg border border-primary/30 px-4 py-2 text-sm font-bold text-primary">+ طلب اختبار (بلا CJ)</button></form>
          </AccessBoundary>
        </div>
      </div>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        بنية دورة الطلب — <b>الشراء العام معطّل</b>. «طلب اختبار» يُنشئ سجلاً داخلياً لتجربة تحرّك الحالات (لا اتصال بـ CJ). الدفع الحقيقي من محفظة CJ يتمّ من صفحة الطلب، بعد اعتماد الإدارة وضمن السقف، ومحجوب ما لم يُفعَّل الشراء الحيّ.
      </p>
      {sp.capset === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">تم حفظ سقف التكلفة.</p>}

      {/* المحفظة والمحاسبة والسقف */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className={card}>
          <h2 className="font-bold">محفظة CJ</h2>
          <p className="text-xs text-muted-foreground">الشحن يتمّ على موقع CJ الرسمي مباشرةً (لا شحن محفظة عبر API).</p>
          {balance?.ok ? (
            <ul className="text-sm" dir="ltr">
              <li>الرصيد: <b>{usd(Math.round(balance.data.amountUsd * 100))}</b></li>
              <li className="text-xs text-muted-foreground">مكافآت: {usd(Math.round(balance.data.bonusUsd * 100))} · مجمّد: {usd(Math.round(balance.data.frozenUsd * 100))}</li>
            </ul>
          ) : balance && !balance.ok ? <p className="text-xs text-red-700">تعذّر جلب الرصيد: {balance.error}</p> : <p className="text-xs text-muted-foreground">الرصيد يُجلب عند الطلب.</p>}
          <div className="flex flex-wrap gap-2 pt-1">
            <Link href="/admin/suppliers/cj/orders?balance=1" className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary">تحديث الرصيد</Link>
            <a href={topupUrl} target="_blank" rel="noreferrer" className={`${btn} text-xs`}>شحن محفظة CJ (الموقع الرسمي) ↗</a>
          </div>
        </div>

        <div className={card}>
          <h2 className="font-bold">سقف تكلفة الطلب</h2>
          <p className="text-xs text-muted-foreground">يُمنع أي خصم يتجاوز هذا السقف (بالدولار، عملة محفظة CJ).</p>
          <p className="text-lg font-extrabold text-primary" dir="ltr">{usd(capUsdMinor)}</p>
          <AccessBoundary module="orders" action="edit">
            <form action={setCjOrderCap} className="flex items-end gap-2">
              <label className="block text-xs">سقف جديد ($)<input name="capUsd" type="number" step="0.01" min="0" defaultValue={(capUsdMinor / 100).toFixed(2)} dir="ltr" className="mt-1 min-h-9 w-24 rounded-lg border border-primary/25 bg-white px-2 text-sm" /></label>
              <button className={`${btn} text-xs`}>حفظ</button>
            </form>
          </AccessBoundary>
        </div>

        <div className={card}>
          <h2 className="font-bold">المطابقة المحاسبية</h2>
          <ul className="text-sm" dir="ltr">
            <li>صافي الخصم (الدفتر): <b>{usd(reconcile.ledgerNetUsdMinor)}</b></li>
            <li className="text-xs text-muted-foreground">عدد القيود: {reconcile.entries.toLocaleString('en')}</li>
            {balance?.ok && <li className="text-xs text-muted-foreground">رصيد CJ الحالي: {usd(Math.round(balance.data.amountUsd * 100))}</li>}
          </ul>
          <p className="text-[11px] text-muted-foreground">المطابقة الدقيقة تتمّ بمقارنة قيود الدفتر بحركات كشف CJ الرسمي؛ الدفتر هو مصدر الحقيقة الداخلي.</p>
        </div>
      </div>

      {/* أعمدة المراحل */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGE_GROUPS.map((g) => {
          const n = stageCount(g.statuses);
          const issues = g.key === 'issues';
          return (
            <div key={g.key} className={`rounded-xl border p-3 text-center ${issues && n > 0 ? 'border-red-300 bg-red-50' : 'border-primary/20'}`}>
              <div className="text-xs font-bold text-muted-foreground">{g.title}</div>
              <div className={`text-2xl font-extrabold ${issues && n > 0 ? 'text-red-700' : 'text-primary'}`}>{n.toLocaleString('en')}</div>
            </div>
          );
        })}
      </div>

      {/* آخر الطلبات */}
      <div className={card}>
        <h2 className="font-bold">آخر الطلبات ({total.toLocaleString('en')})</h2>
        {!recent.length ? <p className="text-sm text-muted-foreground">لا طلبات بعد. أنشئ «طلب اختبار» لتجربة الدورة.</p> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-right text-xs"><thead className="bg-primary/5"><tr>{['#', 'المرجع', 'المنتج', 'الحالة', 'الإجمالي', 'التتبّع'].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
            {recent.map((o) => (
              <tr key={String(o.id)} className="border-t">
                <td className="p-2"><Link href={`/admin/suppliers/cj/orders/${o.id}`} className="font-bold text-primary hover:underline">{String(o.id)}</Link></td>
                <td className="p-2" dir="ltr">{o.internal_ref}</td>
                <td className="p-2">{o.product_name || '—'}</td>
                <td className="p-2"><span className={`rounded px-1.5 py-0.5 font-bold ${isException(o.status as never) ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-800'}`}>{statusLabel(o.status)}</span></td>
                <td className="p-2">{sar(o.grand_total_minor)}</td>
                <td className="p-2" dir="ltr">{o.tracking_number || '—'}</td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>
    </div>
  );
}
