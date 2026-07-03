import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, EyeOff } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyAds } from '@/lib/account';
import { formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { deleteAdAction, toggleAdStatusAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي' };

export default async function MyAdsPage({ searchParams }: { searchParams: Promise<{ pending?: string; error?: string; hours?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const ads = await getMyAds(session.uid);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">إعلاناتي ({ads.length})</h1>
        <Link href="/ads/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">أضف إعلان</Link>
      </div>
      {sp.pending === '1' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          إعلانك مشابه لإعلان قائم (تطابق ٩٠٪ في العنوان/التفاصيل أو الصور)، فتم حفظه <b>بانتظار موافقة الإدارة</b> قبل نشره.
        </div>
      )}
      {sp.error === 'deleteWindow' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          انتهت المدة المسموح بها لحذف الإعلان{sp.hours ? ` (${sp.hours} ساعة من النشر)` : ''} حسب إعدادات الموقع. للحذف بعد هذه المدة تواصل مع الإدارة.
        </div>
      )}
      {ads.length === 0 && <p className="py-8 text-center text-muted-foreground">لا توجد إعلانات بعد.</p>}
      <div className="space-y-3">
        {ads.map((ad) => (
          <div key={ad.id} className="flex gap-3 card-3d rounded-xl p-3">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
              <Image src={ad.image} alt={ad.title} fill sizes="80px" className="object-cover" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/ads/${ad.id}`} className="line-clamp-1 font-semibold hover:text-primary">{ad.title}</Link>
                <div className="flex shrink-0 gap-1">
                  {ad.special && <Badge variant="special">مميّز</Badge>}
                  <Badge variant={ad.status === 1 ? 'trusted' : 'special'}>{ad.status === 1 ? 'نشط' : 'بانتظار الموافقة'}</Badge>
                </div>
              </div>
              <span className="text-sm font-bold text-primary">{formatPrice(ad.price, 'ر.س', ad.adsType)}</span>
              <span className="text-xs text-muted-foreground">{timeAgo(ad.createdAt)}</span>
              <div className="mt-auto flex gap-2 pt-2">
                <Link href={`/ads/${ad.id}/edit`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Pencil className="h-3 w-3" /> تعديل</Link>
                <form action={toggleAdStatusAction}>
                  <input type="hidden" name="adId" value={ad.id} />
                  <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                    {ad.status === 1 ? <><EyeOff className="h-3 w-3" /> إيقاف</> : <><Eye className="h-3 w-3" /> تفعيل</>}
                  </button>
                </form>
                <form action={deleteAdAction}>
                  <input type="hidden" name="adId" value={ad.id} />
                  <button className="flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"><Trash2 className="h-3 w-3" /> حذف</button>
                </form>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
