import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, EyeOff, Star, Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyAds } from '@/lib/account';
import { getPricing } from '@/lib/settings';
import { getBalance } from '@/lib/wallet';
import { formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { deleteAdAction, toggleAdStatusAction, featureAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي' };

export default async function MyAdsPage({ searchParams }: { searchParams: Promise<{ pending?: string; error?: string; hours?: string; featured?: string; price?: string; bal?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const [ads, pricing, balance] = await Promise.all([getMyAds(session.uid), getPricing(), getBalance(session.uid)]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">إعلاناتي ({ads.length})</h1>
        <div className="flex items-center gap-2">
          <Link href="/account/wallet" className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-bold text-primary"><Wallet className="h-4 w-4" /> رصيدي: {balance} ر.س</Link>
          <Link href="/ads/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">أضف إعلان</Link>
        </div>
      </div>
      {sp.featured === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⭐ تمت ترقية الإعلان إلى «مميّز» وخُصمت الرسوم من رصيدك.</div>}
      {sp.featured === 'already' && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">هذا الإعلان مميّز بالفعل.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي{sp.price ? <> (المطلوب {sp.price} ر.س</> : ''}{sp.bal !== undefined ? <>، ورصيدك {sp.bal} ر.س)</> : ')'}. تواصل مع الإدارة لشحن الرصيد.</div>}
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
              {ad.status !== 1 && (
                <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold leading-4 text-amber-700">
                  سبب عدم الظهور: الإعلان <b>موقوف/بانتظار الموافقة</b> — غالباً لتشابهه مع إعلان قائم (٩٠٪+) أو تفعيل مراجعة الإعلانات. اضغط <b>«تفعيل»</b> لعرضه فوراً، أو احذف النسخة المكرّرة.
                </span>
              )}
              <div className="mt-auto flex gap-2 pt-2">
                <Link href={`/ads/${ad.id}/edit`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Pencil className="h-3 w-3" /> تعديل</Link>
                <form action={toggleAdStatusAction}>
                  <input type="hidden" name="adId" value={ad.id} />
                  <button className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
                    {ad.status === 1 ? <><EyeOff className="h-3 w-3" /> إيقاف</> : <><Eye className="h-3 w-3" /> تفعيل</>}
                  </button>
                </form>
                {pricing.featured > 0 && !ad.special && (
                  <form action={featureAdAction}>
                    <input type="hidden" name="adId" value={ad.id} />
                    <button className="flex items-center gap-1 rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700 hover:bg-amber-100"><Star className="h-3 w-3" /> ترقية لمميّز ({pricing.featured} ر.س)</button>
                  </form>
                )}
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
