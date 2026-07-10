import Link from 'next/link';
import Image from 'next/image';
import { Pencil, Trash2, Eye, EyeOff, Wallet } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { getMyAds, adContactCounts } from '@/lib/account';
import { getServicePricing, serviceHasPrice, DURATIONS, getAdExtras, getSettingBool } from '@/lib/settings';
import { getBalance } from '@/lib/wallet';
import { formatPrice, timeAgo } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { deleteAdAction, toggleAdStatusAction, featureAdAction, buyUrgentAction, bumpAdAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'إعلاناتي' };

export default async function MyAdsPage({ searchParams }: { searchParams: Promise<{ pending?: string; error?: string; hours?: string; featured?: string; price?: string; bal?: string; urgent?: string; urgentneed?: string; featuredneed?: string; bumped?: string; bumpwait?: string; scheduled?: string }> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const [ads, servicePricing, balance, extras, bumpOn, contactStatsOn, auctionOn] = await Promise.all([
    getMyAds(session.uid), getServicePricing(), getBalance(session.uid), getAdExtras(),
    getSettingBool('bump_on', false), getSettingBool('ad_contact_stats_on', true), getSettingBool('auction_on', false),
  ]);
  const contacts = contactStatsOn ? await adContactCounts(ads.map((a) => a.id)) : new Map<number, { whatsapp: number; call: number }>();
  const now = Date.now();
  const featuredSold = serviceHasPrice(servicePricing.featured);
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const fmtDay = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(d); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold">إعلاناتي ({ads.length})</h1>
        <div className="flex items-center gap-2">
          <Link href="/account/wallet" className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-bold text-primary"><Wallet className="h-4 w-4" /> رصيدي: {balance} ر.س</Link>
          <Link href="/ads/new" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">أضف إعلان</Link>
        </div>
      </div>
      {sp.featured === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⭐ تم تمييز الإعلان وخُصمت الرسوم من رصيدك.</div>}
      {sp.urgent === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🔥 فُعّلت شارة «عاجل» وخُصمت الرسوم من رصيدك.</div>}
      {sp.bumped === '1' && <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⬆ تم تحديث إعلانك — أصبح في مقدمة القوائم.</div>}
      {sp.bumpwait && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">⬆ التحديث المجاني متاح بعد {sp.bumpwait} يوم — أو فعّل التحديث المدفوع إن وُفّر.</div>}
      {sp.scheduled === '1' && <div className="rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm font-bold text-sky-800">🕒 حُفظ إعلانك وسيُنشر تلقائياً في الموعد الذي حددته.</div>}
      {sp.error === 'needcredit' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يكفي{sp.price ? <> (المطلوب {sp.price} ر.س</> : ''}{sp.bal !== undefined ? <>، ورصيدك {sp.bal} ر.س)</> : ')'}. <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}
      {sp.urgentneed === '1' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 حُفظ إعلانك، لكن رصيدك لا يغطي شارة «عاجل» — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم فعّلها بزر «🔥 عاجل» أسفل الإعلان.</div>}
      {sp.featuredneed === '1' && <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 حُفظ إعلانك، لكن رصيدك لا يغطي رسوم التمييز ⭐ — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم ميّزه من «تمييز الإعلان (مدفوع)» أسفل الإعلان.</div>}
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
                  {ad.urgentUntil && new Date(ad.urgentUntil).getTime() > now && <span className="animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">🔥 عاجل</span>}
                  <Badge variant={ad.status === 1 ? 'trusted' : 'special'}>{ad.status === 1 ? 'نشط' : ad.publishAt ? `مجدول: ${fmtDay(ad.publishAt)}` : 'بانتظار الموافقة'}</Badge>
                </div>
              </div>
              <span className="text-sm font-bold text-primary">{formatPrice(ad.price, 'ر.س', ad.adsType)}</span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(ad.createdAt)}
                {contactStatsOn && (() => { const c = contacts.get(ad.id); return c && (c.whatsapp + c.call) > 0 ? <> • 💬 {c.whatsapp} واتساب • 📞 {c.call} اتصال</> : null; })()}
              </span>
              {ad.status !== 1 && (
                <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold leading-4 text-amber-700">
                  سبب عدم الظهور: الإعلان <b>موقوف/بانتظار الموافقة</b> — غالباً لتشابهه مع إعلان قائم (٩٠٪+) أو تفعيل مراجعة الإعلانات. اضغط <b>«تفعيل»</b> لعرضه فوراً، أو احذف النسخة المكرّرة.
                </span>
              )}
              {ad.special && ad.expiresAt && (
                <span className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-bold leading-4 text-amber-700">⭐ مميّز حتى {fmtDay(ad.expiresAt)}.</span>
              )}
              {featuredSold && (
                <details className="mt-1">
                  <summary className="cursor-pointer list-none text-[11px] font-bold text-amber-700">{ad.special ? 'تمديد التمييز…' : 'تمييز الإعلان (مدفوع)…'}</summary>
                  <form action={featureAdAction} className="mt-1 flex flex-wrap items-center gap-1">
                    <input type="hidden" name="adId" value={ad.id} />
                    <select name="duration" className="h-8 rounded-md border bg-background px-2 text-xs">
                      {DURATIONS.filter((d) => servicePricing.featured[d.key] > 0).map((d) => (
                        <option key={d.key} value={d.key}>{d.label} — {en(servicePricing.featured[d.key])} ر.س</option>
                      ))}
                    </select>
                    <button className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-bold text-white">تمييز</button>
                  </form>
                </details>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <Link href={`/ads/${ad.id}/edit`} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-secondary"><Pencil className="h-3 w-3" /> تعديل</Link>
                {bumpOn && ad.status === 1 && !ad.storeOnly && (
                  <form action={bumpAdAction}>
                    <input type="hidden" name="adId" value={ad.id} />
                    <button className="flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-xs font-bold text-sky-700 hover:bg-sky-100" title="رفع الإعلان لأعلى القوائم">⬆ تحديث</button>
                  </form>
                )}
                {auctionOn && ad.status === 1 && !ad.storeOnly && (
                  <Link href={`/auctions/new?ad=${ad.id}`} className="flex items-center gap-1 rounded-md border border-violet-300 bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100" title="افتح مزاداً على هذا الإعلان">🔨 مزاد</Link>
                )}
                {extras.urgentPrice > 0 && ad.status === 1 && !ad.storeOnly && (
                  <form action={buyUrgentAction}>
                    <input type="hidden" name="adId" value={ad.id} />
                    <button className="flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100">🔥 عاجل ({extras.urgentPrice} ر.س)</button>
                  </form>
                )}
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
