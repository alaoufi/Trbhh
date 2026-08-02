import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Phone, MessageCircle } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getOwnerViewings, VIEWING_STATUS } from '@/lib/viewings';
import { setViewingStatusAction } from '@/app/ads/viewing-actions';
import { SITE } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'طلبات المعاينة' };

const STATUS_STYLE: Record<number, string> = {
  0: 'bg-amber-100 text-amber-800',
  1: 'bg-sky-100 text-sky-800',
  2: 'bg-emerald-100 text-emerald-800',
  3: 'bg-secondary text-foreground/60',
};

export default async function ViewingsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const rows = await getOwnerViewings(session.uid);
  const waBase = (p: string) => `https://wa.me/${p.replace(/\D/g, '').replace(/^0/, '966')}`;
  const isNew = rows.filter((r) => r.status === 0).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary">
          <CalendarClock className="h-5 w-5" /> طلبات المعاينة الواردة
        </h1>
        {isNew > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{isNew} جديد</span>}
      </div>
      <p className="text-xs text-muted-foreground">طلبات معاينة عقاراتك من المهتمّين — تواصل معهم ورتّب المواعيد وحدّث حالة كل طلب.</p>

      {rows.length === 0 ? (
        <div className="card-3d rounded-2xl p-8 text-center text-sm text-muted-foreground">
          لا توجد طلبات معاينة بعد. تظهر هنا عندما يطلب مهتمّ معاينة أحد عقاراتك.
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.id} className="card-3d rounded-2xl p-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/ads/${r.adId}`} className="line-clamp-1 font-bold text-primary hover:underline">{r.adTitle}</Link>
                  <div className="mt-0.5 text-sm font-bold">{r.name} · <span dir="ltr" className="font-mono">{r.phone}</span></div>
                  {r.preferred && <div className="mt-0.5 text-xs text-muted-foreground">الوقت المفضّل: {r.preferred}</div>}
                  {r.message && <div className="mt-1 rounded-lg bg-secondary/50 p-2 text-xs">{r.message}</div>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_STYLE[r.status] || STATUS_STYLE[0]}`}>{VIEWING_STATUS[r.status]}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary"><Phone className="h-3.5 w-3.5" /> اتصال</a>
                <a href={waBase(r.phone)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#25D366]/10 px-2.5 py-1.5 text-xs font-bold text-[#128C7E]"><MessageCircle className="h-3.5 w-3.5" /> واتساب</a>
                {/* تحديث الحالة */}
                {([[1, 'تم التواصل'], [2, 'تمّت المعاينة'], [3, 'إغلاق']] as const).map(([st, label]) => (
                  r.status !== st ? (
                    <form key={st} action={setViewingStatusAction} className="inline">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value={st} />
                      <button className="rounded-lg border-2 border-primary/20 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/5">{label}</button>
                    </form>
                  ) : null
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-center text-[11px] text-muted-foreground">منصّة {SITE.name} — ربط عقاري متوافق مع نظام الوساطة.</p>
    </div>
  );
}
