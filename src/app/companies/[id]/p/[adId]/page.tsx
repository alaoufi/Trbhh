import Link from 'next/link';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  MapPin, Eye, Phone, MessageCircle, Timer, Tag, ArrowLeftRight,
  Hash, Navigation, ArrowRight, BadgeCheck,
} from 'lucide-react';
import { SITE } from '@/lib/constants';
import { getAd, recordView } from '@/lib/data';
import { getStore } from '@/lib/stores';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { getStoreMeta, storeProductAdIds, collaboratorAds, storeIdByHandle } from '@/lib/merchant';
import { isStoreSubBlocked } from '@/lib/subscription';
import { formatPrice, timeAgo } from '@/lib/utils';
import { waLink } from '@/lib/classified-theme';
import { AdGallery } from '@/components/ad-gallery';
import { AdMedia } from '@/components/ad-media-view';
import { ShareButtons } from '@/components/share-buttons';
import { StoreBottomNav } from '@/components/store-bottomnav';
import { StoreContactLink } from '@/components/store-contact-link';
import { getAdAudio } from '@/lib/ad-media';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string; adId: string }> }) {
  const { id, adId } = await params;
  const sid = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  const ad = await getAd(Number(adId));
  if (!ad || !sid) return { title: 'إعلان' };
  const meta = await getStoreMeta(sid);
  return {
    title: `${ad.title} — ${meta.storeName || 'متجر'}`,
    description: ad.detail?.slice(0, 160),
    openGraph: { images: (ad.images || []).slice(0, 1), title: ad.title },
  };
}

function InfoItem({ icon: Icon, children, color }: { icon: React.ElementType; children: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center gap-2" style={{ color }}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="line-clamp-1 text-sm font-medium">{children}</span>
    </div>
  );
}

/**
 * صفحة إعلان داخل المتجر — مستقلّة تماماً عن تربح: لا شاشة مبوّبات، لا إعلانات
 * مشابهة، لا هوية تربح. تُعرض ضمن هوية المتجر وحدها (ChromeGate يُخفي واجهة تربح
 * على مسار /companies/*). تُفتح مباشرة عند مشاركة إعلان المتجر في واتساب.
 */
