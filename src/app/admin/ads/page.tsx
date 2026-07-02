import Link from 'next/link';
import { Star, Trash2, Eye, EyeOff, Check } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { requirePerm } from '@/lib/roles';
import { adminDeleteAdAction, adminToggleSpecialAction, adminToggleAdStatusAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات' };

export default async function AdminAds({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  await requirePerm('ads');
  const sp = await searchParams;
  const onlyPending = sp.pending === '1';
  const [ads, pendingCount] = await Promise.all([
    prisma.ads.findMany({ where: onlyPending ? { status: 0 } : {}, orderBy: { id: 'desc' }, take: 60 }),
    prisma.ads.count({ where: { status: 0 } }),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-primary">الإعلانات</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/ads" className={`rounded-lg border px-3 py-1.5 ${!onlyPending ? 'bg-primary text-white' : 'text-primary'}`}>الكل</Link>
          <Link href="/admin/ads?pending=1" className={`rounded-lg border px-3 py-1.5 ${onlyPending ? 'bg-primary text-white' : 'text-primary'}`}>
            بانتظار الموافقة {pendingCount > 0 && <span className="mr-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{pendingCount}</span>}
          </Link>
        </div>
      </div>
      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات{onlyPending ? ' بانتظار الموافقة' : ''}.</p>}
      <div className="space-y-2">
        {ads.map((a) => (
          <div key={toInt(a.id)} className="flex flex-wrap items-center gap-2 card-3d rounded-xl p-3">
            <Link href={`/ads/${toInt(a.id)}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">{a.title}</Link>
            <span className="text-sm text-primary">{formatPrice(a.price)}</span>
            {a.adsSpecial === 'checked' && <Badge variant="special">مميّز</Badge>}
            <Badge variant={a.status === 1 ? 'trusted' : 'special'}>{a.status === 1 ? 'نشط' : 'بانتظار الموافقة'}</Badge>
            <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
            <div className="flex gap-1">
              {a.status === 0 && (
                <form action={adminToggleAdStatusAction}>
                  <input type="hidden" name="adId" value={toInt(a.id)} />
                  <button className="flex items-center gap-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-white" title="اعتماد ونشر"><Check className="h-3.5 w-3.5" /> اعتماد</button>
                </form>
              )}
              <form action={adminToggleSpecialAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border p-1.5 hover:bg-secondary" title="تمييز"><Star className="h-3.5 w-3.5" /></button></form>
              {a.status === 1 && (
                <form action={adminToggleAdStatusAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border p-1.5 hover:bg-secondary" title="إيقاف"><EyeOff className="h-3.5 w-3.5" /></button></form>
              )}
              <form action={adminDeleteAdAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
