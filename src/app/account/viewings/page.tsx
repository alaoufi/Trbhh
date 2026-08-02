import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Phone, MessageCircle, ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getOwnerViewings, ownerStageCounts, VIEWING_STATUS, DEAL_STAGES, DEAL_CANCELLED } from '@/lib/viewings';
import { setViewingStatusAction, setViewingNoteAction } from '@/app/ads/viewing-actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'متابعة الصفقات (CRM)' };

const STAGE_STYLE: Record<number, string> = {
  0: 'bg-amber-100 text-amber-800',
  1: 'bg-sky-100 text-sky-800',
  2: 'bg-indigo-100 text-indigo-800',
  3: 'bg-violet-100 text-violet-800',
  4: 'bg-teal-100 text-teal-800',
  5: 'bg-emerald-100 text-emerald-800',
  6: 'bg-secondary text-foreground/50',
};

export default async function ViewingsPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const sp = await searchParams;
  const stageParam = sp.stage;
  const stage = stageParam !== undefined && stageParam !== 'all' && /^[0-6]$/.test(stageParam) ? Number(stageParam) : undefined;
  const [rows, counts] = await Promise.all([
    getOwnerViewings(session.uid, stage),
    ownerStageCounts(session.uid),
  ]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const back = `/account/viewings${stageParam ? `?stage=${stageParam}` : ''}`;
  const waBase = (p: string) => `https://wa.me/${p.replace(/\D/g, '').replace(/^0/, '966')}`;
  const tabCls = (active: boolean) => `shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-primary text-white' : 'bg-secondary text-foreground/70 hover:text-primary'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary">
          <CalendarClock className="h-5 w-5" /> متابعة الصفقات (CRM)
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">من طلب المعاينة إلى إتمام الصفقة — تابع كل عميل عبر مراحل الصفقة، دوّن ملاحظاتك، وحدّث المرحلة.</p>
      </div>

      {/* مسار الصفقة */}
      <div className="flex flex-wrap items-center gap-1 rounded-xl bg-secondary/40 p-2 text-[11px] font-bold text-muted-foreground">
        {DEAL_STAGES.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`rounded-full px-2 py-0.5 ${STAGE_STYLE[s]}`}>{VIEWING_STATUS[s]}</span>
            {i < DEAL_STAGES.length - 1 && <ArrowLeft className="h-3 w-3" />}
          </span>
        ))}
      </div>

      {/* تبويبات التصفية بالمرحلة */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <Link href="/account/viewings" className={tabCls(stage === undefined)}>الكل ({total})</Link>
        {[...DEAL_STAGES, DEAL_CANCELLED].map((s) => (
          <Link key={s} href={`/account/viewings?stage=${s}`} className={tabCls(stage === s)}>
            {VIEWING_STATUS[s]} ({counts[s] || 0})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">
          {stage !== undefined ? 'لا توجد صفقات في هذه المرحلة.' : 'لا توجد طلبات بعد. تظهر هنا عندما يطلب مهتمّ معاينة أحد عقاراتك.'}
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => {
            const next = r.status < 5 ? r.status + 1 : null;
            return (
              <div key={r.id} className="card-3d rounded-2xl p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/ads/${r.adId}`} className="line-clamp-1 font-bold text-primary hover:underline">{r.adTitle}</Link>
                    <div className="mt-0.5 text-sm font-bold">{r.name} · <span dir="ltr" className="font-mono">{r.phone}</span></div>
                    {r.preferred && <div className="mt-0.5 text-xs text-muted-foreground">الوقت المفضّل: {r.preferred}</div>}
                    {r.message && <div className="mt-1 rounded-lg bg-secondary/50 p-2 text-xs">{r.message}</div>}
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STAGE_STYLE[r.status]}`}>{VIEWING_STATUS[r.status]}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary"><Phone className="h-3.5 w-3.5" /> اتصال</a>
                  <a href={waBase(r.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2.5 py-1.5 text-xs font-bold text-[#128C7E]"><MessageCircle className="h-3.5 w-3.5" /> واتساب</a>
                  {next !== null && (
                    <form action={setViewingStatusAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={next} />
                      <input type="hidden" name="back" value={back} />
                      <button className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-extrabold text-white hover:opacity-90">
                        {VIEWING_STATUS[next]} <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  )}
                  {/* اختيار مرحلة أي */}
                  <form action={setViewingStatusAction} className="inline flex items-center gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="back" value={back} />
                    <select name="status" defaultValue={r.status} className="h-8 rounded-lg border-2 border-primary/20 bg-white px-1.5 text-xs font-bold">
                      {[...DEAL_STAGES, DEAL_CANCELLED].map((s) => <option key={s} value={s}>{VIEWING_STATUS[s]}</option>)}
                    </select>
                    <button className="rounded-lg border-2 border-primary/20 px-2 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">تحديث</button>
                  </form>
                </div>

                {/* ملاحظة الوسيط الخاصة (CRM) */}
                <form action={setViewingNoteAction} className="mt-2.5 flex items-center gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="back" value={back} />
                  <input name="note" defaultValue={r.note || ''} maxLength={500} placeholder="ملاحظة خاصة (لا تظهر للعميل)…" className="h-9 flex-1 rounded-lg border-2 border-primary/20 bg-white px-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30" />
                  <button className="rounded-lg bg-secondary px-2.5 py-1.5 text-xs font-bold text-foreground/80 hover:bg-secondary/70">حفظ</button>
                </form>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
