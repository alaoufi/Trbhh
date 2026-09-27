import Link from 'next/link';
import { AccessBoundary } from '@/components/access-boundary';
import { requireAccess } from '@/lib/access-control/guards';
import { memberCommissionStatement } from '@/lib/commerce/commissions';
import { recordMemberPayoutAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'كشف عمولات الأعضاء', robots: { index: false, follow: false } };

const sar = (m: number) => `${(m / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
const input = 'min-h-10 w-full rounded-lg border border-primary/25 bg-white px-3 text-sm';

export default async function CommerceCommissionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAccess('settlements', 'view');
  const sp = await searchParams;
  const rows = await memberCommissionStatement();
  const totalBalance = rows.reduce((s, r) => s + r.balanceMinor, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-primary">كشف عمولات الأعضاء الموثوقين</h1>
        <Link href="/admin/commerce" className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm font-bold text-primary">تجارة تربح ←</Link>
      </div>
      {sp.paid === '1' && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">سُجّل التحويل «تم التحويل».</p>}
      {sp.error === 'payout' && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">تعذّر تسجيل التحويل. تحقّق من المبلغ.</p>}
      <p className="text-xs text-muted-foreground">المستحقّ = عمولة العضو في سلعه ضمن الطلبات المدفوعة. سجّل «تم التحويل» بعد سداد العضو لضبط الحسابات. الرصيد المتبقّي الإجمالي: <b className="text-primary">{sar(totalBalance)}</b>.</p>

      {!rows.length ? (
        <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground">لا عمولات مستحقّة بعد (تظهر بعد أول عملية بيع مدفوعة لسلع الأعضاء).</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-primary/15">
          <table className="w-full text-sm">
            <thead className="bg-primary/5 text-xs font-bold text-primary">
              <tr><th className="p-2 text-right">العضو</th><th className="p-2">المستحقّ</th><th className="p-2">المُحوَّل</th><th className="p-2">الرصيد</th><th className="p-2">تسجيل تحويل</th></tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={String(r.memberId)} className="border-t border-primary/10">
                  <td className="p-2"><Link href={`/admin/users/${r.memberId}`} className="font-bold text-primary hover:underline">{r.name}</Link> <span className="text-xs text-muted-foreground">#{String(r.memberId)}</span></td>
                  <td className="p-2 text-center">{sar(r.owedMinor)}</td>
                  <td className="p-2 text-center text-emerald-700">{sar(r.transferredMinor)}</td>
                  <td className="p-2 text-center font-extrabold text-primary">{sar(r.balanceMinor)}</td>
                  <td className="p-2">
                    <AccessBoundary module="settlements" action="create">
                      <form action={recordMemberPayoutAction} className="flex items-end gap-1">
                        <input type="hidden" name="memberId" value={String(r.memberId)} />
                        <input name="amountSar" inputMode="decimal" required placeholder="مبلغ" className={`${input} w-24`} defaultValue={r.balanceMinor > 0 ? (r.balanceMinor / 100).toFixed(2) : ''} />
                        <input name="note" maxLength={300} placeholder="ملاحظة (اختياري)" className={`${input} w-40`} />
                        <button className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white">تم التحويل</button>
                      </form>
                    </AccessBoundary>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
