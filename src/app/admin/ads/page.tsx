import Link from 'next/link';
import type { Prisma } from '@prisma/client';
import { Star, Trash2, EyeOff, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm } from '@/lib/roles';
import { adminDeleteAdAction, adminToggleSpecialAction, adminToggleAdStatusAction, deleteAllPendingAdsAction, deleteAllArchivedAdsAction } from '../actions';
import { sweepExpiredArchived } from '@/lib/data';
import { AdminSearch } from '@/components/admin-search';
import { AdminPager } from '@/components/admin-pager';
import { Button } from '@/components/ui/button';

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
        : tab === 'pending' ? { status: 0, ...notArchived }
          : tab === 'archived' ? archived
            : tab === 'banned' ? bannedWhere
              : {};

  // البحث: بالعنوان أو التفاصيل أو رقم الإعلان
  const digits = term.replace(/\D/g, '');
  const searchWhere: Prisma.adsWhereInput = term
    ? { OR: [{ title: { contains: term } }, { detail: { contains: term } }, ...(digits ? [{ id: BigInt(digits) } as Prisma.adsWhereInput] : [])] }
    : {};
  const where: Prisma.adsWhereInput = { AND: [tabWhere, searchWhere] };

  const [total, allCount, specialCount, normalCount, pendingCount, archivedCount, bannedCount] = await Promise.all([
    prisma.ads.count({ where }),
    prisma.ads.count(),
    prisma.ads.count({ where: { status: 1, adsSpecial: 'checked', ...notArchived } }),
    prisma.ads.count({ where: { status: 1, NOT: { adsSpecial: 'checked' }, ...notArchived } }),
    prisma.ads.count({ where: { status: 0, ...notArchived } }),
    prisma.ads.count({ where: archived }),
    prisma.ads.count({ where: bannedWhere }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages);
  const ads = await prisma.ads.findMany({ where, orderBy: { id: 'desc' }, skip: (cur - 1) * PAGE_SIZE, take: PAGE_SIZE });

  const tabHref = (t: Tab) => {
    const sp = new URLSearchParams();
    if (t !== 'all') sp.set('view', t);
    if (term) sp.set('q', term);
    const qs = sp.toString();
    return `/admin/ads${qs ? `?${qs}` : ''}`;
  };
  const tabCls = (t: Tab) => `rounded-lg border px-3 py-1.5 ${tab === t ? 'bg-primary text-white' : 'text-primary'}`;
  const badge = (n: number, color: string) => n > 0 && <span className={`mr-1 rounded-full px-1.5 text-xs text-white ${color}`}>{n}</span>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">الإعلانات</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={tabHref('all')} className={tabCls('all')}>الكل {badge(allCount, 'bg-primary/80')}</Link>
          <Link href={tabHref('special')} className={tabCls('special')}>المميزة {badge(specialCount, 'bg-amber-500')}</Link>
          <Link href={tabHref('normal')} className={tabCls('normal')}>العادية {badge(normalCount, 'bg-emerald-600')}</Link>
          <Link href={tabHref('pending')} className={tabCls('pending')}>بانتظار الموافقة {badge(pendingCount, 'bg-red-500')}</Link>
          <Link href={tabHref('archived')} className={tabCls('archived')}>المؤرشفة {badge(archivedCount, 'bg-amber-600')}</Link>
          <Link href={tabHref('banned')} className={tabCls('banned')}>المحظورة {badge(bannedCount, 'bg-slate-600')}</Link>
        </div>
      </div>

      <AdminSearch basePath={`/admin/ads${tab !== 'all' ? `?view=${tab}` : ''}`} defaultValue={q} placeholder="بحث بالعنوان أو التفاصيل أو رقم الإعلان…" />

      {tab === 'pending' && pendingCount > 0 && (
        <form action={deleteAllPendingAdsAction} className="flex items-center justify-between gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
          <span className="text-sm font-bold text-destructive">حذف كل الإعلانات المنتظِرة للموافقة ({pendingCount})؟ لا يمكن التراجع.</span>
          <Button size="sm" className="bg-destructive hover:bg-destructive/90"><Trash2 className="h-4 w-4" /> حذف الكل</Button>
        </form>
      )}
      {tab === 'archived' && (
        <>
          {archivedCount > 0 && (
            <form action={deleteAllArchivedAdsAction} className="flex items-center justify-between gap-2 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-3">
              <span className="text-sm font-bold text-destructive">حذف كل الإعلانات المؤرشفة ({archivedCount})؟ لا يمكن التراجع.</span>
              <Button size="sm" className="bg-destructive hover:bg-destructive/90"><Trash2 className="h-4 w-4" /> حذف الكل</Button>
            </form>
          )}
          <p className="text-xs font-bold text-amber-700">الإعلانات المؤرشفة تُحذف تلقائياً بعد 30 يوماً من أرشفتها.</p>
        </>
      )}
      {tab === 'banned' && <p className="text-xs font-bold text-amber-700">إعلانات الأعضاء المحظورين حالياً — لا تظهر للزوّار ما دام صاحبها محظوراً.</p>}

      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات هنا.</p>}
      <div className="space-y-2">
        {ads.map((a) => (
          <div key={toInt(a.id)} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            {/* عنوان فارغ؟ نعرض رقم الإعلان كرابط حتى يبقى قابلاً للفتح دائماً */}
            <Link href={`/ads/${toInt(a.id)}`} className="min-w-0 flex-1 truncate font-medium text-primary hover:underline">
              {a.title?.trim() || <span className="text-amber-700">⚠ بلا عنوان — إعلان #{toInt(a.id)}</span>}
            </Link>
            <span className="text-sm text-primary">{formatPrice(a.price, 'ر.س', a.adsType)}</span>
            {a.adsSpecial === 'checked' && <Badge variant="special">مميّز</Badge>}
            <Badge variant={a.status === 1 ? 'trusted' : a.data_archive ? 'muted' : 'special'}>{a.status === 1 ? 'نشط' : a.data_archive ? 'مؤرشف' : 'بانتظار الموافقة'}</Badge>
            <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
            <div className="flex gap-1">
              {a.status === 0 && (
                <form action={adminToggleAdStatusAction}>
                  <input type="hidden" name="adId" value={toInt(a.id)} />
                  <button className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-white" title={a.data_archive ? 'إعادة النشر من الأرشيف' : 'اعتماد ونشر'}><Check className="h-3.5 w-3.5" /> {a.data_archive ? 'إعادة نشر' : 'اعتماد'}</button>
                </form>
              )}
              <form action={adminToggleSpecialAction}>
                <input type="hidden" name="adId" value={toInt(a.id)} />
                <button className={`flex items-center gap-1 rounded-md border p-1.5 text-xs font-bold ${a.adsSpecial === 'checked' ? 'border-amber-400 bg-amber-50 text-amber-700' : 'text-muted-foreground hover:bg-secondary'}`} title={a.adsSpecial === 'checked' ? 'إلغاء التمييز' : 'تمييز الإعلان'}>
                  <Star className={`h-3.5 w-3.5 ${a.adsSpecial === 'checked' ? 'fill-amber-400 text-amber-500' : ''}`} /> {a.adsSpecial === 'checked' ? 'إلغاء التمييز' : 'تمييز'}
                </button>
              </form>
              {a.status === 1 && (
                <form action={adminToggleAdStatusAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border p-1.5 hover:bg-secondary" title="إيقاف/حجب"><EyeOff className="h-3.5 w-3.5" /></button></form>
              )}
              <form action={adminDeleteAdAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button></form>
            </div>
          </div>
        ))}
      </div>

      <AdminPager basePath="/admin/ads" page={cur} pages={pages} total={total} params={{ view: tab !== 'all' ? tab : undefined, q: term || undefined }} />
    </div>
  );
}
