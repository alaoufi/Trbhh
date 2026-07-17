import Link from 'next/link';
import { Archive, Megaphone, Flag, Bot, Users, MessageSquare, Store, Trash2, RotateCcw, Ban, Copy, Waves, ShieldAlert } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, timeAgo } from '@/lib/utils';
import { requireAnyAdmin } from '@/lib/roles';
import { getModLog } from '@/lib/moderation';
import { CATEGORY_LABEL, type GuardCategory } from '@/lib/content-guard';
import { adminDeleteReportRecordAction, adminDeleteModLogAction, adminRestoreCommentAction, adminDeleteStoreForeverAction, toggleStoreStatusAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'الأرشيف' };

const ACTION_LABEL: Record<string, string> = { ban: 'حُظر صاحب الإعلان', delete: 'حُذف الإعلان', dismiss: 'تم التجاهل (لا مخالفة)' };
const KIND_LABEL: Record<string, { label: string; icon: React.ElementType }> = {
  content: { label: 'محتوى ممنوع', icon: ShieldAlert },
  duplicate: { label: 'إعلان مكرر', icon: Copy },
  duplicate_cross: { label: 'مطابق لإعلان عضو آخر', icon: Copy },
  flood: { label: 'إغراق (نشر متسارع)', icon: Waves },
  limit: { label: 'تجاوز حدّ الباقة', icon: Ban },
  report: { label: 'إجراء بلاغ', icon: Flag },
  account: { label: 'حذف حساب', icon: Trash2 },
};

const TABS = [
  { key: 'ads', label: 'الإعلانات', icon: Megaphone },
  { key: 'reports', label: 'البلاغات اليدوية', icon: Flag },
  { key: 'modlog', label: 'البلاغات الآلية', icon: Bot },
  { key: 'members', label: 'الأعضاء', icon: Users },
  { key: 'comments', label: 'التعليقات', icon: MessageSquare },
  { key: 'stores', label: 'المتاجر', icon: Store },
] as const;
type TabKey = typeof TABS[number]['key'];

export default async function AdminArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await requireAnyAdmin();
  const { tab } = await searchParams;
  const active: TabKey = (TABS.some((t) => t.key === tab) ? tab : 'ads') as TabKey;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Archive className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold text-primary">الأرشيف</h1>
      </div>
      <p className="text-sm text-muted-foreground">كل شيء يُحذف أو يُغلق أو يُنهى بدل أن يختفي أو يتراكم بالعرض الحي — ينتقل هنا محفوظاً، ومن أراد المراجعة يعود إليه هنا فقط.</p>

      <div className="flex flex-wrap gap-1 overflow-x-auto rounded-xl bg-secondary/40 p-1">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/archive?tab=${t.key}`} className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold ${active === t.key ? 'bg-primary text-white' : 'text-muted-foreground hover:bg-white/60'}`}>
            <t.icon className="h-4 w-4" /> {t.label}
          </Link>
        ))}
      </div>

      {active === 'ads' && <AdsArchiveTab />}
      {active === 'reports' && <ReportsArchiveTab />}
      {active === 'modlog' && <ModLogArchiveTab />}
      {active === 'members' && <MembersArchiveTab />}
      {active === 'comments' && <CommentsArchiveTab />}
      {active === 'stores' && <StoresArchiveTab />}
    </div>
  );
}

/** الإعلانات المؤرشفة لها تبويب كامل جاهز بالفعل (فردي/جماعي) — لا داعي لتكراره هنا. */
async function AdsArchiveTab() {
  const count = await prisma.ads.count({ where: { NOT: { OR: [{ data_archive: null }, { data_archive: '' }] } } }).catch(() => 0);
  return (
    <div className="card-3d flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <Megaphone className="h-8 w-8 text-amber-600" />
      <p className="text-sm text-muted-foreground">الإعلانات المؤرشفة ({count}) — إظهار/حذف نهائي فردي أو جماعي — من صفحة إدارة الإعلانات مباشرة.</p>
      <Link href="/admin/ads?view=archived" className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">فتح تبويب المؤرشفة ←</Link>
    </div>
  );
}

