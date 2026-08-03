import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BadgeCheck, Megaphone, Eye, Star, MessageCircle, Phone, Send, CalendarDays, Ban, ShieldOff } from 'lucide-react';
import { blockUserAction, unblockUserAction } from '@/app/messages/actions';
import { prisma } from '@/lib/prisma';
import { timeAgo } from '@/lib/utils';
import { getMyAds } from '@/lib/account';
import { getSellerRating, getUserReviews, canReview } from '@/lib/reviews';
import { getEmptyText } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { AdGrid } from '@/components/ad-card';
import { Stars } from '@/components/stars';
import { ReviewForm } from '@/components/review-form';
import { PromoSlot } from '@/components/promo-slot';
import { ShareButtons } from '@/components/share-buttons';
import { SITE } from '@/lib/constants';
import { mediaUrl } from '@/lib/media';
import { CATEGORY_LABEL, type GuardCategory } from '@/lib/content-guard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) return { title: 'ملف العضو' };
  const u = await prisma.users.findUnique({ where: { id: BigInt(uid) }, select: { name: true, userName: true } }).catch(() => null);
  return { title: u?.name || u?.userName || 'ملف العضو' };
}

export default async function UserProfilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ error?: string; cat?: string; banned?: string }> }) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const uid = Number(id);
  if (!Number.isInteger(uid) || uid <= 0) notFound();
  const user = await prisma.users.findUnique({ where: { id: BigInt(uid) } });
  if (!user) notFound();

  const session = await getSession();
  const [myAdsAll, rating, reviews, allowReview] = await Promise.all([
    getMyAds(uid),
    getSellerRating(uid),
    getUserReviews(uid),
    canReview(uid, session?.uid),
  ]);
  // الملف العام يعرض إعلانات تربح النشطة فقط — منتجات المتاجر تبقى داخل متجرها
  const myAds = myAdsAll.filter((a) => (!a.storeOnly || (a.trbhhUntil && new Date(a.trbhhUntil) > new Date())) && a.status === 1 && a.state === 'active');
  // viewing your OWN profile clears the "new reviews" alert
  if (session && session.uid === uid) {
    const { markSeen } = await import('@/lib/alerts');
    await markSeen(uid, 'reviews').catch(() => {});
  }
  const active = myAds.filter((a) => a.status === 1);
  // عدد الصفقات المكتملة — يظهر في بطاقة الوسيط المرخّص فقط
  const dealsDone = user.re_license ? await import('@/lib/viewings').then((m) => m.dealsCount(uid)).catch(() => 0) : 0;
  // مجموع مشاهدات إعلانات العضو المعروضة في تربح
  const viewsSum = active.length
    ? await prisma.ads_views.count({ where: { ads_id: { in: active.map((a) => BigInt(a.id)) } } }).catch(() => 0)
    : 0;
  // التواصل حسب خصوصية العضو (نفس قواعد صفحة الإعلان)
  const phone = user.allow_phone ? user.phoneNumber : null;
  const wa = user.whatsapp ? (user.phone_whatsapp || user.phoneNumber) : null;
  const waHref = wa ? `https://wa.me/${String(wa).replace(/\D/g, '').replace(/^0/, '966')}` : null;
  const isOwnProfile = !!(session && session.uid === uid);
  const iBlocked = session && !isOwnProfile ? await import('@/lib/blocks').then((m) => m.hasBlocked(session.uid, uid)).catch(() => false) : false;
  const profileUrl = `https://${SITE.domain}/users/${uid}`;
  const displayName = user.name || user.userName || 'مستخدم';
  const en = (n: number) => new Intl.NumberFormat('en-US').format(n);
  const ads = active.map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special,
        urgent: false, views: 0, sellerName: null, sellerTrusted: false }));

  return (
    <div className="space-y-4">
      {/* Paid banner — member page */}
      <PromoSlot placement="member" />

      <div className="card-3d rounded-xl p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-accent text-2xl font-bold text-accent-foreground">
            {(user.name || user.userName || 'ع').charAt(0)}
          </span>
          <div>
            <div className="flex items-center gap-1 text-lg font-bold">
              {user.name || user.userName || 'مستخدم'}
              {user.trusted === 1 && <BadgeCheck className="h-5 w-5 text-primary" />}
              {user.re_license && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800">🏢 وسيط مرخّص</span>}
            </div>
            <div className="text-sm text-muted-foreground">عضو منذ {timeAgo(user.created_at)} · {active.length} إعلان نشط</div>
            {rating.count > 0 && (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <Stars value={rating.avg} /> <span className="font-semibold">{rating.avg}</span>
                <span className="text-muted-foreground">({rating.count} تقييم)</span>
              </div>
            )}
          </div>
        </div>

        {/* إحصائيات العضو — بنفس تصميم صفحة المتجر */}
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-secondary/40 p-2">
            <div className="flex items-center justify-center gap-1 font-bold text-primary"><Megaphone className="h-4 w-4" /> {en(active.length)}</div>
            <div className="text-[11px] text-muted-foreground">إعلان</div>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2">
            <div className="flex items-center justify-center gap-1 font-bold text-primary"><Eye className="h-4 w-4" /> {en(viewsSum)}</div>
            <div className="text-[11px] text-muted-foreground">مشاهدة</div>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2">
            <div className="flex items-center justify-center gap-1 font-bold text-primary"><CalendarDays className="h-4 w-4" /></div>
            <div className="text-[11px] text-muted-foreground">عضو {timeAgo(user.created_at)}</div>
          </div>
          <div className="rounded-xl bg-secondary/40 p-2">
            <div className="flex items-center justify-center gap-1 font-bold text-primary"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /> {rating.avg}</div>
            <div className="text-[11px] text-muted-foreground">تقييم ({en(rating.count)})</div>
          </div>
        </div>

        {/* بطاقة الوسيط العقاري المرخّص (فال) — الوساطة العقارية */}
        {user.re_license && (
          <div className="mt-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-emerald-900">🏢 وسيط عقاري مرخّص — رخصة فال</div>
              <div className="font-mono text-sm font-extrabold text-emerald-900" dir="ltr">{user.re_license}</div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white/70 p-2"><div className="text-base font-extrabold text-emerald-800">{en(active.length)}</div><div className="text-[11px] text-emerald-700">عقار مسوّق</div></div>
              <div className="rounded-lg bg-white/70 p-2"><div className="text-base font-extrabold text-emerald-800">{en(dealsDone)}</div><div className="text-[11px] text-emerald-700">صفقة مكتملة</div></div>
              <div className="rounded-lg bg-white/70 p-2"><div className="text-base font-extrabold text-emerald-800">{rating.avg} <span className="text-[11px] font-normal">({en(rating.count)})</span></div><div className="text-[11px] text-emerald-700">تقييم العملاء</div></div>
            </div>
            <div className="mt-1.5 text-[11px] text-emerald-700">مرخّص من الهيئة العامة للعقار — رقم الترخيص يظهر على كل عقاراته.</div>
          </div>
        )}

        {/* أزرار سطر واحد بالأيقونات: مراسلة، واتساب، اتصال، مشاركة */}
        <div className="mt-3 flex gap-2">
          {!isOwnProfile && (
            <Link href={session ? `/messages/${uid}` : '/login'} aria-label="مراسلة" title="مراسلة" className="grid h-11 flex-1 place-items-center rounded-xl bg-primary text-white shadow-sm">
              <Send className="h-5 w-5" />
            </Link>
          )}
          {waHref && (
            <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="واتساب" title="واتساب" className="grid h-11 flex-1 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
              <MessageCircle className="h-5 w-5" />
            </a>
          )}
          {phone && (
            <a href={`tel:${phone}`} aria-label="اتصال" title="اتصال" className="grid h-11 flex-1 place-items-center rounded-xl border bg-white text-primary shadow-sm">
              <Phone className="h-5 w-5" />
            </a>
          )}
          <span className="h-11 flex-1 rounded-xl border bg-white text-primary shadow-sm" title="مشاركة">
            <ShareButtons
              url={profileUrl}
              title={`${displayName} على تربح`}
              text={[`${displayName} على تربح`, `${active.length} إعلان نشط`].join('\n')}
              compact
              iconOnly
              card={{ url: profileUrl, title: displayName, city: '', image: user.photo_path ? mediaUrl(user.photo_path) : '/logo-aqar-256.png' }}
            />
          </span>
        </div>

        {/* حظر/رفع حظر العضو — يمنع المراسلة بين الطرفين (متطلّب سياسات المتاجر) */}
        {session && !isOwnProfile && (
          iBlocked ? (
            <form action={unblockUserAction} className="mt-2">
              <input type="hidden" name="userId" value={uid} />
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/30 py-2 text-sm font-bold text-primary hover:bg-accent">
                <ShieldOff className="h-4 w-4" /> رفع الحظر عن هذا العضو
              </button>
            </form>
          ) : (
            <form action={blockUserAction} className="mt-2">
              <input type="hidden" name="userId" value={uid} />
              <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 py-2 text-sm font-bold text-destructive hover:bg-destructive/10">
                <Ban className="h-4 w-4" /> حظر هذا العضو
              </button>
            </form>
          )
        )}
        {iBlocked && <p className="mt-1 text-center text-[11px] text-muted-foreground">أنت حظرت هذا العضو — لا يمكنكما تبادل الرسائل.</p>}
      </div>

      <h2 className="text-lg font-bold">إعلانات العضو</h2>
      <AdGrid ads={ads} />

      <section id="review" className="scroll-mt-20 space-y-3">
        <h2 className="text-lg font-bold text-primary">التقييمات ({reviews.length})</h2>
        {sp.error === 'blocked' && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-800">
            تعذّر نشر تقييمك — يحتوي محتوى ممنوعاً ({CATEGORY_LABEL[sp.cat as GuardCategory] || sp.cat}).
            {sp.banned === '1' && ' تم حظر حسابك بسبب هذه المخالفة.'}
          </div>
        )}
        {allowReview ? (
          <ReviewForm reciverId={uid} />
        ) : !session ? (
          <Link href="/login" className="card-3d block rounded-xl p-3 text-center text-sm text-primary">سجّل الدخول لتقييم هذا العضو</Link>
        ) : session.uid === uid ? (
          <p className="text-sm text-muted-foreground">لا يمكنك تقييم نفسك.</p>
        ) : (
          <p className="text-sm text-muted-foreground">لقد قيّمت هذا العضو مسبقاً.</p>
        )}
        <ul className="space-y-2">
          {reviews.map((r) => (
            <li key={r.id} className="card-3d rounded-xl p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.author}</span>
                <Stars value={r.star} />
              </div>
              {r.review && <p className="mt-1 text-sm text-foreground/90">{r.review}</p>}
              <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
            </li>
          ))}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">{await getEmptyText('reviews').catch(() => 'لا توجد تقييمات بعد.')}</p>}
        </ul>
      </section>
    </div>
  );
}