export default async function StoreProductPage({ params }: { params: Promise<{ id: string; adId: string }> }) {
  const { id, adId } = await params;
  const storeId = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  if (!Number.isInteger(storeId) || storeId <= 0) notFound();

  const [s, ad] = await Promise.all([getStore(storeId), getAd(Number(adId))]);
  if (!s || !ad) notFound();

  const session = await getSession().catch(() => null);
  const isOwner = !!session && s.userId === session.uid;
  const admin = session ? await hasAnyAdmin(session.uid).catch(() => false) : false;
  const meta = await getStoreMeta(storeId);

  // بوابة الاعتماد/الاشتراك: نفس منطق واجهة المتجر
  const subBlocked = await isStoreSubBlocked(storeId).catch(() => false);
  if ((meta.status !== 1 || subBlocked) && !isOwner && !admin) notFound();

  // الإعلان يجب أن يكون ضمن منتجات هذا المتجر (أو ضمن إعلانات الشركاء المعروضة فيه)
  const [productIds, partners] = await Promise.all([
    storeProductAdIds(storeId),
    collaboratorAds(storeId).catch(() => []),
  ]);
  const allowed = productIds.includes(ad.id) || partners.some((p) => p.id === ad.id);
  if (!allowed) notFound();

  // تُحتسب مشاهدة الإعلان (لا تُحتسب مشاهدة المالك على إعلانه)
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  if (viewerKey && (!session || session.uid !== ad.seller?.id)) {
    await recordView(ad.id, viewerKey).catch(() => {});
  }

  const brand = meta.color || '#3287da';
  const name = meta.storeName || s.name;
  const storeHome = meta.handle ? `https://${meta.handle}.${SITE.domain}` : `/companies/${storeId}`;
  const shareUrl = `https://${SITE.domain}/companies/${storeId}/p/${ad.id}`;
  // نص واتساب: نص المتجر إن وُجد، وإلا نصّ افتراضي يذكر المنتج + رابط المنتج
  const { parseTemplates, fillTemplate } = await import('@/lib/settings');
  const baseTpl = parseTemplates(meta.msgTemplates)[0] || 'السلام عليكم، لديّ استفسار حول: {name}';
  const wa = waLink(ad.seller?.whatsapp, fillTemplate(baseTpl, { link: shareUrl, name: ad.title, appendLink: true }));
  const audioPath = await getAdAudio(ad.id).catch(() => null);
  // حالة التوفر + السعر قبل الخصم (تفعيلهما العام من التحكم)
  const xtr = await import('@/lib/store-extras');
  const [stockOn, dealsOn] = await Promise.all([xtr.stockEnabled(), xtr.dealsEnabled()]);
  const stockBadge = stockOn ? xtr.STOCK_BADGE[ad.stockState ?? 0] : undefined;
  const showOld = dealsOn && ad.oldPrice > ad.price && ad.price > 0;
  const dealPct = showOld ? Math.round((1 - ad.price / ad.oldPrice) * 100) : 0;

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
      {/* رأس المتجر — رجوع + هوية المتجر (لا هوية تربح) */}
      <div className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <Link href={storeHome} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="رجوع للمتجر">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link href={storeHome} className="flex min-w-0 flex-1 items-center gap-2">
            <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white shadow">
              <Image src={s.logo} alt={name} fill sizes="36px" className="object-cover" />
            </span>
            <span className="flex min-w-0 items-center gap-1 truncate font-extrabold" style={{ color: brand }}>
              {name}{s.trusted && <BadgeCheck className="h-4 w-4 shrink-0" />}
            </span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-3 py-3">
        {/* صور الإعلان — تصفّح بالسحب يميناً/يساراً */}
        <AdGallery images={ad.images} title={ad.title} special={ad.special} adsType={ad.adsType} />

        {/* فيديو/صوت */}
        <AdMedia videoPath={ad.videoPath} audioPath={audioPath} />

        <h1 className="text-xl font-bold" style={{ color: brand }}>{ad.title}</h1>

        {/* معلومات الإعلان */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <InfoItem icon={ArrowLeftRight} color={brand}>{ad.adsType === 'offer' ? 'عرض' : 'طلب'}</InfoItem>
          <InfoItem icon={Timer} color={brand}>{timeAgo(ad.createdAt)}</InfoItem>
          <InfoItem icon={MapPin} color={brand}>{ad.area ? `${ad.area} - ${ad.city}` : (ad.city || 'غير محدد')}</InfoItem>
          {ad.category && <InfoItem icon={Tag} color={brand}>{ad.category.name}</InfoItem>}
          <InfoItem icon={Hash} color={brand}>#{ad.id}</InfoItem>
          <InfoItem icon={Eye} color={brand}>{ad.views} مشاهدة</InfoItem>
        </div>

        {/* السعر والوصف */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            {(ad.price > 0 || ad.adsType === 'request') && <span className="text-2xl font-bold" style={{ color: brand }}>{ad.price > 0 ? formatPrice(ad.price) : 'مطلوب'}</span>}
            {showOld && <span className="text-sm text-muted-foreground line-through" dir="ltr">{formatPrice(ad.oldPrice)}</span>}
            {dealPct > 0 && <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">خصم {dealPct}٪</span>}
            {stockBadge && <span className={`rounded px-2 py-0.5 text-xs font-extrabold ${stockBadge.cls}`}>{stockBadge.label}</span>}
          </div>
          <p className="whitespace-pre-line leading-7 text-foreground/90">{ad.detail}</p>
        </div>

        {/* الموقع على الخريطة */}
        {ad.lat && ad.lng && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${ad.lat},${ad.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white"
            style={{ background: brand }}
          >
            <Navigation className="h-5 w-5" /> افتح الموقع في خرائط قوقل
          </a>
        )}

        {/* التواصل — واتساب/اتصال المتجر */}
        {(wa || ad.seller?.phone) && (
          <div className={`grid gap-3 ${wa && ad.seller?.phone ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {wa && (
              <StoreContactLink storeId={storeId} kind="whatsapp" href={wa} target="_blank" className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-sm font-bold text-[#25D366] shadow-sm ring-1 ring-black/5">
                <MessageCircle className="h-6 w-6" /> واتساب
              </StoreContactLink>
            )}
            {ad.seller?.phone && (
              <StoreContactLink storeId={storeId} kind="call" href={`tel:${ad.seller.phone}`} className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3 text-sm font-bold shadow-sm ring-1 ring-black/5" style={{ color: brand }}>
                <Phone className="h-6 w-6" /> اتصال
              </StoreContactLink>
            )}
          </div>
        )}

        {/* مشاركة الإعلان — يشارك رابط المتجر المباشر */}
        <div className="flex items-center justify-center rounded-2xl bg-white py-3 shadow-sm ring-1 ring-black/5" style={{ color: brand }}>
          <ShareButtons url={shareUrl} title={`${ad.title} — ${name}`} card={{ url: shareUrl, title: ad.title, city: name, image: ad.images?.[0] }} />
        </div>

        <p className="whitespace-pre-line rounded-xl border p-3 text-center text-xs font-medium text-muted-foreground" style={{ borderColor: `${brand}33` }}>
          {meta.productNote?.trim() || 'التعامل والدفع يتم مباشرة بين الطرفين. المتجر مسؤول عن عرضه.'}
        </p>
      </div>

      <StoreBottomNav brand={brand} wa={wa} isOwner={isOwner} storeId={storeId} canAdd={!!meta.allowAds} home={storeHome} />
    </div>
  );
}
