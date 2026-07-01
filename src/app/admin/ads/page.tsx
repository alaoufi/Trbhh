import Link from 'next/link';
import { Star, Trash2, Eye, EyeOff } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { toInt, formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { adminDeleteAdAction, adminToggleSpecialAction, adminToggleAdStatusAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إدارة الإعلانات' };

export default async function AdminAds() {
  const ads = await prisma.ads.findMany({ orderBy: { id: 'desc' }, take: 50 });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الإعلانات</h1>
      <div className="space-y-2">
        {ads.map((a) => (
          <div key={toInt(a.id)} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
            <Link href={`/ads/${toInt(a.id)}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">{a.title}</Link>
            <span className="text-sm text-primary">{formatPrice(a.price)}</span>
            {a.adsSpecial === 'checked' && <Badge variant="special">مميّز</Badge>}
            <Badge variant={a.status === 1 ? 'trusted' : 'muted'}>{a.status === 1 ? 'نشط' : 'موقوف'}</Badge>
            <span className="text-xs text-muted-foreground">{timeAgo(a.created_at)}</span>
            <div className="flex gap-1">
              <form action={adminToggleSpecialAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border p-1.5 hover:bg-secondary" title="تمييز"><Star className="h-3.5 w-3.5" /></button></form>
              <form action={adminToggleAdStatusAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border p-1.5 hover:bg-secondary" title="تفعيل/إيقاف">{a.status === 1 ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button></form>
              <form action={adminDeleteAdAction}><input type="hidden" name="adId" value={toInt(a.id)} /><button className="rounded-md border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10" title="حذف"><Trash2 className="h-3.5 w-3.5" /></button></form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
