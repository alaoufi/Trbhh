import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { Sparkles, ExternalLink, Eye, MousePointerClick, ArrowRight, Pencil } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { getClassifiedById, recordClassifiedView } from '@/lib/classified';
import { getClassifiedStatsAudience } from '@/lib/settings';
import { ClassifiedVisual, ClassifiedContact } from '@/components/classified-card';
import { DisclaimerBar } from '@/components/disclaimer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClassifiedById(Number(id));
  return { title: c?.title || c?.text?.slice(0, 40) || 'إعلان مبوّب' };
}

export default async function ClassifiedDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const numId = Number(id);
  const c = Number.isFinite(numId) ? await getClassifiedById(numId).catch(() => null) : null;
  if (!c) notFound();

  const session = await getSession().catch(() => null);
  const admin = session ? await hasAnyAdmin(session.uid).catch(() => false) : false;
  const isOwner = !!session && c.userId === session.uid;
  // who may see stats is controlled from the admin control panel
  const audience = await getClassifiedStatsAudience().catch(() => 'owner' as const);
  const canSeeStats = audience === 'all' ? true : audience === 'admin' ? admin : (isOwner || admin);

  // record a unique view (not counted for the owner)
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  if (viewerKey && !isOwner) {
    await recordClassifiedView(c.id, viewerKey).catch(() => {});
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Link href="/classified" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowRight className="h-4 w-4" /> كل الإعلانات المبوّبة
      </Link>

      <div className="card-3d overflow-hidden rounded-2xl">
        {c.link ? (
          // الضغط على الإعلان المكبّر ينتقل إلى الرابط (ويُحتسب كنقرة)
          <a href={`/classified/${c.id}/go`} className="block">
            <ClassifiedVisual c={c} big />
          </a>
        ) : (
          <ClassifiedVisual c={c} big />
        )}
        <ClassifiedContact c={c} />
      </div>

      {c.link && (
        <a href={`/classified/${c.id}/go`} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white">
          <ExternalLink className="h-5 w-5" /> زيارة الرابط
        </a>
      )}

      {/* الإحصائيات — تظهر للمعلن والإدارة فقط */}
      {canSeeStats && (
        <div className="space-y-2 rounded-xl border border-primary/20 bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Sparkles className="h-4 w-4" /> إحصائيات الإعلان {audience === 'all' ? '' : isOwner ? '(تظهر لك وللإدارة)' : '(عرض إداري)'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-white p-3">
              <Eye className="h-5 w-5 text-primary" />
              <div><div className="text-lg font-bold">{new Intl.NumberFormat('ar-SA').format(c.views)}</div><div className="text-xs text-muted-foreground">مشاهدة</div></div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white p-3">
              <MousePointerClick className="h-5 w-5 text-primary" />
              <div><div className="text-lg font-bold">{new Intl.NumberFormat('ar-SA').format(c.clicks)}</div><div className="text-xs text-muted-foreground">نقرة على الرابط</div></div>
            </div>
          </div>
          {isOwner && (
            <Link href={`/classified/${c.id}/edit`} className="flex items-center justify-center gap-1 rounded-lg border border-primary/30 py-2 text-sm font-medium text-primary hover:bg-accent">
              <Pencil className="h-4 w-4" /> تعديل الإعلان
            </Link>
          )}
        </div>
      )}

      <DisclaimerBar />
    </div>
  );
}
