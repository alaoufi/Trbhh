import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MapPin, Eye, Phone, MessageCircle, Timer, Tag, Flag, Send,
  User, BadgeCheck, Hash, ArrowLeftRight, Star, Share2, Heart, Navigation,
  ShieldAlert, Trash2, Archive, Ban,
} from 'lucide-react';
import { getAd, getSimilarAds, recordView } from '@/lib/data';
import { hasAction } from '@/lib/roles';
import { adminArchiveAdAction, adminBanSellerAction, adminDeleteAdRedirectAction } from '@/app/admin/actions';
import { getComments } from '@/lib/comments';
import { getSession } from '@/lib/auth';
import { isFavorited } from '@/lib/account';
import { formatPrice, timeAgo } from '@/lib/utils';
import { waLink } from '@/lib/classified-theme';
import { SITE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { FavoriteButton } from '@/components/favorite-button';
import { ShareButtons } from '@/components/share-buttons';
import { AdGrid } from '@/components/ad-card';
import { getSellerRating } from '@/lib/reviews';
import { getViewerLocation, parseLatLng, haversineKm, formatDistanceAr } from '@/lib/geo';
import { addCommentAction } from '@/app/ads/comment-actions';
import { PromoSlot } from '@/components/promo-slot';
import { getAdAudio } from '@/lib/ad-media';
import { mediaUrl } from '@/lib/media';
import { AdGallery } from '@/components/ad-gallery';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(Number(id));
  if (!ad) return { title: 'إعلان غير موجود' };
  return {
    title: ad.title,
    description: ad.detail?.slice(0, 160),
    openGraph: { images: ad.images.slice(0, 1), title: ad.title },
  };
}

function InfoItem({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-primary">
      <Icon className="h-5 w-5 shrink-0" />
      <span className="line-clamp-1 text-sm font-medium">{children}</span>
    </div>
  );
}

function AdMedia({ videoPath, audioPath }: { videoPath: string | null; audioPath: string | null }) {
  if (!videoPath && !audioPath) return null;
  return (
    <div className="space-y-3">
      {videoPath && (
        <div className="card-3d overflow-hidden rounded-2xl p-2">
          <div className="mb-1 flex items-center gap-1.5 px-1 text-sm font-bold text-primary">🎬 فيديو الإعلان</div>
          <video src={mediaUrl(videoPath)} controls playsInline preload="metadata" className="max-h-[70vh] w-full rounded-xl bg-black" />
        </div>
      )}
      {audioPath && (
        <div className="card-3d flex items-center gap-3 rounded-2xl p-3">
          <span className="text-sm font-bold text-primary">🎙️ تسجيل صوتي</span>
          <audio src={mediaUrl(audioPath)} controls className="h-9 flex-1" />
        </div>
      )}
    </div>
  );
}

