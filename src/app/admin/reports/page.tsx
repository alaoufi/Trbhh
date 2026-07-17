import Link from 'next/link';
import { Ban, Trash2, XCircle, Flag, ShieldAlert, AlertTriangle, Copy, Waves, Bot, Check, Megaphone } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requirePerm } from '@/lib/roles';
import { getModLog } from '@/lib/moderation';
import { CATEGORY_LABEL, type GuardCategory } from '@/lib/content-guard';
import { resolveReportAction, reviewModLogAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'البلاغات' };

const ACTION_LABEL: Record<string, string> = { ban: 'حُظر صاحب الإعلان', delete: 'حُذف الإعلان', dismiss: 'تم التجاهل (لا مخالفة)' };
const KIND_LABEL: Record<string, { label: string; icon: React.ElementType }> = {
  content: { label: 'محتوى ممنوع', icon: ShieldAlert },
  duplicate: { label: 'إعلان مكرر', icon: Copy },
  duplicate_cross: { label: 'مطابق لإعلان عضو آخر', icon: Copy },
  flood: { label: 'إغراق (نشر متسارع)', icon: Waves },
  limit: { label: 'تجاوز حدّ الباقة', icon: Ban },
  report: { label: 'إجراء بلاغ', icon: Flag },
};

const TABS = [
  { key: 'members', label: 'بلاغات الأعضاء', icon: Flag },
  { key: 'auto', label: 'بلاغات الرصد الآلي', icon: Bot },
] as const;
type TabKey = typeof TABS[number]['key'];

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requirePerm('reports');
  const { tab } = await searchParams;
  const active: TabKey = tab === 'auto' ? 'auto' : 'members';
  const pendingCount = await prisma.repord_ads.count({ where: { status: 0 } }).catch(() => 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Flag className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">البلاغات</h1>
      </div>

      {/* التبويبان: بلاغات يرفعها الأعضاء يدوياً، مقابل مخالفات يرصدها النظام آلياً */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary/40 p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/reports?tab=${t.key}`} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${active === t.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/60'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
            {t.key === 'members' && pendingCount > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${active === t.key ? 'bg-white/25 text-white' : 'bg-amber-500 text-white'}`}>{pendingCount}</span>
            )}
          </Link>
        ))}
      </div>

      {active === 'members' ? <MemberReportsTab /> : <AutoReportsTab />}
    </div>
  );
}

