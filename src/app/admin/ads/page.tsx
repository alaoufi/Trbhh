import Link from 'next/link';
import { Star, Trash2, Eye, EyeOff, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm } from '@/lib/roles';
import { adminDeleteAdAction, adminToggleSpecialAction, adminToggleAdStatusAction, deleteAllPendingAdsAction, deleteAllArchivedAdsAction } from '../actions';
import { sweepExpiredArchived } from '@/lib/data';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات' };

const notArchived = { OR: [{ data_archive: null }, { data_archive: '' }] };
const archived = { NOT: { OR: [{ data_archive: null }, { data_archive: '' }] } };

export default async function AdminAds({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requirePerm('ads');
  // لا نُشغّل كنس الأرشيف عند عرض تبويب المؤرشفة حتى لا يبدو فارغاً بعد حذف القديم
  const { view } = await searchParams;
  const tab = view === 'active' || view === 'pending' || view === 'archived' ? view : 'all';
  if (tab !== 'archived') await sweepExpiredArchived().catch(() => {});
  const where = tab === 'active' ? { status: 1, ...notArchived }
    : tab === 'pending' ? { status: 0, ...notArchived }
      : tab === 'archived' ? archived : {};
  const [ads, activeCount, pendingCount, archivedCount] = await Promise.all([
    prisma.ads.findMany({ where, orderBy: { id: 'desc' }, take: 60 }),
    prisma.ads.count({ where: { status: 1, ...notArchived } }),
    prisma.ads.count({ where: { status: 0, ...notArchived } }),
    prisma.ads.count({ where: archived }),
  ]);
  const tabCls = (t: string) => `rounded-lg border px-3 py-1.5 ${tab === t ? 'bg-primary text-white' : 'text-primary'}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">الإعلانات</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/admin/ads" className={tabCls('all')}>الكل</Link>
          <Link href="/admin/ads?view=active" className={tabCls('active')}>
            النشطة {activeCount > 0 && <span className="mr-1 rounded-full bg-emerald-500 px-1.5 text-xs text-white">{activeCount}</span>}
          </Link>
          <Link href="/admin/ads?view=pending" className={tabCls('pending')}>
            بانتظار الموافقة {pendingCount > 0 && <span className="mr-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{pendingCount}</span>}
          </Link>
          <Link href="/admin/ads?view=archived" className={tabCls('archived')}>
            المحجوبة/المؤرشفة {archivedCount > 0 && <span className="mr-1 rounded-full bg-amber-500 px-1.5 text-xs text-white">{archivedCount}</span>}
          </Link>
        </div>
      </div>

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

      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات هنا.</p>}
      <div className="space-y-2">
        {ads.map((a) => (
          <div key={toInt(a.id)} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            <Link href={`/ads/${toInt(a.id)}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">{a.title}</Link>
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
    </div>
  );
}
