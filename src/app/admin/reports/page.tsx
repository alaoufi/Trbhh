import Link from 'next/link';
import { Ban, Trash2, XCircle } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requirePerm } from '@/lib/roles';
import { resolveReportAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'البلاغات' };

const ACTION_LABEL: Record<string, string> = { ban: 'حُظر صاحب الإعلان', delete: 'حُذف الإعلان', dismiss: 'تم التجاهل (لا مخالفة)' };

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
  // member responses live in a column Prisma doesn't map → read raw (ignore if column not present yet)
  const respRows = await prisma.$queryRawUnsafe<{ id: bigint | number; response: string | null }[]>(
    `SELECT id, response FROM repord_ads ORDER BY id DESC LIMIT 100`,
  ).catch(() => []);
  const respById = new Map(respRows.map((r) => [toInt(r.id), r.response]));
  const pending = reports.filter((r) => r.status === 0);
  const resolved = reports.filter((r) => r.status !== 0);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-primary">بلاغات الإعلانات ({pending.length} بانتظار الإجراء)</h1>
      <p className="text-sm text-muted-foreground">كل بلاغ يجب أن يُغلق بإجراء: حظر صاحب الإعلان، حذف الإعلان، أو تجاهل البلاغ — يصل صاحب الإعلان رسالة عند الحظر/الحذف، ويصل المُبلِّغ رسالة تأكيد دائماً.</p>
      {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد بلاغات.</p>}
      <div className="space-y-2">
        {pending.map((r) => (
          <div key={toInt(r.id)} className="card-3d rounded-xl border-2 border-amber-300 p-3">
            <div className="flex items-center justify-between">
              <Link href={`/ads/${r.ads_id}`} className="font-medium hover:text-primary">{adById.get(r.ads_id) || `إعلان #${r.ads_id}`}</Link>
              <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
            </div>
            <div className="mt-1 text-sm"><span className="rounded bg-destructive/10 px-2 py-0.5 text-xs text-destructive">{reasonById.get(r.reason_id) || 'بلاغ'}</span> {r.comment && <span className="text-muted-foreground">— {r.comment}</span>}</div>
            <div className="mt-1 text-xs text-muted-foreground">المُبلِّغ: <Link href={`/admin/users/${r.user_id}`} className="text-primary hover:underline">عضو #{r.user_id}</Link></div>
            {respById.get(toInt(r.id)) && (
              <div className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-900"><b>ردّ صاحب الإعلان:</b> {respById.get(toInt(r.id))}</div>
            )}
            <form action={resolveReportAction} className="mt-3 flex flex-wrap gap-2">
              <input type="hidden" name="reportId" value={toInt(r.id)} />
              <ConfirmSubmit name="action" value="ban" msg="حظر صاحب هذا الإعلان؟ سيصله إشعار بالحظر، ويصل المُبلِّغ إشعار تأكيد." className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white hover:bg-destructive/90"><Ban className="h-3.5 w-3.5" /> حظر الناشر</ConfirmSubmit>
              <ConfirmSubmit name="action" value="delete" msg="حذف (أرشفة) هذا الإعلان؟ سيصل صاحبه إشعار بالإزالة، ويصل المُبلِّغ إشعار تأكيد." className="flex items-center gap-1 rounded-lg border-2 border-destructive px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> حذف الإعلان</ConfirmSubmit>
              <ConfirmSubmit name="action" value="dismiss" msg="تجاهل هذا البلاغ (لا مخالفة)؟ يصل المُبلِّغ إشعار بأنه رُوجع." className="flex items-center gap-1 rounded-lg border-2 border-primary/25 px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-secondary"><XCircle className="h-3.5 w-3.5" /> تجاهل</ConfirmSubmit>
            </form>
          </div>
        ))}
      </div>

      {resolved.length > 0 && (
        <div className="space-y-2 pt-2">
          <h2 className="text-sm font-bold text-muted-foreground">بلاغات مُعالَجة ({resolved.length})</h2>
          {resolved.map((r) => (
            <div key={toInt(r.id)} className="card-3d rounded-xl p-3 opacity-70">
              <div className="flex items-center justify-between">
                <Link href={`/ads/${r.ads_id}`} className="font-medium hover:text-primary">{adById.get(r.ads_id) || `إعلان #${r.ads_id}`}</Link>
                <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
              </div>
              <div className="mt-1 text-sm"><span className="rounded bg-secondary px-2 py-0.5 text-xs">{reasonById.get(r.reason_id) || 'بلاغ'}</span> {r.comment && <span className="text-muted-foreground">— {r.comment}</span>}</div>
              <div className="mt-1 text-xs font-bold text-emerald-700">✓ {ACTION_LABEL[r.action || ''] || 'عولج'}{r.handled_at ? ` — ${timeAgo(r.handled_at)}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
