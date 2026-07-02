import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requirePerm } from '@/lib/roles';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'البلاغات' };

export default async function AdminReports() {
  await requirePerm('reports');
  const reports = await prisma.repord_ads.findMany({ orderBy: { id: 'desc' }, take: 100 });
  const reasonIds = [...new Set(reports.map((r) => r.reason_id))].map((n) => BigInt(n));
  const adIds = [...new Set(reports.map((r) => BigInt(r.ads_id)))];
  const [reasons, ads] = await Promise.all([
    reasonIds.length ? prisma.report_resons.findMany({ where: { id: { in: reasonIds } } }) : [],
    adIds.length ? prisma.ads.findMany({ where: { id: { in: adIds } }, select: { id: true, title: true } }) : [],
  ]);
  const reasonById = new Map(reasons.map((r) => [toInt(r.id), r.reason]));
  const adById = new Map(ads.map((a) => [toInt(a.id), a.title]));
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">بلاغات الإعلانات ({reports.length})</h1>
      {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد بلاغات.</p>}
      <div className="space-y-2">
        {reports.map((r) => (
          <div key={toInt(r.id)} className="card-3d rounded-xl p-3">
            <div className="flex items-center justify-between">
              <Link href={`/ads/${r.ads_id}`} className="font-medium hover:text-primary">{adById.get(r.ads_id) || `إعلان #${r.ads_id}`}</Link>
              <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <div className="mt-1 text-sm"><span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{reasonById.get(r.reason_id) || 'بلاغ'}</span> {r.comment && <span className="text-muted-foreground">— {r.comment}</span>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
