import Link from 'next/link';
import { Flag, ArrowRight, ShieldAlert } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyAdReports, markSeen } from '@/lib/alerts';
import { timeAgo } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'البلاغات على إعلاناتي' };

export default async function MyReportsPage() {
  const session = await requireUser();
  const reports = await getMyAdReports(session.uid);
  await markSeen(session.uid, 'reports'); // opening the page clears the alert

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-bold text-primary">
          <Flag className="h-5 w-5" /> البلاغات على إعلاناتي
        </h1>
        <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
          <ArrowRight className="h-4 w-4" /> لوحة التحكم
        </Link>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>هذه البلاغات المقدّمة على إعلاناتك. <b>هوية المُبلِّغ سرّية</b> ولا تظهر إلا للإدارة. راجع إعلاناتك وتأكّد من مطابقتها للشروط.</p>
      </div>

      {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد بلاغات على إعلاناتك.</p>}

      <div className="space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="card-3d rounded-xl p-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/ads/${r.adId}`} className="min-w-0 flex-1 truncate font-medium text-primary hover:underline">{r.adTitle}</Link>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(r.at)}</span>
            </div>
            {r.reason && <div className="mt-1 text-sm text-destructive">السبب: {r.reason}</div>}
            {r.comment && <div className="mt-0.5 text-sm text-muted-foreground">«{r.comment}»</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
