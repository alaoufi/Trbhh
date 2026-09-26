import Link from 'next/link';
import { CjAdminNav } from '@/components/cj/admin-nav';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { listOrders, countOrdersByStatus } from '@/lib/cj/orders/store';
import { STAGE_GROUPS, statusLabel, isException } from '@/lib/cj/orders/state';
import { createTestCjOrder } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'مراقبة طلبات CJ', robots: { index: false, follow: false } };

const card = 'card-3d rounded-xl p-4 space-y-2';
const btn = 'rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white';
const sar = (m: number) => `${(m / 100).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

export default async function CjOrdersPage() {
  await requireAccess('orders', 'view');
  const [counts, recent] = await Promise.all([countOrdersByStatus(), listOrders({ limit: 50 })]);
  const stageCount = (statuses: readonly string[]) => statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <CjAdminNav current="orders" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">مراقبة طلبات CJ</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/suppliers/cj/browse" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">تصفّح/استيراد</Link>
          <AccessBoundary module={'orders'} action={'create'}>
            <form action={createTestCjOrder}><button className={btn}>+ طلب اختبار</button></form>
          </AccessBoundary>
        </div>
      </div>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
        بنية دورة الطلب — <b>الشراء الحقيقي معطّل</b>. «طلب اختبار» يُنشئ سجلاً داخلياً لتجربة تحرّك الحالات فقط (لا اتصال بـ CJ ولا دفع).
      </p>

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
