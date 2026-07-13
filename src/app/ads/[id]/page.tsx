import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import {
  MapPin, Eye, Phone, MessageCircle, Timer, Tag, Flag, Send,
  User, BadgeCheck, Hash, ArrowLeftRight, Star, Share2, Heart, Navigation,
  ShieldAlert, Trash2, Archive, Ban, Store,
} from 'lucide-react';
import { SplashSuppress } from '@/components/splash-suppress';
import { getAd, getSimilarAds, getSellerAds, recordView } from '@/lib/data';
import { hasAction } from '@/lib/roles';
import { adminArchiveAdAction, adminBanSellerAction, adminDeleteAdRedirectAction } from '@/app/admin/actions';
import { getComments } from '@/lib/comments';
import { getSession } from '@/lib/auth';
import { isFavorited } from '@/lib/account';
import { formatPrice, timeAgo } from '@/lib/utils';
import { waLink } from '@/lib/classified-theme';
import { getAdNotice, getAdMsgTemplates, parseTemplates, fillTemplate } from '@/lib/settings';
import { SITE } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { FavoriteButton } from '@/components/favorite-button';
import { ShareButtons } from '@/components/share-buttons';
import { ConfirmSubmit } from '@/components/confirm-submit';
import { ExpandableDetail } from '@/components/expandable-detail';
import { TrackedContact } from '@/components/ad-contact-track';
import { AdGrid } from '@/components/ad-card';
import { getSellerRating } from '@/lib/reviews';
import { getViewerLocation, parseLatLng, haversineKm, formatDistanceAr } from '@/lib/geo';
import { addCommentAction } from '@/app/ads/comment-actions';
import { buyUrgentAction, featureAdAction, bumpAdAction } from '@/app/account/actions';
import { PromoSlot } from '@/components/promo-slot';
import { getAdAudio } from '@/lib/ad-media';
import { mediaUrl } from '@/lib/media';
import { AdGallery } from '@/components/ad-gallery';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ad = await getAd(Number(id));
  if (!ad) return { title: 'إعلان غير موجود' };
  // معاينة الرابط (واتساب/تويتر…): العنوان + أول الإعلان
  const desc = (ad.detail || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  return {
    title: ad.title,
    description: desc,
    openGraph: { images: (ad.images || []).slice(0, 1), title: ad.title, description: desc },
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

export default async function AdPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ cblocked?: string; urgent?: string; urgentneed?: string; featured?: string; featuredneed?: string; bumped?: string; bumpwait?: string; bumpneed?: string }> }) {
  const { id } = await params;
  const spx = searchParams ? await searchParams : {};
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
  // إعلان غير نشط (بانتظار الموافقة/مؤرشف/موقوف): لا يراه إلا صاحبه أو الإدارة
  const ownerViewing = !!(session && ad.seller && session.uid === ad.seller.id);
  if ((ad.status !== 1 || ad.state !== 'active') && !ownerViewing && !admin) notFound();
  // إعلان عضو محظور: لا يراه الزوّار — يبقى لصاحبه وللإدارة (لرفع الحظر/الحذف)
  if (ad.seller?.banned && !ownerViewing && !admin) notFound();
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  if (viewerKey && (!session || session.uid !== ad.seller?.id)) {
    await recordView(ad.id, viewerKey);
  }

  const [comments, favorited, similarRaw, sellerAds, sellerRating] = await Promise.all([
    getComments(ad.id),
    session ? isFavorited(session.uid, ad.id) : Promise.resolve(false),
    ad.category ? getSimilarAds(ad.id, ad.category.id, 6) : Promise.resolve([]),
    ad.seller ? getSellerAds(ad.seller.id, ad.id, 6).catch(() => []) : Promise.resolve([]),
    ad.seller ? getSellerRating(ad.seller.id) : Promise.resolve({ avg: 0, count: 0 }),
  ]);
  // «ذات صلة» لنفس المعلن — و«المشابهة» بلا تكرار لما ظهر في إعلانات المعلن
  const sellerAdIds = new Set(sellerAds.map((a) => a.id));
  const similar = similarRaw.filter((a) => !sellerAdIds.has(a.id));

  // هل هذا إعلان متجر (معروض في واجهة متجر مستقل)؟ إن كان، فالمتجر مستقل:
  // نمنع ظهور مبوّبات تربح ونعرض رابطاً واضحاً «زيارة المتجر».
  const { storeIdOfUser, storeProductAdIds, getStoreMeta } = await import('@/lib/merchant');
  const sellerStoreId = ad.seller ? await storeIdOfUser(ad.seller.id).catch(() => 0) : 0;
  const inStore = sellerStoreId ? (await storeProductAdIds(sellerStoreId).catch(() => [] as number[])).includes(ad.id) : false;
  // عزل تام: منتج المتجر يُعرض داخل متجره فقط — إلا بعرض مدفوع ساري («الظهور في تربح»)
  const shownInTrbhh = !!(ad.trbhhUntil && new Date(ad.trbhhUntil) > new Date());
  if (inStore && ad.storeOnly && !shownInTrbhh) redirect(`/companies/${sellerStoreId}/p/${ad.id}`);
  const storeMeta = inStore ? await getStoreMeta(sellerStoreId).catch(() => null) : null;
  // رابط المتجر بالمسار المباشر (النطاق الفرعي يتطلب DNS Wildcard غير مجهز)
  const storeUrl = inStore ? `/companies/${storeMeta?.handle || sellerStoreId}` : '';

  const shareUrl = inStore ? (storeUrl.startsWith('http') ? storeUrl : `https://${SITE.domain}/companies/${sellerStoreId}`) : `https://${SITE.domain}/ads/${ad.id}`;
  // نص واتساب مُعبّأ مسبقاً: نص المتجر إن كان إعلان متجر، وإلا نص تربح لمراسلة صاحب الإعلان
  const [adNotice, adTpls] = await Promise.all([getAdNotice(), getAdMsgTemplates()]);
  // إخفاء الأقسام: يخفي سطر القسم من التفاصيل فقط — قسم الإعلان محفوظ كما هو
  const catsOn = await import('@/lib/settings').then((m) => m.categoriesEnabled()).catch(() => true);
  const storeTpls = parseTemplates(storeMeta?.msgTemplates);
  const baseTpl = (inStore && storeTpls.length ? storeTpls[0] : adTpls[0]) || '';
  // {link} = رابط الإعلان (يُضاف تلقائياً في واتساب)، {name} = عنوان الإعلان
  const waMsg = fillTemplate(baseTpl, { link: shareUrl, name: ad.title, appendLink: true });
  const waNumber = waLink(ad.seller?.whatsapp, waMsg);
  // صاحب الإعلان لا يرى المراسلة/البلاغ/التقييم على إعلانه (لا يراسل/يبلّغ/يقيّم نفسه)
  const isAdOwner = !!(session && ad.seller && session.uid === ad.seller.id);
  // "مراسلة" available to non-owners; WhatsApp/call only when the seller provides them
  const contactCols = (isAdOwner ? 0 : 1) + (waNumber ? 1 : 0) + (ad.seller?.phone ? 1 : 0);

  // شارة عاجل لصاحب الإعلان: زر تفعيل مباشر — يغطي الرصيد → خصم، لا يغطي → دعوة لشحن الرصيد
  const urgentActive = !!(ad.urgentUntil && new Date(ad.urgentUntil) > new Date());
  const urgentExtras = isAdOwner && !ad.storeOnly && ad.status === 1
    ? await import('@/lib/settings').then((m) => m.getAdExtras()).catch(() => null)
    : null;
  // التمييز ⭐ لصاحب الإعلان: مدد مسعّرة + زر شراء مباشر
  const featuredOpts = isAdOwner && !ad.storeOnly && ad.status === 1 && !ad.special
    ? await import('@/lib/settings').then(async (m) => {
        const svc = await m.getServicePricing();
        return m.DURATIONS.map((d) => ({ key: d.key, label: d.label, price: svc.featured[d.key] })).filter((o) => o.price > 0);
      }).catch(() => [])
    : [];
  const ownerBalance = (urgentExtras && urgentExtras.urgentPacks.length > 0) || featuredOpts.length
    ? await import('@/lib/wallet').then((m) => m.getBalance(session!.uid)).catch(() => 0)
    : 0;
  const urgentBalance = ownerBalance;
  // خدمات تسويق إضافية لصاحب الإعلان: التحديث ⬆ والمزاد 🔨 (كل منها بمفتاحه من التحكم)
  const [bumpOn, auctionOn] = isAdOwner && !ad.storeOnly && ad.status === 1
    ? await Promise.all([
        import('@/lib/settings').then((m) => m.getSettingBool('bump_on', false)).catch(() => false),
        import('@/lib/settings').then((m) => m.auctionsEnabled()).catch(() => false),
      ])
    : [false, false];

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

      {/* نتيجة طلب شارة عاجل (من نموذج النشر أو زر التفعيل هنا) */}
      {spx.urgent === '1' && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">🔥 فُعّلت شارة «عاجل» على إعلانك وخُصمت الرسوم من رصيدك.</div>}
      {spx.urgentneed === '1' && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          💳 نُشر إعلانك، لكن رصيدك لا يغطي شارة «عاجل» —{' '}
          <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم فعّلها بالزر أدناه.
        </div>
      )}

      {/* نتيجة طلب التمييز ⭐ */}
      {spx.featured === '1' && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⭐ تم تمييز إعلانك وخُصمت الرسوم من رصيدك — أصبح بإطار ذهبي وفي مقدمة القوائم.</div>}
      {spx.featuredneed === '1' && (
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">
          💳 نُشر إعلانك، لكن رصيدك لا يغطي رسوم التمييز —{' '}
          <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم ميّزه بالزر أدناه.
        </div>
      )}

      {/* التمييز ⭐ — عرض تسويقي دائم لصاحب الإعلان النشط غير المميّز */}
      {featuredOpts.length > 0 && (
        <form action={featureAdAction} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50/70 p-3 shadow-sm">
          <input type="hidden" name="adId" value={ad.id} />
          <input type="hidden" name="back" value="ad" />
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-extrabold text-white">⭐ مميّز</span>
          <span className="min-w-0 flex-1 text-xs font-bold text-amber-800">
            ميّز إعلانك بإطار ذهبي بارز ومقدمة القوائم — مشاهدات وتواصل أعلى بكثير.
            <span className="block font-medium text-muted-foreground">رصيدك: {ownerBalance} ر.س — <Link href="/account/wallet#topup" className="font-bold text-primary underline">اشحن رصيدك</Link> إن احتجت.</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <select name="duration" className="h-9 rounded-lg border border-amber-300 bg-white px-2 text-xs font-bold">
              {featuredOpts.map((o) => <option key={o.key} value={o.key}>{o.label} — {o.price} ر.س</option>)}
            </select>
            <ConfirmSubmit msg="تأكيد تمييز الإعلان للمدة المختارة؟ سيُخصم السعر من رصيدك فوراً." className="btn-3d rounded-lg bg-amber-500 px-3 py-2 text-sm font-extrabold text-white">تمييز الآن</ConfirmSubmit>
          </span>
        </form>
      )}

      {/* شارة عاجل — باقتا 24/48 ساعة: عرض تسويقي دائم لصاحب الإعلان النشط */}
      {urgentExtras && urgentExtras.urgentPacks.length > 0 && !urgentActive && (
        <form action={buyUrgentAction} className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-red-300 bg-red-50/70 p-3 shadow-sm">
          <input type="hidden" name="adId" value={ad.id} />
          <input type="hidden" name="back" value="ad" />
          <span className="animate-pulse rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">🔥 عاجل</span>
          <span className="min-w-0 flex-1 text-xs font-bold text-red-700">
            اجعل إعلانك يلفت الأنظار بشارة «عاجل» النابضة في كل القوائم — اختر الباقة.
            <span className="block font-medium text-muted-foreground">رصيدك: {urgentBalance} ر.س — <Link href="/account/wallet#topup" className="font-bold text-primary underline">اشحن رصيدك</Link> إن احتجت.</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <select name="hours" className="h-9 rounded-lg border border-red-300 bg-white px-2 text-xs font-bold">
              {urgentExtras.urgentPacks.map((p0) => <option key={p0.hours} value={p0.hours}>{p0.hours} ساعة — {p0.price} ر.س</option>)}
            </select>
            <ConfirmSubmit msg="تأكيد تفعيل شارة «عاجل» للباقة المختارة؟ سيُخصم السعر من رصيدك فوراً." className="btn-3d rounded-lg bg-red-600 px-3 py-2 text-sm font-extrabold text-white">تفعيل الآن</ConfirmSubmit>
          </span>
        </form>
      )}

      {/* نتيجة تحديث الإعلان ⬆ */}
      {spx.bumped === '1' && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">⬆ تم تحديث إعلانك — أصبح في مقدمة القوائم الآن.</div>}
      {spx.bumpwait && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-900">⬆ التحديث المجاني متاح بعد {spx.bumpwait} يوم.</div>}
      {spx.bumpneed === '1' && <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm font-bold text-amber-900">💳 رصيدك لا يغطي رسوم التحديث المبكر — <Link href="/account/wallet#topup" className="text-primary underline">اشحن رصيدك من هنا</Link> ثم أعد المحاولة.</div>}

      {/* خدمات تسويق إضافية لصاحب الإعلان: تحديث ⬆ + مزاد 🔨 + الشرح المتحرك */}
      {(bumpOn || auctionOn) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-3">
          <span className="text-xs font-extrabold text-primary">🚀 سوّق إعلانك أكثر:</span>
          {bumpOn && (
            <form action={bumpAdAction}>
              <input type="hidden" name="adId" value={ad.id} />
              <input type="hidden" name="back" value="ad" />
              <ConfirmSubmit msg="تأكيد تحديث الإعلان (رفعه لأعلى القوائم)؟ إن لم يكن التحديث المجاني متاحاً يُخصم السعر من رصيدك." title="ارفع إعلانك لأعلى القوائم" className="btn-3d rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-100">⬆ حدّث إعلانك للأعلى</ConfirmSubmit>
            </form>
          )}
          {auctionOn && (
            <Link href={`/auctions/new?ad=${ad.id}`} className="btn-3d rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-100" title="دع المشترين يتنافسون على السعر">🔨 افتح مزاداً عليه</Link>
          )}
          <a href="/guide/how/ad-boost" target="_blank" className="mr-auto text-xs font-extrabold text-red-600 underline">🎬 مميزات تزيد في تسويق إعلانك</a>
        </div>
      )}

      {/* إعلان متجر مستقل: امنع مبوّبات تربح واعرض رابط زيارة المتجر */}
      {inStore && <SplashSuppress />}
      {inStore && storeUrl && (
        <a href={storeUrl} className="flex items-center justify-between gap-2 rounded-xl border-2 border-primary/25 bg-primary/5 p-3 text-sm font-bold text-primary">
          <span className="flex items-center gap-2"><Store className="h-5 w-5" /> هذا الإعلان ضمن متجر {storeMeta?.storeName || ''}</span>
          <span className="text-xs">زيارة المتجر ←</span>
        </a>
      )}

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
        {catsOn && ad.category && <InfoItem icon={Tag}>{ad.category.name}</InfoItem>}
        <InfoItem icon={Star}>{sellerRating.count ? `${sellerRating.avg} (${sellerRating.count})` : '0/0'}</InfoItem>
        <InfoItem icon={Hash}>#{ad.id}</InfoItem>
        <InfoItem icon={Eye}>{ad.views} مشاهدة</InfoItem>
        {distanceLabel && <InfoItem icon={Navigation}>{distanceLabel}</InfoItem>}
      </div>

      {/* Price + description */}
      <div className="card-3d rounded-2xl p-4">
        {ad.urgentUntil && new Date(ad.urgentUntil) > new Date() && (
          <span className="mb-2 inline-block animate-pulse rounded-full bg-red-600 px-3 py-1 text-xs font-extrabold text-white shadow">🔥 عاجل</span>
        )}
        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          {(ad.price > 0 || ad.adsType === 'request') && <span className="text-2xl font-bold text-primary">{ad.price > 0 ? formatPrice(ad.price) : 'مطلوب'}</span>}
          {/* نوع السعر: تأجير بمدته أو بيع */}
          {ad.price > 0 && ad.priceType === 'rent' && <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-extrabold text-primary">🔑 تأجير {ad.rentPeriod || ''}</span>}
          {ad.price > 0 && ad.priceType === 'sale' && <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800">💰 بيع</span>}
          {/* عروض اليوم: السعر قبل الخصم مشطوب + نسبة الخصم */}
          {ad.oldPrice > ad.price && ad.price > 0 && (
            <>
              <span className="text-sm text-muted-foreground line-through" dir="ltr">{formatPrice(ad.oldPrice)}</span>
              <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">خصم {Math.round((1 - ad.price / ad.oldPrice) * 100)}٪</span>
            </>
          )}
        </div>
        <ExpandableDetail text={ad.detail || ""} />
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
          <TrackedContact adId={ad.id} kind="whatsapp" href={waNumber} target="_blank" className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-[#25D366]">
            <MessageCircle className="h-6 w-6" /> واتساب
          </TrackedContact>
        )}
        {ad.seller?.phone && (
          <TrackedContact adId={ad.id} kind="call" href={`tel:${ad.seller.phone}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Phone className="h-6 w-6" /> اتصال
          </TrackedContact>
        )}
        {!isAdOwner && (
          ad.seller && session ? (
            <Link href={`/messages/${ad.seller.id}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
              <Send className="h-6 w-6" /> مراسلة
            </Link>
          ) : (
            <Link href="/login" className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
              <Send className="h-6 w-6" /> مراسلة
            </Link>
          )
        )}
      </div>

      {/* تنويه يظهر في تفاصيل الإعلان فقط */}
      {adNotice && (
        <p className="rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-center text-xs font-medium text-amber-900">
          {adNotice}
        </p>
      )}

      {/* Action tiles: (report + rate تظهر لغير صاحب الإعلان) / share / favorite */}
      <div className={`grid gap-3 ${isAdOwner ? 'grid-cols-2' : 'grid-cols-4'}`}>
        {!isAdOwner && (
          <Link href={`/report?type=ad&id=${ad.id}`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Flag className="h-5 w-5" /> بلاغ
          </Link>
        )}
        {!isAdOwner && (
          <Link href={`/users/${ad.seller?.id}#review`} className="card-3d flex flex-col items-center gap-1 rounded-2xl py-3 text-sm font-medium text-primary">
            <Star className="h-5 w-5" /> تقييم
          </Link>
        )}
        <div className="card-3d flex items-center justify-center rounded-2xl py-3 text-primary">
          <ShareButtons
            url={shareUrl}
            title={ad.title}
            text={[ad.title, (ad.detail || '').replace(/\s+/g, ' ').trim().slice(0, 150)].filter(Boolean).join('\n')}
            compact
            card={{
              url: shareUrl,
              title: ad.title,
              desc: (ad.detail || '').replace(/\s+/g, ' ').trim().slice(0, 120),
              price: ad.price > 0 ? formatPrice(ad.price) : (ad.adsType === 'request' ? 'مطلوب' : ''),
              city: ad.area ? `${ad.area} - ${ad.city}` : (ad.city || ''),
              image: ad.images?.[0],
            }}
          />
        </div>
        <div className="card-3d flex items-center justify-center rounded-2xl py-1">
          <FavoriteButton adId={ad.id} active={favorited} disabled={!session} compact />
        </div>
      </div>

      {/* Comments */}
      {ad.commentAllow && (
        <div className="card-3d rounded-2xl p-4">
          <h2 className="mb-3 font-bold text-primary">التعليقات ({comments.length})</h2>
          {spx.cblocked === '1' && <div className="mb-3 rounded-lg border-2 border-red-400 bg-red-50 p-2.5 text-sm font-bold text-red-800">تعليقك يحتوي محتوى ممنوعاً ولم يُنشر — تكرار المخالفة يعرّض حسابك للحظر.</div>}
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
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{(c.author || 'ع').charAt(0)}</span>
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
                <ConfirmSubmit msg="تأكيد أرشفة/إظهار هذا الإعلان؟ الأرشفة تخفيه من الموقع (ويُحذف تلقائياً بعد 30 يوماً)." className="flex w-full items-center justify-center gap-1 rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100">
                  <Archive className="h-4 w-4" /> أرشفة / إظهار
                </ConfirmSubmit>
              </form>
            )}
            {canBanSeller && ad.seller && (
              ad.seller.banned ? (
                <form action={adminBanSellerAction}>
                  <input type="hidden" name="userId" value={ad.seller.id} />
                  <input type="hidden" name="adId" value={ad.id} />
                  <button className="flex w-full items-center justify-center gap-1 rounded-lg border border-emerald-400 bg-white px-3 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-50">
                    <Ban className="h-4 w-4" /> رفع الحظر عن العضو
                  </button>
                </form>
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-2">
                  <div className="mb-1.5 flex items-center gap-1 text-xs font-bold text-amber-800"><Ban className="h-3.5 w-3.5" /> حظر العضو — حدّد المدة</div>
                  <div className="flex items-center gap-1.5">
                    <form action={adminBanSellerAction} className="flex flex-1 items-center gap-1">
                      <input type="hidden" name="userId" value={ad.seller.id} />
                      <input type="hidden" name="adId" value={ad.id} />
                      <input name="days" type="number" min={1} placeholder="عدد الأيام" className="h-9 w-full min-w-0 rounded-md border bg-white px-2 text-sm" />
                      <ConfirmSubmit msg="تأكيد الحظر المؤقت لهذا المعلن؟ ستختفي كل إعلاناته من الموقع طوال مدة الحظر." className="h-9 shrink-0 rounded-md bg-amber-600 px-3 text-xs font-bold text-white">حظر مؤقت</ConfirmSubmit>
                    </form>
                    <form action={adminBanSellerAction}>
                      <input type="hidden" name="userId" value={ad.seller.id} />
                      <input type="hidden" name="adId" value={ad.id} />
                      <input type="hidden" name="permanent" value="1" />
                      <ConfirmSubmit msg="تأكيد الحظر الدائم لهذا المعلن؟ ستختفي كل إعلاناته من الموقع حتى رفع الحظر." className="h-9 shrink-0 rounded-md bg-destructive px-3 text-xs font-bold text-white">حظر دائم</ConfirmSubmit>
                    </form>
                  </div>
                </div>
              )
            )}
            {canDeleteAd && (
              <form action={adminDeleteAdRedirectAction}>
                <input type="hidden" name="adId" value={ad.id} />
                <ConfirmSubmit msg="حذف هذا الإعلان نهائياً؟ لا يمكن التراجع." className="flex w-full items-center justify-center gap-1 rounded-lg bg-destructive px-3 py-2 text-sm font-bold text-white hover:bg-destructive/90">
                  <Trash2 className="h-4 w-4" /> حذف الإعلان
                </ConfirmSubmit>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ذات صلة (لنفس المعلن) + المشابهة — تُخفى لإعلان المتجر (استقلال تام) */}
      {!inStore && sellerAds.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-primary">إعلانات ذات صلة — لنفس المعلن</h2>
          <AdGrid ads={sellerAds} />
        </section>
      )}
      {!inStore && similar.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-primary">إعلانات مشابهة</h2>
          <AdGrid ads={similar} />
        </section>
      )}

      <DisclaimerBar />
    </div>
  );
}