export default async function AdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(Number(id));
  if (!ad) notFound();

  const session = await getSession();
  const [canArchive, canDeleteAd, canBanSeller] = session
    ? await Promise.all([
        hasAction(session.uid, 'ads', 'archive'),
        hasAction(session.uid, 'ads', 'delete'),
        hasAction(session.uid, 'users', 'edit'),
      ])
    : [false, false, false];
  const admin = canArchive || canDeleteAd || canBanSeller;
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  if (viewerKey && (!session || session.uid !== ad.seller?.id)) {
    await recordView(ad.id, viewerKey);
  }

  const [comments, favorited, similar, sellerRating] = await Promise.all([
    getComments(ad.id),
    session ? isFavorited(session.uid, ad.id) : Promise.resolve(false),
    ad.category ? getSimilarAds(ad.id, ad.category.id, 6) : Promise.resolve([]),
    ad.seller ? getSellerRating(ad.seller.id) : Promise.resolve({ avg: 0, count: 0 }),
  ]);

  const shareUrl = `https://${SITE.domain}/ads/${ad.id}`;
  const waNumber = waLink(ad.seller?.whatsapp);
  // "مراسلة" is always available; WhatsApp/call only when the seller provides them
  const contactCols = 1 + (waNumber ? 1 : 0) + (ad.seller?.phone ? 1 : 0);

  // Distance between the visitor (from the trbhh_geo cookie) and the ad location
  const viewerLoc = await getViewerLocation();
  const adLoc = parseLatLng(ad.lat && ad.lng ? `${ad.lat},${ad.lng}` : null);
  const distanceLabel = viewerLoc && adLoc ? formatDistanceAr(haversineKm(viewerLoc, adLoc)) : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: ad.title,
    description: ad.detail,
    image: ad.images,
    ...(ad.price > 0
      ? { offers: { '@type': 'Offer', price: ad.price, priceCurrency: 'SAR', availability: 'https://schema.org/InStock' } }
      : {}),
  };

  return (
    <div className="space-y-4 pb-16 md:pb-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Gallery with tap-to-zoom lightbox */}
      <AdGallery images={ad.images} title={ad.title} special={ad.special} adsType={ad.adsType} />

      {/* Video / audio — shown prominently right below the images */}
      <AdMedia videoPath={ad.videoPath} audioPath={await getAdAudio(ad.id).catch(() => null)} />

      <h1 className="text-xl font-bold text-primary">{ad.title}</h1>

      {/* Info grid card */}
      <div className="card-3d grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl p-4">
        <InfoItem icon={ArrowLeftRight}>{ad.adsType === 'offer' ? 'عرض' : 'طلب'}</InfoItem>
        <InfoItem icon={Timer}>{timeAgo(ad.createdAt)}</InfoItem>
        <InfoItem icon={MapPin}>{ad.area ? `${ad.area} - ${ad.city}` : (ad.city || 'غير محدد')}</InfoItem>
        <div className="flex items-center gap-2 text-primary">
          <span className="relative">
            <User className="h-5 w-5" />
            {ad.seller?.trusted ? (
              <BadgeCheck className="absolute -bottom-1 -left-1 h-3 w-3 fill-primary text-white" />
            ) : (
              <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </span>
          <Link href={`/users/${ad.seller?.id}`} className="line-clamp-1 text-sm font-medium hover:underline">
            {ad.seller?.name}
          </Link>
        </div>
        {ad.category && <InfoItem icon={Tag}>{ad.category.name}</InfoItem>}
        <InfoItem icon={Star}>{sellerRating.count ? `${sellerRating.avg} (${sellerRating.count})` : '0/0'}</InfoItem>
        <InfoItem icon={Hash}>#{ad.id}</InfoItem>
        <InfoItem icon={Eye}>{ad.views} مشاهدة</InfoItem>
        {distanceLabel && <InfoItem icon={Navigation}>{distanceLabel}</InfoItem>}
      </div>

      {/* Price + description */}
      <div className="card-3d rounded-2xl p-4">
        <div className="mb-3 text-2xl font-bold text-primary">{formatPrice(ad.price)}</div>
        <p className="whitespace-pre-line leading-7 text-foreground/90">{ad.detail}</p>
      </div>

      {/* الموقع على الخريطة — يظهر عند تحديد المعلن لموقع الإعلان */}
      {adLoc && (
        <div className="card-3d rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-primary"><MapPin className="h-4 w-4" /> موقع الإعلان</div>
          {distanceLabel ? (
            <div className="mb-3 flex items-center gap-2 rounded-xl bg-primary/5 p-2.5 text-sm font-bold text-primary">
              <Navigation className="h-4 w-4 shrink-0" /> {distanceLabel}
            </div>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">فعّل موقعك لعرض المسافة بينك وبين الإعلان.</p>
          )}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${adLoc.lat},${adLoc.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white hover:bg-primary/90"
          >
            <Navigation className="h-5 w-5" /> افتح في خرائط قوقل
          </a>
        </div>
      )}


      {/* Paid banner — inside ad details */}
      <PromoSlot placement="ad_detail" />

      {/* Contact tiles — only show channels the seller actually offers */}
      <div className={`grid gap-3 ${contactCols === 3 ? 'grid-cols-3' : contactCols === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {waNumber && (
          <a href={waNumber} target="_blank" rel="noopener noreferrer" className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-[#25D366]">
            <MessageCircle className="h-6 w-6" /> واتساب
          </a>
        )}
        {ad.seller?.phone && (
          <a href={`tel:${ad.seller.phone}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Phone className="h-6 w-6" /> اتصال
          </a>
        )}
        {ad.seller && session && session.uid !== ad.seller.id ? (
          <Link href={`/messages/${ad.seller.id}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Send className="h-6 w-6" /> مراسلة
          </Link>
        ) : (
          <Link href="/login" className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Send className="h-6 w-6" /> مراسلة
          </Link>
        )}
      </div>

      {/* تنويه يظهر في تفاصيل الإعلان فقط */}
      <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-center text-xs font-medium text-amber-900">
        التعامل والدفع يتم خارج المنصة مباشرة بين الطرفين. المنصة وسيلة عرض وربط فقط.
      </p>

      {/* Action tiles: report / rate / share / favorite */}
      <div className="grid grid-cols-4 gap-3">
        <Link href={`/report?type=ad&id=${ad.id}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
          <Flag className="h-5 w-5" /> بلاغ
        </Link>
        <Link href={`/users/${ad.seller?.id}#review`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
          <Star className="h-5 w-5" /> تقييم
        </Link>
        <div className="card-3d flex items-center justify-center rounded-2xl py-3 text-primary">
          <ShareButtons url={shareUrl} title={ad.title} compact />
        </div>
        <div className="card-3d flex items-center justify-center rounded-2xl py-1">
          <FavoriteButton adId={ad.id} active={favorited} disabled={!session} compact />
        </div>
      </div>

      {/* Comments */}
      {ad.commentAllow && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-3 font-bold text-primary">التعليقات ({comments.length})</h2>
          {session ? (
            <form action={addCommentAction} className="mb-4 flex gap-2">
              <input type="hidden" name="adId" value={ad.id} />
              <input type="hidden" name="parentId" value={0} />
              <input name="comment" required placeholder="اكتب تعليقك" className="h-10 flex-1 rounded-lg border border-primary/30 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
              <Button size="icon" aria-label="إرسال"><Send className="h-4 w-4" /></Button>
            </form>
          ) : (
            <Link href="/login" className="mb-4 block text-sm text-primary hover:underline">سجّل الدخول للتعليق</Link>
          )}
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className="flex gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{c.author.charAt(0)}</span>
                <div className="rounded-lg bg-white/70 p-2 ring-1 ring-primary/10">
                  <div className="flex items-center gap-2"><span className="text-sm font-semibold text-primary">{c.author}</span><span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span></div>
                  <p className="text-sm">{c.comment}</p>
                </div>
              </li>
            ))}
            {comments.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تعليقات بعد.</p>}
          </ul>
        </div>
      )}

      {/* Admin moderation controls (only visible to admins) */}
      {admin && (
        <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <div className="mb-3 flex items-center gap-2 text-amber-800">
            <ShieldAlert className="h-5 w-5" /> <span className="font-bold">أدوات الإدارة</span>
          </div>
          <p className="mb-3 text-xs text-amber-800/80">لا يُسمح بتعديل محتوى إعلان العضو حفاظاً على خصوصيته — الأرشفة أو الحذف فقط.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {canArchive && (
              <form action={adminArchiveAdAction}>
                <input type="hidden" name="adId" value={ad.id} />
                <button className="flex w-full items-center justify-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                  <Archive className="h-4 w-4" /> أرشفة / إظهار
                </button>
              </form>
            )}
            {canBanSeller && ad.seller && (
              <form action={adminBanSellerAction}>
                <input type="hidden" name="userId" value={ad.seller.id} />
                <input type="hidden" name="adId" value={ad.id} />
                <button className="flex w-full items-center justify-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                  <Ban className="h-4 w-4" /> حظر العضو
                </button>
              </form>
            )}
            {canDeleteAd && (
              <form action={adminDeleteAdRedirectAction}>
                <input type="hidden" name="adId" value={ad.id} />
                <button className="flex w-full items-center justify-center gap-1 rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-white hover:bg-destructive/90">
                  <Trash2 className="h-4 w-4" /> حذف الإعلان
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Related */}
      {similar.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-primary">إعلانات ذات صلة</h2>
          <AdGrid ads={similar} />
        </section>
      )}

      <DisclaimerBar />
    </div>
  );
}