/** بلاغات أعضاء عولجت بالفعل (حُظر/حُذف/تُجوهل) — سجل تاريخي، مع خيار مسح نهائي. */
async function ReportsArchiveTab() {
  const reports = await prisma.repord_ads.findMany({ where: { status: { not: 0 } }, orderBy: { id: 'desc' }, take: 200 });
  const reasonIds = [...new Set(reports.map((r) => r.reason_id))].map((n) => BigInt(n));
  const adIds = [...new Set(reports.map((r) => BigInt(r.ads_id)))];
  const [reasons, ads] = await Promise.all([
    reasonIds.length ? prisma.report_resons.findMany({ where: { id: { in: reasonIds } } }) : [],
    adIds.length ? prisma.ads.findMany({ where: { id: { in: adIds } }, select: { id: true, title: true } }) : [],
  ]);
  const reasonById = new Map(reasons.map((r) => [toInt(r.id), r.reason]));
  const adById = new Map(ads.map((a) => [toInt(a.id), a.title]));
  const AdRef = ({ adId }: { adId: number }) =>
    adById.has(adId) ? (
      <Link href={`/ads/${adId}#admin-tools`} className="font-medium hover:text-primary">{adById.get(adId)}</Link>
    ) : (
      <span className="font-medium text-muted-foreground">🗑 إعلان #{adId} (محذوف نهائياً)</span>
    );
  return (
    <div className="space-y-2">
      {reports.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد بلاغات مُعالَجة بعد.</p>}
      {reports.map((r) => (
        <div key={toInt(r.id)} className="card-3d rounded-xl p-3">
          <div className="flex items-center justify-between">
            <AdRef adId={r.ads_id} />
            <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
          </div>
          <div className="mt-1 text-sm"><span className="rounded bg-secondary px-2 py-0.5 text-xs">{reasonById.get(r.reason_id) || 'بلاغ'}</span> {r.comment && <span className="text-muted-foreground">— {r.comment}</span>}</div>
          <div className="mt-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-emerald-700">✓ {ACTION_LABEL[r.action || ''] || 'عولج'}{r.handled_at ? ` — ${timeAgo(r.handled_at)}` : ''}</span>
            <form action={adminDeleteReportRecordAction}>
              <input type="hidden" name="reportId" value={toInt(r.id)} />
              <ConfirmSubmit msg="مسح هذا السجل نهائياً من الأرشيف؟ لا يمس الإعلان أو العضو — سجل تاريخي فقط." className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline"><Trash2 className="h-3.5 w-3.5" /> مسح نهائي</ConfirmSubmit>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}

/** أحداث الرصد الآلي المُغلقة (رفض نشر، حظر رُوجع، إعلان/حساب حُذف) — سجل تاريخي، مع خيار مسح نهائي. */
async function ModLogArchiveTab() {
  const log = await getModLog(500);
  const rest = log.filter((e) => !(e.action === 'banned' && !e.reviewedAt));
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const uids = [...new Set(rest.map((e) => e.userId))].filter(Boolean);
  const users = uids.length
    ? await prisma.users.findMany({ where: { id: { in: uids.map((u) => BigInt(u)) } }, select: { id: true, name: true, userName: true, ban: true } }).catch(() => [])
    : [];
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || `#${toInt(u.id)}`]));
  const isBannedNowById = new Map(users.map((u) => [toInt(u.id), u.ban === 'checked']));
  const adIds = [...new Set(rest.map((e) => e.adId).filter((id): id is number => !!id))];
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
  const AdEventLink = ({ e }: { e: (typeof log)[number] }) => {
    if (!e.adId) return null;
    return adTitleById.has(e.adId) ? (
      <Link href={`/ads/${e.adId}#admin-tools`} className="flex w-fit items-center gap-1 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary underline hover:bg-primary/10">
        📄 {adLinkLabel(e.kind)}: «{adTitleById.get(e.adId)}» ←
      </Link>
    ) : (
      <span className="flex w-fit items-center gap-1 rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-1.5 text-xs font-bold text-muted-foreground">🗑 الإعلان المرتبط محذوف نهائياً</span>
    );
  };

  return (
    <div className="space-y-2">
      {rest.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد أحداث مغلقة بعد.</p>}
      {log.length >= 500 && <p className="text-xs font-bold text-amber-700">تُعرض آخر 500 حدث فقط — الأقدم مؤرشف بقاعدة البيانات دون عرض هنا.</p>}
      {rest.map((e) => {
        const k = KIND_LABEL[e.kind] || { label: e.kind, icon: ShieldAlert };
        const banned = e.action === 'banned';
        const adBanned = e.action === 'ad_banned';
        const accountDeleted = e.action === 'account_deleted';
        const terminal = banned || adBanned || accountDeleted;
        return (
          <details key={e.id} className={`card-3d rounded-xl ${terminal ? '!border-red-200 bg-red-50/40 opacity-80' : ''}`}>
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 p-3">
              <k.icon className={`h-4 w-4 shrink-0 ${terminal ? 'text-red-600' : 'text-amber-600'}`} />
              <span className="text-sm font-bold text-primary">{k.label}</span>
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"><Bot className="h-3 w-3" /> رصد آلي</span>
              {e.category && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">{CATEGORY_LABEL[e.category as GuardCategory] || e.category}</span>}
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${banned ? 'bg-red-600 text-white' : terminal ? 'bg-destructive text-white' : 'bg-amber-200 text-amber-900'}`}>
                {banned ? 'حظر الحساب' : adBanned ? '🚫 حُذف الإعلان نهائياً' : accountDeleted ? '🗑️ حُذف الحساب' : 'رفض النشر'}
              </span>
              {banned && e.reviewedAt && (
                <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">رُوجع — الحساب الآن: {isBannedNowById.get(e.userId) ? 'محظور' : 'غير محظور'}</span>
              )}
              <Link href={`/admin/users/${e.userId}`} className="text-xs font-bold text-primary underline">{nameById.get(e.userId) || `عضو #${en(e.userId)}`}</Link>
              <span className="text-xs text-muted-foreground">{timeAgo(e.createdAt)}</span>
              <span className="mr-auto shrink-0 text-[11px] font-bold text-primary">عرض التفاصيل ▾</span>
            </summary>
            <div className="space-y-1.5 border-t border-border/50 px-3 py-2 text-sm">
              <div className="text-muted-foreground">سبب الإنذار: {reasonText(e)}</div>
              {e.snippet && <div className="text-muted-foreground">المحتوى: «{e.snippet}»</div>}
              {adBanned && <div className="text-xs text-muted-foreground">🗑 هذا الإعلان حُذف نهائياً عبر هذا الإجراء نفسه — لا صفحة له بعد الآن.</div>}
              {accountDeleted && <div className="text-xs text-muted-foreground">🗑️ حذف العضو حسابه بنفسه — الاسم والبيانات مموَّهة نهائياً.</div>}
              <AdEventLink e={e} />
              <form action={adminDeleteModLogAction} className="pt-1">
                <input type="hidden" name="modLogId" value={e.id} />
                <ConfirmSubmit msg="مسح هذا السطر نهائياً من سجل الرصد الآلي؟ سجل تاريخي فقط — لا يغيّر حالة العضو أو الإعلان." className="flex items-center gap-1 text-xs font-bold text-destructive hover:underline"><Trash2 className="h-3.5 w-3.5" /> مسح نهائي</ConfirmSubmit>
              </form>
            </div>
          </details>
        );
      })}
    </div>
  );
}

/** حسابات مموَّهة نهائياً (حذف ذاتي/إداري) — بيانات محذوفة ولا رجعة، تُعرض للمراجعة فقط. */
async function MembersArchiveTab() {
  const rows = await prisma.$queryRawUnsafe<{ id: bigint; userName: string | null; created_at: Date | null }[]>(
    `SELECT id, userName, created_at FROM users WHERE userName LIKE 'deleted\\_%' ORDER BY id DESC LIMIT 200`,
  ).catch(() => []);
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="py-8 text-center text-muted-foreground">لا يوجد أعضاء محذوفون بعد.</p>}
      {rows.map((u) => (
        <div key={toInt(u.id)} className="card-3d flex items-center justify-between rounded-xl p-3 text-sm">
          <span className="font-medium text-muted-foreground">🗑️ عضو #{toInt(u.id)} — حساب محذوف ومموَّه نهائياً</span>
          <span className="text-xs text-muted-foreground">فُتح الحساب {timeAgo(u.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

/** تعليقات أُرشفت بدل حذفها — يمكن استعادتها. */
async function CommentsArchiveTab() {
  const rows = await prisma.comments.findMany({ where: { hide: 'yes' }, orderBy: { id: 'desc' }, take: 200 });
  const senderIds = [...new Set(rows.map((r) => toInt(r.sender_id)))].map((n) => BigInt(n));
  const adIds = [...new Set(rows.map((r) => toInt(r.ads_id)))];
  const [users, ads] = await Promise.all([
    senderIds.length ? prisma.users.findMany({ where: { id: { in: senderIds } }, select: { id: true, name: true, userName: true } }) : [],
    adIds.length ? prisma.ads.findMany({ where: { id: { in: adIds.map((id) => BigInt(id)) } }, select: { id: true, title: true } }) : [],
  ]);
  const nameById = new Map(users.map((u) => [toInt(u.id), u.name || u.userName || 'مستخدم']));
  const adById = new Map(ads.map((a) => [toInt(a.id), a.title]));
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد تعليقات مؤرشفة.</p>}
      {rows.map((c) => {
        const adId = toInt(c.ads_id);
        return (
          <div key={toInt(c.id)} className="card-3d rounded-xl p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary">{nameById.get(toInt(c.sender_id)) || 'مستخدم'}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(c.created_at)}</span>
            </div>
            <p className="mt-1 text-foreground/90">{c.comment}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              {adById.has(adId) ? (
                <Link href={`/ads/${adId}#admin-tools`} className="text-xs font-bold text-primary underline">عرض الإعلان: «{adById.get(adId)}» ←</Link>
              ) : (
                <span className="text-xs text-muted-foreground">🗑 الإعلان محذوف نهائياً</span>
              )}
              <form action={adminRestoreCommentAction}>
                <input type="hidden" name="commentId" value={toInt(c.id)} />
                <ConfirmSubmit msg="استعادة هذا التعليق؟ يعود ظاهراً للجمهور فوراً." className="flex items-center gap-1 text-xs font-bold text-emerald-700 hover:underline"><RotateCcw className="h-3.5 w-3.5" /> استعادة</ConfirmSubmit>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** متاجر أُوقفت نهائياً (أرشفة) — استعادة، أو حذف نهائي حقيقي بلا رجعة من هنا فقط. */
async function StoresArchiveTab() {
  const stores = await prisma.stores.findMany({ where: { status: 3 }, orderBy: { id: 'desc' }, take: 200 });
  return (
    <div className="space-y-2">
      {stores.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد متاجر مؤرشفة.</p>}
      {stores.map((s) => (
        <div key={toInt(s.id)} className="card-3d flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-sm">
          <Link href={`/companies/${toInt(s.id)}`} className="font-bold text-primary hover:underline">{s.store_name || `متجر #${toInt(s.id)}`}</Link>
          <div className="flex items-center gap-2">
            <form action={toggleStoreStatusAction}>
              <input type="hidden" name="storeId" value={toInt(s.id)} />
              <input type="hidden" name="action" value="activate" />
              <ConfirmSubmit msg="استعادة هذا المتجر من الأرشيف؟ يعود للظهور فوراً." className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"><RotateCcw className="h-3.5 w-3.5" /> استعادة</ConfirmSubmit>
            </form>
            <form action={adminDeleteStoreForeverAction} className="flex items-center gap-2">
              <input type="hidden" name="storeId" value={toInt(s.id)} />
              <label className="flex items-center gap-1 text-[11px] font-bold text-destructive"><input type="checkbox" name="confirm" required className="h-3.5 w-3.5 accent-red-600" /> تأكيد</label>
              <ConfirmSubmit msg={`حذف متجر «${s.store_name || `#${toInt(s.id)}`}» نهائياً بكل بياناته (متابعون/تقييمات/فروع)؟ لا يمكن التراجع.`} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white hover:bg-destructive/90"><Trash2 className="h-3.5 w-3.5" /> حذف نهائي</ConfirmSubmit>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
