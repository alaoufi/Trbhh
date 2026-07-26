import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { Sparkles, ExternalLink, Eye, MousePointerClick, ArrowRight, Pencil, Trash2, Pause, Play } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { getClassifiedById, recordClassifiedView, getClassifiedOwnerState } from '@/lib/classified';
import { getClassifiedStatsAudience, getClassifiedLifetimeDays } from '@/lib/settings';
import { ClassifiedVisual, ClassifiedContact } from '@/components/classified-card';
import { ShareButtons } from '@/components/share-buttons';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { SITE } from '@/lib/constants';
import { toggleClassifiedStatusAction, deleteClassifiedFromDetailAction } from '@/app/classified/actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getClassifiedById(Number(id));
  const title = c?.title || c?.text?.slice(0, 40) || 'إعلان مبوّب';
  const desc = 'الإعلانات المبوّبة .. منصة تربح الإعلانية';
  const url = `https://${SITE.domain}/classified/${Number(id)}`;
  // صورة الإعلان في معاينة الرابط (واتساب/تويتر/فيسبوك) — تظهر تلقائياً عند مشاركة الرابط
  const images = c?.image ? [c.image] : undefined;
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title, description: desc, url, images },
    twitter: { card: 'summary_large_image' as const, title, description: desc, images },
  };
}

export default async function ClassifiedDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const numId = Number(id);
  const c = Number.isFinite(numId) ? await getClassifiedById(numId).catch(() => null) : null;
  if (!c) notFound();

  const session = await getSession().catch(() => null);
  const admin = session ? await hasAnyAdmin(session.uid).catch(() => false) : false;
  const isOwner = !!session && c.userId === session.uid;
  // حالة الإعلان (ظاهر/موقوف) — تلزم لأزرار الإجراءات (المالك/الإدارة فقط)
  const ownerState = (isOwner || admin) ? await getClassifiedOwnerState(numId).catch(() => null) : null;
  const isPaused = ownerState ? ownerState.status !== 1 : false;
  const shareUrl = `https://${SITE.domain}/classified/${c.id}`;
  const shareText = 'الإعلانات المبوّبة .. منصة تربح الإعلانية';

  // hide expired classifieds from the public (owner/admin can still view)
  const lifeDays = await getClassifiedLifetimeDays().catch(() => 0);
  if (lifeDays > 0 && c.createdAt && !isOwner && !admin) {
    const ageDays = (Date.now() - new Date(c.createdAt).getTime()) / 86400000;
    if (ageDays > lifeDays) notFound();
  }
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

      {/* رسائل نتيجة الإجراءات */}
      {sp.status === 'paused' && <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">⏸ أُوقف الإعلان — لم يعد ظاهراً للزوّار. اضغط «استئناف» لإعادته.</div>}
      {sp.status === 'resumed' && <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">▶ استُؤنف الإعلان وعاد للظهور.</div>}
      {sp.error === 'deleteWindow' && <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">انتهت المهلة المسموح بها لحذف الإعلان — للحذف بعدها تواصل مع الإدارة.</div>}
      {isPaused && (isOwner || admin) && <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-800">⏸ هذا الإعلان موقوف حالياً — يظهر لك فقط. اضغط «استئناف» لإعادته للزوّار.</div>}

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

      {/* شريط تحت الاتصال: مشاركة (أيقونة قائمة منسدلة، للجميع) + إجراءات المالك/الإدارة بخط صغير */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
        <ShareButtons
          url={shareUrl}
          title={shareText}
          text={shareText}
          card={{ url: shareUrl, title: shareText, image: c.image ?? undefined, desc: c.text ?? undefined }}
          compact
        />
        {(isOwner || admin) && (
          <>
            <Link href={`/classified/${c.id}/edit`} className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-primary">
              <Pencil className="h-3.5 w-3.5" /> تعديل
            </Link>
            <form action={toggleClassifiedStatusAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit
                msg={isPaused ? 'استئناف عرض هذا الإعلان للزوّار؟' : 'إيقاف هذا الإعلان؟ يختفي عن الزوّار ويعود متى استأنفته.'}
                className={`flex items-center gap-1 text-[11px] font-bold hover:opacity-80 ${isPaused ? 'text-emerald-700' : 'text-amber-700'}`}
              >
                {isPaused ? <><Play className="h-3.5 w-3.5" /> استئناف</> : <><Pause className="h-3.5 w-3.5" /> إيقاف</>}
              </ConfirmSubmit>
            </form>
            <form action={deleteClassifiedFromDetailAction}>
              <input type="hidden" name="id" value={c.id} />
              <ConfirmSubmit
                msg="حذف هذا الإعلان المبوّب نهائياً؟ لا يمكن التراجع."
                className="flex items-center gap-1 text-[11px] font-bold text-destructive hover:opacity-80"
              >
                <Trash2 className="h-3.5 w-3.5" /> حذف
              </ConfirmSubmit>
            </form>
          </>
        )}
      </div>

      {/* الإحصائيات — تظهر للمعلن والإدارة فقط */}
      {canSeeStats && (
        <div className="space-y-2 rounded-xl border border-primary/20 bg-card p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-primary">
            <Sparkles className="h-4 w-4" /> إحصائيات الإعلان {audience === 'all' ? '' : isOwner ? '(تظهر لك وللإدارة)' : '(عرض إداري)'}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-2 rounded-lg bg-white p-3">
              <Eye className="h-5 w-5 text-primary" />
              <div><div className="text-lg font-bold">{new Intl.NumberFormat('en-US').format(c.views)}</div><div className="text-xs text-muted-foreground">مشاهدة</div></div>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white p-3">
              <MousePointerClick className="h-5 w-5 text-primary" />
              <div><div className="text-lg font-bold">{new Intl.NumberFormat('en-US').format(c.clicks)}</div><div className="text-xs text-muted-foreground">نقرة على الرابط</div></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
