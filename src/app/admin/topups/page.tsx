import Link from 'next/link';
import { HandCoins, Receipt, Clock, CheckCircle2, XCircle, User } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { listTopupsAdmin } from '@/lib/wallet';
import { mediaUrl } from '@/lib/media';
import { approveTopupAction, rejectTopupAction } from '../actions';
import { AdminPager } from '@/components/admin-pager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات شحن الرصيد' };

const TABS = [
  { key: 'pending', label: 'بانتظار التأكيد', cls: 'bg-amber-500' },
  { key: 'approved', label: 'تم التأكيد', cls: 'bg-emerald-600' },
  { key: 'rejected', label: 'مرفوض', cls: 'bg-red-500' },
  { key: 'all', label: 'الكل', cls: 'bg-slate-500' },
] as const;
type Tab = typeof TABS[number]['key'];
const STATUS_OF: Record<Tab, 'all' | 0 | 1 | 2> = { all: 'all', pending: 0, approved: 1, rejected: 2 };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const PAGE_SIZE = 20;

export default async function AdminTopups({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requireAction('users', 'edit');
  const { tab: tabRaw, page: pageRaw } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.key === tabRaw) ? tabRaw : 'pending') as Tab;
  const page = Math.max(1, parseInt(pageRaw || '1') || 1);
  const { rows, counts } = await listTopupsAdmin(STATUS_OF[tab], PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const countOf: Record<Tab, number> = { all: counts.all, pending: counts.pending, approved: counts.approved, rejected: counts.rejected };
  const pages = Math.max(1, Math.ceil(countOf[tab] / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">طلبات شحن الرصيد</h1>
      </div>
      <p className="text-sm text-muted-foreground">يرسل العضو المبلغ مع إيصال التحويل من «محفظتي». بعد تأكيد وصول المبلغ يُضاف لرصيده تلقائياً وتصله رسالة (نصوصها من «النصوص الظاهرة» ← المحفظة).</p>

      {/* تبويبات بحسب الحالة مع عدّاداتها */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary/40 p-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/topups?tab=${t.key}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === t.key ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-white/60'}`}>
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${t.cls}`}>{countOf[t.key]}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد طلبات في هذا التصنيف.</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card-3d space-y-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 pb-2">
              <Link href={`/users/${r.userId}`} className="flex items-center gap-1.5 font-bold text-primary hover:underline"><User className="h-4 w-4" /> {r.userName}</Link>
              <span className="text-xs text-muted-foreground">#{r.id} • {fmt(r.at)}</span>
              <span className="mr-auto text-lg font-extrabold text-primary">{r.amount} ر.س</span>
              {r.status === 0 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"><Clock className="h-3.5 w-3.5" /> بانتظار التأكيد</span>}
              {r.status === 1 && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> تم التأكيد{r.decidedAt ? ` • ${fmt(r.decidedAt)}` : ''}</span>}
              {r.status === 2 && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700"><XCircle className="h-3.5 w-3.5" /> مرفوض{r.decidedAt ? ` • ${fmt(r.decidedAt)}` : ''}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {r.receipt ? (
                <a href={mediaUrl(r.receipt)} target="_blank" className="flex items-center gap-1.5 rounded-lg border-2 border-primary/25 px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/5">
                  <Receipt className="h-4 w-4" /> عرض الإيصال
                </a>
              ) : (
                <span className="text-xs font-bold text-red-500">لا يوجد إيصال مرفق</span>
              )}
            </div>

            {r.status === 2 && r.note && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm font-bold text-red-700">سبب الرفض: {r.note}</div>
            )}

            {r.status === 0 && (
              <div className="space-y-2 border-t border-primary/10 pt-2">
                <form action={approveTopupAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button className="btn-3d w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white sm:w-auto">✓ تأكيد وصول المبلغ وإضافته للرصيد</button>
                </form>
                <details className="rounded-lg border border-red-200">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-red-600">رفض الطلب (مع سبب)…</summary>
                  <form action={rejectTopupAction} className="space-y-2 p-3">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea name="reason" rows={2} required placeholder="سبب الرفض — يُحفظ ويُرسل للعضو" className="w-full rounded-lg border border-red-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-red-300" />
                    <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">رفض وإرسال السبب للعضو</button>
                  </form>
                </details>
              </div>
            )}
          </div>
        ))}
      </div>

      <AdminPager basePath="/admin/topups" page={page} pages={pages} total={countOf[tab]} params={{ tab }} />
    </div>
  );
}
