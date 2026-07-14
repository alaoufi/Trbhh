import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Star, Trash2, EyeOff, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm } from '@/lib/roles';
import { adminDeleteAdAction, adminToggleSpecialAction, adminToggleAdStatusAction, deleteAllPendingAdsAction, deleteAllArchivedAdsAction, banUserAction } from '../actions';
import { getSettingBool, SETTING_ADS_APPROVAL } from '@/lib/settings';
import { sweepExpiredArchived } from '@/lib/data';
import { AdminSearch } from '@/components/admin-search';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { AdminPager } from '@/components/admin-pager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات' };

const notArchived = { OR: [{ data_archive: null }, { data_archive: '' }] };
const archived = { NOT: { OR: [{ data_archive: null }, { data_archive: '' }] } };
const PAGE_SIZE = 30;

const TABS = [
  { k: 'all', l: 'الكل' },
  { k: 'special', l: 'المميزة' },
  { k: 'normal', l: 'العادية' },
  { k: 'pending', l: 'بانتظار الموافقة' },
  { k: 'paused', l: 'موقوفة من أصحابها' },
  { k: 'archived', l: 'المؤرشفة' },
  { k: 'banned', l: 'المحظورة' },
] as const;
type Tab = typeof TABS[number]['k'];

export default async function AdminAds({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; page?: string }> }) {
  await requirePerm('ads');
  const { view, q, page: pageRaw } = await searchParams;
  const tab: Tab = (TABS.some((t) => t.k === view) ? view : 'all') as Tab;
  const term = (q || '').trim();
  const page = Math.max(1, parseInt(pageRaw || '1', 10) || 1);
  // لا نُشغّل كنس الأرشيف عند عرض تبويب المؤرشفة حتى لا يبدو فارغاً بعد حذف القديم
  if (tab !== 'archived') await sweepExpiredArchived().catch(() => {});

  // «المحظورة» = إعلانات الأعضاء المحظورين (نحتاج القائمة دائماً للعدّاد)
  const bannedUserIds = (await prisma.users.findMany({ where: { ban: 'checked' }, select: { id: true } }).catch(() => [])).map((u) => u.id);
  const bannedWhere: Prisma.adsWhereInput = { user_id: { in: bannedUserIds.length ? bannedUserIds : [BigInt(-1)] } };

  const tabWhere: Prisma.adsWhereInput =
    tab === 'special' ? { status: 1, adsSpecial: 'checked', ...notArchived }
      : tab === 'normal' ? { status: 1, NOT: { adsSpecial: 'checked' }, ...notArchived }
        : tab === 'pending' ? { status: 0, paused_by_owner: 0, ...notArchived }
          : tab === 'paused' ? { status: 0, paused_by_owner: 1, ...notArchived }
            : tab === 'archived' ? archived
              : tab === 'banned' ? bannedWhere
                : {};

  // البحث: بالعنوان أو التفاصيل أو رقم الإعلان
  const digits = term.replace(/\D/g, '');
  const searchWhere: Prisma.adsWhereInput = term
    ? { OR: [{ title: { contains: term } }, { detail: { contains: term } }, ...(digits ? [{ id: BigInt(digits) } as Prisma.adsWhereInput] : [])] }
    : {};
  const where: Prisma.adsWhereInput = { AND: [tabWhere, searchWhere] };

  const [total, allCount, specialCount, normalCount, pendingCount, pausedCount, archivedCount, bannedCount, activeLiveCount] = await Promise.all([
    prisma.ads.count({ where }),
    prisma.ads.count(),
    prisma.ads.count({ where: { status: 1, adsSpecial: 'checked', ...notArchived } }),
    prisma.ads.count({ where: { status: 1, NOT: { adsSpecial: 'checked' }, ...notArchived } }),
    prisma.ads.count({ where: { status: 0, paused_by_owner: 0, ...notArchived } }),
    prisma.ads.count({ where: { status: 0, paused_by_owner: 1, ...notArchived } }),
    prisma.ads.count({ where: archived }),
    prisma.ads.count({ where: bannedWhere }),
    prisma.ads.count({ where: { status: 1, state: 'active', ...notArchived } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const ads = await prisma.ads.findMany({ where, orderBy: { id: 'desc' }, skip: (cur - 1) * PAGE_SIZE, take: PAGE_SIZE });
  // سبب «بانتظار الموافقة»: مراجعة قبل النشر مفعّلة؟ (لتوضيح السبب على كل إعلان منتظر)
  const adsApproval = await getSettingBool(SETTING_ADS_APPROVAL, false).catch(() => false);

  const tabHref = (t: Tab) => {
    const sp = new URLSearchParams();
    if (t !== 'all') sp.set('view', t);
    if (term) sp.set('q', term);
    const qs = sp.toString();
    return `/admin/ads${qs ? `?${qs}` : ''}`;
  };
  const tabCls = (t: Tab) => `rounded-lg border px-3 py-1.5 ${tab === t ? 'bg-primary text-white' : 'text-primary'}`;
  const badge = (n: number, color: string) => n > 0 && <span className={`mr-1 rounded-full px-1.5 text-xs text-white ${color}`}>{n}</span>;

  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  return (
    <div className="space-y-4">
      {/* ملخّص إجمالي إعلانات القاعدة: الكلي/النشط/المؤرشف/المحجوب */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-3 text-center">
          <div className="text-2xl font-extrabold text-primary">{en(allCount)}</div>
          <div className="text-xs font-bold text-muted-foreground">إجمالي القاعدة</div>
        </div>
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-center">
          <div className="text-2xl font-extrabold text-emerald-700">{en(activeLiveCount)}</div>
          <div className="text-xs font-bold text-emerald-700/80">نشط (ظاهر)</div>
        </div>
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-center">
          <div className="text-2xl font-extrabold text-amber-700">{en(archivedCount)}</div>
          <div className="text-xs font-bold text-amber-700/80">مؤرشف</div>
        </div>
        <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-extrabold text-slate-700">{en(bannedCount)}</div>
          <div className="text-xs font-bold text-slate-700/80">محجوب (لأعضاء محظورين)</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">الإعلانات</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={tabHref('all')} className={tabCls('all')}>الكل {badge(allCount, 'bg-primary/80')}</Link>
          <Link href={tabHref('special')} className={tabCls('special')}>المميزة {badge(specialCount, 'bg-amber-500')}</Link>
          <Link href={tabHref('normal')} className={tabCls('normal')}>العادية {badge(normalCount, 'bg-emerald-600')}</Link>
          <Link href={tabHref('pending')} className={tabCls('pending')}>بانتظار الموافقة {badge(pendingCount, 'bg-red-500')}</Link>
          <Link href={tabHref('paused')} className={tabCls('paused')}>موقوفة من أصحابها {badge(pausedCount, 'bg-slate-500')}</Link>
          <Link href={tabHref('archived')} className={tabCls('archived')}>المؤرشفة {badge(archivedCount, 'bg-amber-600')}</Link>
          <Link href={tabHref('banned')} className={tabCls('banned')}>المحظورة {badge(bannedCount, 'bg-slate-600')}</Link>
        </div>
      </div>

      <AdminSearch basePath={`/admin/ads${tab !== 'all' ? `?view=${tab}` : ''}`} defaultValue={q} placeholder="بحث بالعنوان أو التفاصيل أو رقم الإعلان…" />

      {tab === 'pending' && pendingCount > 0 && (
        <form action={deleteAllPendingAdsAction} className="flex items-center justify-between gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
          <span className="text-sm font-bold text-destructive">حذف كل الإعلانات المنتظِرة للموافقة ({pendingCount})؟ لا يمكن التراجع.</span>
          <ConfirmSubmit msg={`تأكيد: حذف كل الإعلانات المنتظِرة للموافقة (${pendingCount} إعلان) نهائياً؟ لا يمكن التراجع.`} className="flex items-center gap-1 rounded-md bg-destructive px-3 py-2 text-sm font-bold text-white hover:bg-destructive/90"><Trash2 className="h-4 w-4" /> حذف الكل</ConfirmSubmit>
        </form>
      )}
      {tab === 'archived' && (
        <>
          {archivedCount > 0 && (
            <form action={deleteAllArchivedAdsAction} className="flex items-center justify-between gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
              <span className="text-sm font-bold text-destructive">حذف كل الإعلانات المؤرشفة ({archivedCount})؟ لا يمكن التراجع.</span>
              <ConfirmSubmit msg={`تأكيد: حذف كل الإعلانات المؤرشفة (${archivedCount} إعلان) نهائياً؟ لا يمكن التراجع.`} className="flex items-center gap-1 rounded-md bg-destructive px-3 py-2 text-sm font-bold text-white hover:bg-destructive/90"><Trash2 className="h-4 w-4" /> حذف الكل</ConfirmSubmit>
            </form>
          )}
          <p className="text-xs font-bold text-amber-700">الإعلانات المؤرشفة تُحذف تلقائياً بعد 30 يوماً من أرشفتها.</p>
        </>
      )}
      {tab === 'banned' && <p className="text-xs font-bold text-amber-700">إعلانات الأعضاء المحظورين حالياً — لا تظهر للزوّار ما دام صاحبها محظوراً.</p>}
      {tab === 'paused' && <p className="text-xs font-bold text-slate-600">إعلانات أوقفها أصحابها بأنفسهم (زر «إيقاف» في إعلاناتي) — لا تحتاج موافقة؛ تعود للنشر متى فعّلها صاحبها، ويمكنكم نشرها فوراً بزر الموافقة.</p>}

      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات هنا.</p>}
      <div className="space-y-2">
        {ads.map((a) => {
          const pending = a.status === 0 && !a.data_archive;
          return (
          <div key={toInt(a.id)} className="space-y-2 card-3d rounded-xl p-3">
            <div className="flex flex-wrap items-center gap-2">
              {/* عنوان فارغ؟ نعرض رقم الإعلان كرابط حتى يبقى قابلاً للفتح دائماً */}
              <Link href={`/ads/${toInt(a.id)}`} className="min-w-0 flex-1 truncate font-medium text-primary hover:underline">
                {a.title?.trim() || <span className="text-amber-700">⚠ بلا عنوان — إعلان #{toInt(a.id)}</span>}
              </Link>
              <span className="text-sm text-primary">{formatPrice(a.price, 'ر.س', a.adsType)}</span>
              {a.adsSpecial === 'checked' && <Badge variant="special">مميّز</Badge>}
              <Badge variant={a.status === 1 ? 'trusted' : a.data_archive ? 'muted' : 'special'}>{a.status === 1 ? 'نشط' : a.data_archive ? 'مؤرشف' : a.paused_by_owner ? 'موقوف من صاحبه' : 'بانتظار الموافقة'}</Badge>
              <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
            </div>

            {/* سبب الانتظار — يظهر على كل إعلان منتظر */}
            {pending && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold leading-5 text-amber-800">
                سبب الانتظار: {a.paused_by_owner
                  ? 'أوقفه صاحبه بنفسه — لا يحتاج موافقتكم؛ التاريخ المعروض هو تاريخ إنشاء الإعلان الأصلي'
                  : a.publish_at
                    ? `مجدول — سينشر تلقائياً في موعده الذي حدده صاحبه`
                    : adsApproval
                      ? '«مراجعة الإعلانات قبل النشر» مفعّلة من الإعدادات — كل إعلان جديد ينتظر موافقتكم'
                      : 'اشتباه تكرار (تشابه ٩٠٪+ مع إعلان قائم)'}
              </p>
            )}

            {/* معاينة فورية بلا فتح صفحة — التفاصيل كاملة هنا */}
            <details className="rounded-lg border border-primary/15 bg-secondary/20">
              <summary className="cursor-pointer list-none px-3 py-1.5 text-xs font-extrabold text-primary">👁 معاينة سريعة (التفاصيل هنا فوراً)</summary>
              <div className="space-y-2 border-t border-primary/10 p-3">
                <p className="whitespace-pre-line text-sm leading-6 text-foreground/90">{(a.detail || '').slice(0, 600) || '— لا توجد تفاصيل —'}{(a.detail || '').length > 600 ? '…' : ''}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/ads/${toInt(a.id)}`} className="rounded-md border border-primary/30 px-2.5 py-1 text-xs font-bold text-primary hover:bg-primary/5">فتح صفحة الإعلان كاملة (بالصور)</Link>
                  <Link href={`/admin/users/${toInt(a.user_id)}`} className="rounded-md border px-2.5 py-1 text-xs font-bold text-muted-foreground hover:bg-secondary">ملف المعلن</Link>
                  {/* حظر المعلن — أيام محددة أو فارغ = دائم */}
                  <form action={banUserAction} className="flex items-center gap-1">
                    <input type="hidden" name="userId" value={toInt(a.user_id)} />
                    <input name="days" type="number" min={0} placeholder="أيام" className="h-7 w-16 rounded-md border border-destructive/30 px-2 text-xs" />
                    <ConfirmSubmit msg="تأكيد حظر هذا المعلن؟ ستختفي كل إعلاناته من الموقع طوال مدة الحظر." className="rounded-md bg-destructive px-2.5 py-1 text-xs font-bold text-white hover:bg-destructive/90">⛔ حظر المعلن (فارغ = دائم)</ConfirmSubmit>
                  </form>
                </div>
              </div>
            </details>

            <div className="flex flex-wrap gap-1">
              {a.status === 0 && (
                <form action={adminToggleAdStatusAction}>
                  <input type="hidden" name="adId" value={toInt(a.id)} />
                  <ConfirmSubmit msg={a.data_archive ? 'تأكيد إعادة نشر هذا الإعلان من الأرشيف؟ سيظهر للزوار فوراً.' : 'تأكيد الموافقة على هذا الإعلان ونشره فوراً؟'} title={a.data_archive ? 'إعادة النشر من الأرشيف' : 'موافقة ونشر فوري'} className="flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"><Check className="h-3.5 w-3.5" /> {a.data_archive ? 'إعادة نشر' : 'موافقة ونشر'}</ConfirmSubmit>
                </form>
              )}
              <form action={adminToggleSpecialAction}>
                <input type="hidden" name="adId" value={toInt(a.id)} />
                <ConfirmSubmit msg={a.adsSpecial === 'checked' ? 'إلغاء تمييز هذا الإعلان؟' : 'تمييز هذا الإعلان (يظهر بإطار ذهبي في مقدمة القوائم)؟'} title={a.adsSpecial === 'checked' ? 'إلغاء التمييز' : 'تمييز الإعلان'} className={`flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-bold ${a.adsSpecial === 'checked' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:bg-secondary'}`}>
                  <Star className={`h-3.5 w-3.5 ${a.adsSpecial === 'checked' ? 'fill-amber-400 text-amber-500' : ''}`} /> {a.adsSpecial === 'checked' ? 'إلغاء التمييز' : 'تمييز'}
                </ConfirmSubmit>
              </form>
              {a.status === 1 && (
                <form action={adminToggleAdStatusAction}><input type="hidden" name="adId" value={toInt(a.id)} /><ConfirmSubmit msg="تأكيد إيقاف هذا الإعلان وأرشفته؟ سيختفي من الموقع (يُحذف تلقائياً بعد 30 يوماً من الأرشفة)." title="إيقاف/حجب" className="flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-bold hover:bg-secondary"><EyeOff className="h-3.5 w-3.5" /> إيقاف</ConfirmSubmit></form>
              )}
              <form action={adminDeleteAdAction}><input type="hidden" name="adId" value={toInt(a.id)} /><ConfirmSubmit msg={`حذف الإعلان «${a.title?.trim() || `#${toInt(a.id)}`}» نهائياً؟ لا يمكن التراجع.`} title="حذف نهائي" className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> حذف</ConfirmSubmit></form>
            </div>
          </div>
          );
        })}
      </div>

      <AdminPager basePath="/admin/ads" page={cur} pages={pages} total={total} params={{ view: tab !== 'all' ? tab : undefined, q: term || undefined }} />
    </div>
  );
}
