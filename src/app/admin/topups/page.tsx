import Link from 'next/link';
import { HandCoins, Receipt, Clock, CheckCircle2, XCircle, User, ShieldAlert, Undo2 } from 'lucide-react';
import { requireAction } from '@/lib/roles';
import { listTopupsAdmin, findReceiptMatches } from '@/lib/wallet';
import { mediaUrl } from '@/lib/media';
import { approveTopupAction, rejectTopupAction, cancelTopupAction } from '../actions';
import { AdminPager } from '@/components/admin-pager';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات شحن الرصيد' };

const TABS = [
  { key: 'pending', label: 'قيد المعالجة', cls: 'bg-amber-500' },
  { key: 'approved', label: 'تم التأكيد', cls: 'bg-emerald-600' },
  { key: 'rejected', label: 'مرفوض', cls: 'bg-red-500' },
  { key: 'cancelled', label: 'ملغى بعد التأكيد', cls: 'bg-slate-700' },
  { key: 'all', label: 'الكل', cls: 'bg-slate-500' },
] as const;
type Tab = typeof TABS[number]['key'];
const STATUS_OF: Record<Tab, 'all' | 0 | 1 | 2 | 3> = { all: 'all', pending: 0, approved: 1, rejected: 2, cancelled: 3 };

function fmt(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

const PAGE_SIZE = 20;

export default async function AdminTopups({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string; check?: string; id?: string; batch?: string; a?: string; r?: string; p?: string; u?: string; tests?: string; count?: string }> }) {
  await requireAction('users', 'edit');
  const { tab: tabRaw, page: pageRaw, check, id: checkedId } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.key === tabRaw) ? tabRaw : 'pending') as Tab;
  const page = Math.max(1, parseInt(pageRaw || '1') || 1);
  const { rows, counts } = await listTopupsAdmin(STATUS_OF[tab], PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const countOf: Record<Tab, number> = { all: counts.all, pending: counts.pending, approved: counts.approved, rejected: counts.rejected, cancelled: counts.cancelled };
  // ⚠️ كشف السند المكرر: مقارنة بصمة إيصال كل طلب معلق مع كل الإيصالات السابقة
  const dupMatches = await findReceiptMatches(rows.filter((r) => r.status === 0 && r.receipt).map((r) => r.id)).catch(() => new Map());
  const visibleOnlinePending = rows.filter((r) => r.status === 0 && r.source === 'online');
  const pages = Math.max(1, Math.ceil(countOf[tab] / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <HandCoins className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">طلبات شحن الرصيد</h1>
      </div>
      <p className="text-sm text-muted-foreground">التحويل البنكي يعتمد يدوياً بعد مطابقة الإيصال. أمّا الدفع الإلكتروني فيُحسم آلياً من بوابة البنك فقط: نجاح موثّق يضيف الرصيد، ورفض موثّق يرفض العملية مع السبب. لا توجد موافقة أو رفض يدويان للدفع الإلكتروني.</p>

      {check === 'approved' && <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-900">✓ تم التحقق من البنك واعتماد عملية الدفع الإلكتروني #{checkedId}. أُضيف الرصيد تلقائياً.</div>}
      {check === 'rejected' && <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-900">✕ رفض البنك عملية الدفع الإلكتروني #{checkedId}. لم يُضف أي رصيد.</div>}
      {check === 'pending' && <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">⌛ لم تصل نتيجة نهائية من البنك لعملية #{checkedId} بعد؛ يعاد التحقق منها آلياً ولم يُضف أي رصيد.</div>}
      {(check === 'unresolved' || check === 'unavailable' || check === 'invalid') && <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-sm font-bold text-slate-800">تعذر تنفيذ التحقق لهذه العملية. لم يتغير الرصيد ولم يتم اعتماد الطلب يدوياً.</div>}

      {/* تبويبات بحسب الحالة مع عدّاداتها */}
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-secondary/40 p-1.5">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/topups?tab=${t.key}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold ${tab === t.key ? 'bg-primary text-white shadow' : 'text-muted-foreground hover:bg-white/60'}`}>
            {t.label}
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold text-white ${t.cls}`}>{countOf[t.key]}</span>
          </Link>
        ))}
      </div>

      {tab === 'pending' && visibleOnlinePending.length > 0 && (
        <div className="space-y-2 rounded-xl border-2 border-sky-300 bg-sky-50 p-3">
          <p className="text-sm font-bold text-sky-900">يوجد {visibleOnlinePending.length} دفع إلكتروني ظاهر قيد التحقق الآلي. هذه ليست طلبات موافقة للإدارة ولا يظهر لها زر اعتماد أو رفض؛ يقتصر دور الإدارة على المتابعة، وتُحسم تلقائياً من رد البنك النهائي.</p>
        </div>
      )}

      {rows.length === 0 && <p className="py-10 text-center text-muted-foreground">لا توجد طلبات في هذا التصنيف.</p>}

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.id} className="card-3d space-y-3 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-primary/10 pb-2">
              <Link href={`/users/${r.userId}`} className="flex items-center gap-1.5 font-bold text-primary hover:underline"><User className="h-4 w-4" /> {r.userName}</Link>
              <span className="text-xs text-muted-foreground">#{r.id} • {fmt(r.at)}</span>
              {r.source === 'online' && (
                <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">💳 دفع إلكتروني{r.provider ? ` • ${r.provider}` : ''}{r.method ? ` • ${r.method}` : ''}</span>
              )}
              <span className="mr-auto text-lg font-extrabold text-primary">{r.amount} ر.س</span>
              {r.status === 0 && <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800"><Clock className="h-3.5 w-3.5" /> {r.source === 'online' ? 'قيد التحقق الآلي' : 'بانتظار التأكيد'}</span>}
              {r.status === 1 && <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5" /> تم التأكيد{r.decidedAt ? ` • ${fmt(r.decidedAt)}` : ''}</span>}
              {r.status === 2 && <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700"><XCircle className="h-3.5 w-3.5" /> مرفوض{r.decidedAt ? ` • ${fmt(r.decidedAt)}` : ''}</span>}
              {r.status === 3 && <span className="flex items-center gap-1 rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-white"><Undo2 className="h-3.5 w-3.5" /> ملغى بعد التأكيد{r.decidedAt ? ` • ${fmt(r.decidedAt)}` : ''}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {r.receipt ? (
                <a href={mediaUrl(r.receipt)} target="_blank" className="flex items-center gap-1.5 rounded-lg border-2 border-primary/25 px-3 py-1.5 text-sm font-bold text-primary hover:bg-primary/5">
                  <Receipt className="h-4 w-4" /> عرض الإيصال
                </a>
              ) : r.source === 'online' ? (
                <span className="text-xs font-bold text-sky-600">دفع إلكتروني — لا يحتاج إيصالاً يدوياً</span>
              ) : (
                <span className="text-xs font-bold text-red-500">لا يوجد إيصال مرفق</span>
              )}
            </div>

            {r.status === 2 && r.note && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm font-bold text-red-700">سبب الرفض: {r.note}</div>
            )}
            {r.status === 3 && r.note && (
              <div className="rounded-lg border border-slate-300 bg-slate-100 p-2.5 text-sm font-bold text-slate-700">سبب الإلغاء (خُصم {r.amount} ر.س من رصيد العضو): {r.note}</div>
            )}

            {/* ⚠️ إنذار السند المكرر: يظهر قبل التأكيد مع عرض السندين جنباً إلى جنب للمطابقة المباشرة */}
            {r.status === 0 && dupMatches.has(r.id) && (() => { const m = dupMatches.get(r.id)!; return (
              <div className="space-y-2 rounded-xl border-2 border-red-400 bg-red-50 p-3">
                <div className="flex items-center gap-1.5 text-sm font-extrabold text-red-700">
                  <ShieldAlert className="h-4 w-4" /> هذا السند مطابق لسند سابق (نسبة التطابق {m.pct}٪) — تحقق قبل التأكيد!
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-red-800">
                  <span>الطلب المطابق: #{m.id}</span>
                  <Link href={`/users/${m.userId}`} className="underline">{m.userName}</Link>
                  <span>{m.amount} ر.س</span>
                  <span>{fmt(m.at)}</span>
                  <span className="rounded-full bg-white px-2 py-0.5">{m.status === 1 ? '✅ سبق تأكيده' : m.status === 0 ? '⏳ معلق أيضاً' : m.status === 3 ? '↩ ملغى' : '❌ مرفوض'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="mb-1 block text-center text-[11px] font-extrabold text-red-700">السند الجديد (هذا الطلب #{r.id})</span>
                    {r.receipt ? (
                      <a href={mediaUrl(r.receipt)} target="_blank" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(r.receipt)} alt="السند الجديد" className="max-h-64 w-full rounded-lg border-2 border-red-300 object-contain bg-white" />
                      </a>
                    ) : <span className="block text-center text-[11px] text-red-500">لا يوجد</span>}
                  </div>
                  <div>
                    <span className="mb-1 block text-center text-[11px] font-extrabold text-red-700">السند المطابق (طلب #{m.id})</span>
                    {m.receipt ? (
                      <a href={mediaUrl(m.receipt)} target="_blank" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(m.receipt)} alt="السند المطابق" className="max-h-64 w-full rounded-lg border-2 border-red-300 object-contain bg-white" />
                      </a>
                    ) : <span className="block text-center text-[11px] text-red-500">لا يوجد</span>}
                  </div>
                </div>
                <span className="block text-center text-[11px] font-bold text-red-700">اضغط أي سند لفتحه بالحجم الكامل في نافذة جديدة</span>
              </div>
            ); })()}

            {r.status === 1 && (
              <details className="rounded-lg border border-slate-300">
                <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-slate-700">↩ إلغاء التأكيد (سند مكرر/خطأ) — مع سبب…</summary>
                <form action={cancelTopupAction} className="space-y-2 p-3">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="reason" rows={2} required placeholder="سبب الإلغاء (إلزامي) — يُحفظ ويُرسل للعضو، مثال: إيصال مكرر سبق اعتماده في طلب #…" className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-slate-400" />
                  <ConfirmSubmit msg={`تأكيد إلغاء هذا الشحن؟ سيُخصم ${r.amount} ر.س من رصيد العضو فوراً (قد يصبح رصيده سالباً) ويصله سبب الإلغاء.`} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">إلغاء التأكيد وخصم المبلغ</ConfirmSubmit>
                </form>
              </details>
            )}

            {r.status === 0 && r.source === 'online' && <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-bold text-sky-800">هذه عملية إلكترونية قيد التحقق الآلي من البنك. لا تعتمد أو ترفض يدوياً، ولا يُضاف الرصيد إلا بعد نتيجة مصرفية ناجحة وموثقة.</div>}

            {r.status === 0 && r.source !== 'online' && (
              <div className="space-y-2 border-t border-primary/10 pt-2">
                <form action={approveTopupAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <ConfirmSubmit msg="تأكيد وصول المبلغ وإضافته لرصيد العضو فوراً؟" className="btn-3d w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white sm:w-auto">✓ تأكيد وصول المبلغ وإضافته للرصيد</ConfirmSubmit>
                </form>
                <details className="rounded-lg border border-red-200">
                  <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-red-600">رفض الطلب (مع سبب)…</summary>
                  <form action={rejectTopupAction} className="space-y-2 p-3">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea name="reason" rows={2} required defaultValue={dupMatches.has(r.id) ? 'رفض لتكرار رفع السند' : undefined} placeholder="سبب الرفض — يُحفظ ويُرسل للعضو" className="w-full rounded-lg border border-red-300 bg-white p-2 text-sm outline-none focus:ring-2 focus:ring-red-300" />
                    <ConfirmSubmit msg="تأكيد رفض طلب الشحن؟ سيصل العضو رسالة بالسبب المكتوب." className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">رفض وإرسال السبب للعضو</ConfirmSubmit>
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