/** بلاغات الأعضاء: بلاغ يرفعه عضو على إعلان مخالف — يُغلق دائماً بإجراء (حظر/حذف/تجاهل). */
async function MemberReportsTab() {
  const reports = await prisma.repord_ads.findMany({ orderBy: { id: 'desc' }, take: 100 });
  const reasonIds = [...new Set(reports.map((r) => r.reason_id))].map((n) => BigInt(n));
  const adIds = [...new Set(reports.map((r) => BigInt(r.ads_id)))];
  const [reasons, ads] = await Promise.all([
    reasonIds.length ? prisma.report_resons.findMany({ where: { id: { in: reasonIds } } }) : [],
    adIds.length ? prisma.ads.findMany({ where: { id: { in: adIds } }, select: { id: true, title: true } }) : [],
  ]);
  const reasonById = new Map(reasons.map((r) => [toInt(r.id), r.reason]));
  const adById = new Map(ads.map((a) => [toInt(a.id), a.title]));
  // البلاغات القديمة قد يكون إعلانها محذوفاً نهائياً — رابط لا يعمل (404) بدل تعطيل الزر بلا تفسير
  const AdRef = ({ adId }: { adId: number }) =>
    adById.has(adId) ? (
      <Link href={`/ads/${adId}#admin-tools`} className="font-medium hover:text-primary">{adById.get(adId)}</Link>
    ) : (
      <span className="font-medium text-muted-foreground" title="حُذف هذا الإعلان نهائياً ولم يعد له صفحة">🗑 إعلان #{adId} (محذوف نهائياً)</span>
    );
  // member responses live in a column Prisma doesn't map → read raw (ignore if column not present yet)
  const respRows = await prisma.$queryRawUnsafe<{ id: bigint | number; response: string | null }[]>(
    `SELECT id, response FROM repord_ads ORDER BY id DESC LIMIT 100`,
  ).catch(() => []);
  const respById = new Map(respRows.map((r) => [toInt(r.id), r.response]));
  const pending = reports.filter((r) => r.status === 0);
  const resolved = reports.filter((r) => r.status !== 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">بلاغات يرفعها الأعضاء يدوياً على إعلانات مخالفة ({pending.length} بانتظار الإجراء) — كل بلاغ يجب أن يُغلق بإجراء: حظر صاحب الإعلان، حذف الإعلان، أو تجاهل البلاغ — يصل صاحب الإعلان رسالة عند الحظر/الحذف، ويصل المُبلِّغ رسالة تأكيد دائماً.</p>
      {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد بلاغات.</p>}
      <div className="space-y-2">
        {pending.map((r) => (
          <div key={toInt(r.id)} className="card-3d rounded-xl border-2 border-amber-300 p-3">
            <div className="flex items-center justify-between">
              <AdRef adId={r.ads_id} />
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
                <AdRef adId={r.ads_id} />
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

/** بلاغات الرصد الآلي: كل مخالفة يرصدها النظام نفسه بلا أي تدخل يدوي (محتوى ممنوع/تكرار/إغراق/تجاوز حد الباقة).
 *  كل حظر آلي جديد يبقى بانتظار مراجعتكم: فكّ الحظر أو الإبقاء عليه — لا يُغلق تلقائياً. */
async function AutoReportsTab() {
  const log = await getModLog(300);
  const bans = log.filter((e) => e.action === 'banned').length;
  const pendingBans = log.filter((e) => e.action === 'banned' && !e.reviewedAt);
  const rest = log.filter((e) => !(e.action === 'banned' && !e.reviewedAt));
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

  const uids = [...new Set(log.map((e) => e.userId))].filter(Boolean);
  const users = uids.length
    ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true, ban: true } }).catch(() => [])
    : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const isBannedNowById = new Map(users.map((u) => [toInt(u.id), u.ban === 'checked']));

  // الإعلان المرتبط بالحدث (الأصلي في حالة التكرار، أو المُبلَّغ عنه) — لعرضه ومقارنته قبل اتخاذ القرار
  const adIds = [...new Set(log.map((e) => e.adId).filter((id): id is number => !!id))];
  const linkedAds = adIds.length
    ? await prisma.ads.findMany({ where: { id: { in: adIds.map((id) => BigInt(id)) } }, select: { id: true, title: true } }).catch(() => [])
    : [];
  const adTitleById = new Map(linkedAds.map((a) => [toInt(a.id), a.title]));

  const reasonText = (e: (typeof log)[number]) => {
    const k = KIND_LABEL[e.kind] || { label: e.kind };
    const cat = e.category ? (CATEGORY_LABEL[e.category as GuardCategory] || e.category) : null;
    return [k.label, cat, e.term ? `«${e.term}»` : null].filter(Boolean).join(' — ');
  };
  const adLinkLabel = (kind: string) => (kind === 'duplicate' || kind === 'duplicate_cross' ? 'عرض الإعلان الأصلي المطابق' : 'عرض الإعلان محل البلاغ');
  // الإعلان المرتبط قد يكون حُذف نهائياً لاحقاً — رابط لا يعمل (404) بدل تعطيله بلا تفسير
  const AdEventLink = ({ e, danger }: { e: (typeof log)[number]; danger?: boolean }) => {
    if (!e.adId) return null;
    return adTitleById.has(e.adId) ? (
      <Link href={`/ads/${e.adId}#admin-tools`} className={`flex w-fit items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold text-primary underline ${danger ? 'border-red-300 bg-white hover:bg-red-50' : 'border-primary/20 bg-primary/5 hover:bg-primary/10'}`}>
        📄 {adLinkLabel(e.kind)}: «{adTitleById.get(e.adId)}» ←
      </Link>
    ) : (
      <span className="flex w-fit items-center gap-1 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5 text-xs font-bold text-muted-foreground">🗑 الإعلان المرتبط محذوف نهائياً</span>
    );
  };

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <span>
          <b className="text-primary">رصد آلي</b> بالكامل — كل محاولة نشر محتوى ممنوع أو مكرّر أو إغراق أو تجاوز لحدود الباقة (اليومي/الفاصل الزمني) يرصدها النظام ويسجّلها هنا لحظياً بلا أي تدخّل يدوي.
          المحتوى غير الأخلاقي يحظر الحساب فوراً، وبقية المخالفات (تكرار الإعلانات، الأمني/السياسي/المخدرات/الجمعيات)
          تُحظر عند بلوغ حدّ الإنذارات المحدَّد في الإعدادات. <b className="text-red-700">كل حظر آلي جديد ينتظر قراركم</b>: فكّ الحظر أو الإبقاء عليه.
        </span>
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <div className="text-xl font-bold text-primary">{en(log.length)}</div>
          <div className="text-[11px] text-muted-foreground">إجمالي الأحداث</div>
        </div>
        <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
          <Ban className="h-5 w-5 text-red-600" />
          <div className="text-xl font-bold text-red-600">{en(bans)}</div>
          <div className="text-[11px] text-muted-foreground">حسابات حُظرت</div>
        </div>
        <div className="card-3d flex flex-col items-center gap-1 rounded-xl p-3 text-center">
          <ShieldAlert className="h-5 w-5 text-amber-600" />
          <div className="text-xl font-bold text-amber-600">{en(pendingBans.length)}</div>
          <div className="text-[11px] text-muted-foreground">بانتظار مراجعتكم</div>
        </div>
      </div>

      {log.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد أحداث مسجّلة بعد.</p>}

      {/* حظر آلي بانتظار المراجعة — يعرض سبب الإنذار كاملاً والإجراء المطلوب */}
      {pendingBans.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-red-700">🔔 حظر آلي بانتظار المراجعة ({pendingBans.length})</h2>
          {pendingBans.map((e) => (
            <div key={e.id} className="card-3d space-y-2 rounded-xl border-2 border-red-400 bg-red-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Ban className="h-4 w-4 shrink-0 text-red-600" />
                <Link href={`/admin/users/${e.userId}`} className="text-sm font-bold text-primary underline">{nameById.get(e.userId) || `عضو #${en(e.userId)}`}</Link>
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">حُظر الحساب</span>
                <span className="mr-auto text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
              </div>
              <div className="text-sm font-bold text-red-800">سبب الإنذار: {reasonText(e)}</div>
              {e.snippet && (
                <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-white p-2 text-sm text-red-900">
                  <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>«{e.snippet}»</span>
                </div>
              )}
              <AdEventLink e={e} danger />
              <div className="text-xs font-bold text-amber-800">الإجراء المطلوب: افتحوا الإعلان (وإن كان تكراراً قارنوه بالأصلي)، ثم فكّوا الحظر إن كان غير مستحق، أو أبقوه إن كانت المخالفة واضحة.</div>
              <form action={reviewModLogAction} className="flex flex-wrap gap-2 pt-1">
                <input type="hidden" name="modLogId" value={e.id} />
                <ConfirmSubmit name="decision" value="unban" msg="فكّ الحظر عن هذا العضو؟ يصله إشعار بذلك وتعود إعلاناته للظهور فوراً." className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" /> فكّ الحظر</ConfirmSubmit>
                <ConfirmSubmit name="decision" value="keep" msg="الإبقاء على الحظر بعد المراجعة؟ يصل العضو إشعار بذلك." className="flex items-center gap-1 rounded-lg border-2 border-red-400 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100"><Ban className="h-3.5 w-3.5" /> استمرار الحظر</ConfirmSubmit>
              </form>
            </div>
          ))}
        </div>
      )}

      {/* بقية السجل: مخالفات لم تصل لحدّ الحظر، وحالات حظر رُوجعت بالفعل */}
      {rest.length > 0 && (
        <div className="space-y-2 pt-1">
          {pendingBans.length > 0 && <h2 className="text-sm font-bold text-muted-foreground">بقية السجل</h2>}
          {rest.map((e) => {
            const k = KIND_LABEL[e.kind] || { label: e.kind, icon: AlertTriangle };
            const banned = e.action === 'banned';
            const adBanned = e.action === 'ad_banned';
            const hasDetails = !!(e.snippet || e.term || e.adId || adBanned);
            return (
              <details key={e.id} className={`card-3d rounded-xl ${banned || adBanned ? '!border-red-200 bg-red-50/40 opacity-80' : ''}`}>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
                  <k.icon className={`h-4 w-4 shrink-0 ${banned || adBanned ? 'text-red-600' : 'text-amber-600'}`} />
                  <span className="text-sm font-bold text-primary">{k.label}</span>
                  <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"><Bot className="h-3 w-3" /> رصد آلي</span>
                  {e.category && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{CATEGORY_LABEL[e.category as GuardCategory] || e.category}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${banned ? 'bg-red-600 text-white' : adBanned ? 'bg-destructive text-white' : 'bg-amber-200 text-amber-900'}`}>
                    {banned ? 'حظر الحساب' : adBanned ? '🚫 حُذف الإعلان نهائياً' : 'رفض النشر'}
                  </span>
                  {banned && e.reviewedAt && (
                    <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                      <Check className="h-3 w-3" /> رُوجع — الحساب الآن: {isBannedNowById.get(e.userId) ? 'محظور' : 'غير محظور'}
                    </span>
                  )}
                  <Link href={`/admin/users/${e.userId}`} className="text-xs font-bold text-primary underline">{nameById.get(e.userId) || `عضو #${en(e.userId)}`}</Link>
                  <span className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
                  {hasDetails && <span className="mr-auto shrink-0 text-[11px] font-bold text-primary">عرض التفاصيل ▾</span>}
                </summary>
                {hasDetails && (
                  <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-sm">
                    {e.term && <div><b className="text-primary">الكلمة/العبارة الممنوعة:</b> «{e.term}»</div>}
                    {e.snippet && <div className="text-muted-foreground">المحتوى: «{e.snippet}»</div>}
                    {adBanned && <div className="text-xs text-muted-foreground">🗑 هذا الإعلان حُذف نهائياً عبر هذا الإجراء نفسه (إجراء إداري مباشر مكتمل) — لا صفحة له بعد الآن، ولا حاجة لأي إجراء إضافي.</div>}
                    <AdEventLink e={e} />
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
