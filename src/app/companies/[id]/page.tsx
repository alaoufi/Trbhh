import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BadgeCheck, MapPin, Phone, MessageCircle, Building2, Users, Star, Search, Heart, Handshake, ShieldCheck, CalendarDays, Crown, Tag, Target, Mail, Link2, Plus, BarChart3, Megaphone, Eye, LogIn, Home } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { ShareButtons } from '@/components/share-buttons';
import { getStore } from '@/lib/stores';
import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { ProfileSwitcher } from '@/components/profile-switcher';
import { getUserProfiles, getActiveProfile } from '@/lib/profiles';
import { linkedAccounts } from '@/lib/account-links';
import { hasAnyAdmin } from '@/lib/roles';
import { recordStoreVisit, classifySource, getStoreViews } from '@/lib/store-analytics';
import { getBalance } from '@/lib/wallet';
import { storeHiddenByOwnerBan } from '@/lib/moderation';
import { getStoreMeta, followersCount, getStoreRating, getStoreReviews, isFollowing, storeIdOfUser, isCollaborator, collaboratorAds, storeProductAdIds, storeIdByHandle, parseHiddenFields, adViewCounts, DEFAULT_STORE_WELCOME_MSG } from '@/lib/merchant';
import { fillTemplate } from '@/lib/settings';
import { WelcomePopup } from '@/components/welcome-popup';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { StoreBottomNav } from '@/components/store-bottomnav';
import { StoreContactLink } from '@/components/store-contact-link';
import { StoreCatalog } from '@/components/store-catalog';
import { InstallPrompt } from '@/components/install-prompt';
import { waLink } from '@/lib/classified-theme';
import { bannerBackground, storeTier, isLightColor, layoutTokens, isCatalogStyle, DEFAULT_CATALOG_FIELDS } from '@/lib/store-style';
import { timeAgo } from '@/lib/utils';
import { followStoreAction, rateStoreAction, sendCollabAction, requestTransferAction, messageStoreOwnerAction } from '../actions';
import { ConfirmSubmit } from '@/components/confirm-submit';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  const s = sid ? await getStore(sid) : null;
  if (!s) return { title: 'متجر' };
  const meta = await getStoreMeta(s.id);
  const name = meta.storeName || s.name || 'متجر';
  const desc = (meta.tagline || meta.about || `متجر ${name} على عقار تربح`).replace(/\s+/g, ' ').trim().slice(0, 160);
  // the store's OWN name + logo when shared (WhatsApp/social) — full independence.
  // fall back to a real PNG only when the merchant hasn't uploaded a logo yet.
  const rawLogo = s.logo && !s.logo.endsWith('placeholder-ad.svg') ? s.logo : '/apple-icon.png';
  const logoAbs = rawLogo.startsWith('http') ? rawLogo : `https://${SITE.domain}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`;
  const url = `https://${SITE.domain}/companies/${meta.handle || s.id}`;
  return {
    title: { absolute: name },
    description: desc,
    alternates: { canonical: url },
    // manifest خاص بالمتجر → يُثبَّت كتطبيق مستقل باسمه وشعاره ولونه
    manifest: `/api/store-manifest/${s.id}`,
    openGraph: {
      type: 'website', locale: 'ar_SA', siteName: name, title: name, description: desc, url,
      images: [{ url: logoAbs, width: 512, height: 512, alt: name }],
    },
    twitter: { card: 'summary', title: name, description: desc, images: [logoAbs] },
  };
}

const en = (n: number) => new Intl.NumberFormat('en-US').format(n);

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex" dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} className={`h-4 w-4 ${i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} />)}
    </span>
  );
}

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; t?: string; added?: string; msgsent?: string }> }) {
  const { id } = await params;
  const { q, t, added, msgsent } = await searchParams;
  const query = (q || '').trim();
  // id may be a numeric store id OR a handle (from a subdomain rewrite / clean URL)
  const storeId = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  if (!Number.isInteger(storeId) || storeId <= 0) notFound();
  const s = await getStore(storeId);
  if (!s) notFound();

  const session = await getSession().catch(() => null);
  const isOwner = !!session && s.userId === session.uid;
  const admin = session ? await hasAnyAdmin(session.uid).catch(() => false) : false;
  const meta = await getStoreMeta(storeId);
  // approval gate: pending/suspended stores aren't public. Instead of a bare 404,
  // show a friendly status page (e.g. when a merchant previews a store still under review).
  // اشتراك المتجر: عند انتهائه بعد المهلة يُخفى المتجر من العرض (دون حذف). المالك والإدارة يريانه.
  // حالة الاشتراك الكاملة: أثناء المهلة (grace) يبقى المتجر ظاهراً للزوار وصاحبه يُذكَّر؛
  // بعد انتهاء المهلة (suspended) يُغلق عن الزوار برسالة، وصاحبه يرى رسالة التجديد.
  const { getStoreSub } = await import('@/lib/subscription');
  const sub = await getStoreSub(storeId).catch(() => null);
  const subBlocked = sub?.state === 'suspended';
  const subGrace = sub?.state === 'grace';
  // متجر موقوف: لا تصفّح للجميع عدا الإدارة (حتى المالك يرى الرسالة) — رسالتان مختلفتان
  if ((meta.status === 2 || meta.status === 3) && !admin) {
    const perm = meta.status === 3;
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600 text-3xl">🚫</div>
        <h1 className="text-lg font-extrabold text-red-700">{perm ? 'لا يوجد متجر نشط بهذا الاسم' : 'المتجر غير نشط حالياً'}</h1>
        <p className="text-sm text-muted-foreground">{perm ? 'هذا المتجر موقوف نهائياً ولم يعد متاحاً.' : 'أعد المحاولة لاحقاً.'}</p>
        <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">الصفحة الرئيسية</Link>
      </div>
    );
  }
  // اشتراك المتجر منتهٍ (المتجر معتمد status 1 لكن انتهى اشتراكه بعد المهلة): الإدارة تتصفّح؛
  // الزائر يرى رسالة عامة لا تكشف السبب؛ وصاحب المتجر يرى رسالة إجرائية بروابط التجديد والشحن.
  if (subBlocked && meta.status === 1 && !admin) {
    if (isOwner) {
      const balance = await getBalance(session!.uid).catch(() => 0);
      return (
        <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-amber-700 text-3xl">🔔</div>
          <h1 className="text-lg font-extrabold text-amber-800">متجرك موقوف حالياً لعدم تجديد الاشتراك</h1>
          <p className="text-sm text-muted-foreground">جدّد اشتراك متجرك ليعود للظهور لعملائك فوراً.</p>
          <Link href="/store#sub" className="btn-3d mt-1 rounded-lg bg-primary px-5 py-2.5 text-sm font-extrabold text-white">بادر بالاشتراك (تجديد الآن)</Link>
          <Link href="/account/wallet#topup" className="rounded-lg border border-primary/30 px-4 py-2 text-xs font-bold text-primary">رصيدك: {balance} ر.س — اشحن رصيدك إن لم يكفِ</Link>
          <Link href="/" className="text-xs text-muted-foreground underline">الصفحة الرئيسية</Link>
        </div>
      );
    }
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary text-3xl">🚫</div>
        <h1 className="text-lg font-extrabold text-primary">المتجر غير نشط حالياً</h1>
        <p className="text-sm text-muted-foreground">سيعود للظهور قريباً.</p>
        {!session && (
          <p className="text-xs font-bold text-primary">صاحب المتجر؟ <Link href={`/login?next=${encodeURIComponent(`/companies/${storeId}`)}`} className="underline">سجّل الدخول</Link> لتجديد اشتراكك.</p>
        )}
        <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">الصفحة الرئيسية</Link>
      </div>
    );
  }
  // متجر قيد المراجعة (status 0) أو غير معتمد: رسالة للزائر (والمالك يعاين متجره)
  if (meta.status !== 1 && !isOwner && !admin) {
    const pending = meta.status === 0;
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary text-3xl">{pending ? '⏳' : '🚫'}</div>
        <h1 className="text-lg font-extrabold text-primary">{pending ? 'هذا المتجر قيد المراجعة' : 'هذا المتجر غير متاح حالياً'}</h1>
        <p className="text-sm text-muted-foreground">{pending ? 'يخضع المتجر لموافقة الإدارة وسيظهر للعملاء بعد اعتماده.' : 'تم إيقاف هذا المتجر مؤقتاً من قبل الإدارة.'}</p>
        {!session && (
          <p className="text-xs font-bold text-primary">صاحب المتجر؟ <Link href={`/login?next=${encodeURIComponent(`/companies/${storeId}`)}`} className="underline">سجّل الدخول</Link> لعرض متجرك وإدارته.</p>
        )}
        <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">الصفحة الرئيسية</Link>
      </div>
    );
  }
  // صاحب المتجر محظور: يُخفى المتجر عن العامة عند الحظر الإداري/الجسيم فقط. أما الحظر الآلي
  // غير الجسيم (تكرار/فئة أقل) فلا يُسقط متجراً معتمداً عند تفعيل «درع المتجر» (استقلالية المتجر
  // عن الهوية الشخصية). المالك والإدارة يريانه دائماً.
  if ((await storeHiddenByOwnerBan(s.userId).catch(() => false)) && !isOwner && !admin) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-red-100 text-red-600 text-3xl">🚫</div>
        <h1 className="text-lg font-extrabold text-red-700">لا يوجد متجر نشط بهذا الاسم</h1>
        <p className="text-sm text-muted-foreground">هذا المتجر غير متاح حالياً.</p>
        <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">الصفحة الرئيسية</Link>
      </div>
    );
  }

  // مشاهدة متجر = زيارة مزالة التكرار (مرة واحدة لكل زائر يومياً)، لا تُحتسب مشاهدة المالك —
  // فلا يزيد العدد بتكرار الضغط على «الرئيسية» أو تحديث الصفحة من نفس الزائر في نفس اليوم.
  if (!isOwner) {
    const vid = (await cookies()).get('trbhh_vid')?.value;
    const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
    if (viewerKey) {
      const ref = (await headers()).get('referer');
      await recordStoreVisit(storeId, viewerKey, classifySource(ref, SITE.domain));
    }
  }

  const [productIds, followers, rating, reviews, following] = await Promise.all([
    storeProductAdIds(storeId),
    followersCount(storeId),
    getStoreRating(storeId),
    getStoreReviews(storeId),
    session && !isOwner ? isFollowing(session.uid, storeId) : Promise.resolve(false),
  ]);
  // independent catalog: ONLY the ads added to the store (owner or staff) — never
  // all the owner's platform ads. Empty until products are showcased.
  const { getAdsByIds } = await import('@/lib/account');
  const productAds = await getAdsByIds(productIds).catch(() => []);
  const inStoreAds = productAds.filter((a) => a.status === 1);
  const viewsById = await adViewCounts(inStoreAds.map((a) => a.id)).catch(() => new Map<number, number>());
  // ميزات المتجر الإضافية (تفعيلها العام من التحكم): كوبونات + دوام + حالة التوفر + خصومات
  const xtr = await import('@/lib/store-extras');
  const [couponsOn, hoursOn, stockOn, dealsOn] = await Promise.all([xtr.couponsEnabled(), xtr.hoursEnabled(), xtr.stockEnabled(), xtr.dealsEnabled()]);
  const coupons = couponsOn ? await xtr.listStoreCoupons(storeId, true).catch(() => []) : [];
  const openNow = hoursOn ? xtr.isOpenNow(await xtr.getStoreHours(storeId).catch(() => ({ from: null, to: null, days: [] }))) : null;
  // شارة باقة Plus ⭐ (تظهر ما دامت الباقة سارية)
  const storePlus = await import('@/lib/subscription').then((m) => m.isStorePlus(storeId)).catch(() => false);
  const allActive = inStoreAds.map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: viewsById.get(a.id) ?? 0, sellerName: null, sellerTrusted: false, oldPrice: dealsOn ? a.oldPrice : 0, stockState: stockOn ? a.stockState : 0 }));
  const active = query ? allActive.filter((a) => (a.title || '').includes(query)) : allActive;
  // نص واتساب للمتجر: نص المتجر إن وُجد، وإلا نصّ افتراضي (لا يظهر فارغاً)
  const { parseTemplates, fillTemplate } = await import('@/lib/settings');
  const storeUrl = `https://${SITE.domain}/companies/${meta.handle || storeId}`;
  const baseTpl = parseTemplates(meta.msgTemplates)[0] || 'السلام عليكم، لديّ استفسار عن متجر {name}';
  const wa = waLink(s.whatsapp, fillTemplate(baseTpl, { link: storeUrl, name: meta.storeName || s.name }));
  // مشاهدات المتجر = عدد مرّات دخول/تحديث صفحة المتجر (مشاهدة واحدة لكل زيارة)
  const storeViews = await getStoreViews(storeId).catch(() => 0);
  // collaboration: can this viewer (a merchant) invite this store?
  const viewerStoreId = session && !isOwner ? await storeIdOfUser(session.uid) : 0;
  const alreadyPartner = viewerStoreId ? await isCollaborator(viewerStoreId, storeId) : false;
  const canInvite = viewerStoreId > 0 && viewerStoreId !== storeId && !alreadyPartner;
  const partnerAds = await collaboratorAds(storeId).catch(() => []);
  // مبدّل الهوية لأي عضو مسجّل يتصفّح المتجر: يرجع لحساباته/المنصة أو يبدّل هويته (تعدّد المتاجر)
  const [viewerProfiles, viewerActive, viewerLinked] = session
    ? await Promise.all([
        getUserProfiles(session.uid).catch(() => []),
        getActiveProfile(session.uid).catch(() => null),
        linkedAccounts(session.uid).catch(() => []),
      ])
    : [[], null, []];
  const toSwItem = (p: { id: number; name: string; type: 'personal' | 'store'; avatarUrl: string; color: string | null }) => ({ id: p.id, name: p.name, type: p.type, avatarUrl: p.avatarUrl, color: p.color });
  const viewerLinkedItems = session ? viewerLinked.filter((a) => a.id !== session.uid).map((a) => ({ id: a.id, name: a.name, hasStore: a.hasStore, storeName: a.storeName })) : [];
  const brand = meta.color || '#3287da';
  const name = meta.storeName || s.name;
  const tier = storeTier(followers, rating.avg, rating.count);
  const sinceDate = meta.since ? new Date(meta.since) : null;
  const year = sinceDate && !isNaN(sinceDate.getTime()) ? sinceDate.getFullYear() : s.createdAt ? new Date(s.createdAt).getFullYear() : null;
  const onBrand = isLightColor(brand) ? '#0f172a' : '#ffffff';
  const tk = layoutTokens(meta.layout);
  const catalogStyle = isCatalogStyle(meta.catalog) ? meta.catalog : 'tiles';
  const catalogFields = new Set((meta.fields || DEFAULT_CATALOG_FIELDS).split(',').filter(Boolean));
  const tierStyle: Record<string, string> = { gold: 'bg-amber-100 text-amber-800', silver: 'bg-slate-200 text-slate-700', active: 'bg-emerald-100 text-emerald-700', new: 'bg-sky-100 text-sky-700' };
  // عناصر يتحكّم كل متجر بإظهارها/إخفائها بشكل مستقل
  const hidden = parseHiddenFields(meta.hiddenFields);
  const statCards = [
    { key: 'ads', icon: Megaphone, val: en(allActive.length), label: 'إعلان', star: false },
    { key: 'views', icon: Eye, val: en(storeViews), label: 'مشاهدة', star: false },
    { key: 'followers', icon: Users, val: en(followers), label: 'متابع', star: false },
    { key: 'rating', icon: Star, val: rating.count ? String(rating.avg) : '—', label: `تقييم (${en(rating.count)})`, star: true },
  ].filter((c) => !hidden.has(c.key));
  const gridCols: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };
  const showReviews = meta.allowReviews && !hidden.has('rating');
  // بيانات منظَّمة (JSON-LD): تساعد جوجل على عرض المتجر كنتيجة غنية
  // (اسم/تقييم/عنوان) في نتائج البحث بدل رابط عادي.
  const storeJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    name,
    url: `https://${SITE.domain}/companies/${meta.handle || storeId}`,
    image: s.logo && !s.logo.endsWith('placeholder-ad.svg') ? s.logo : undefined,
    address: s.address ? { '@type': 'PostalAddress', addressLocality: s.address, addressCountry: 'SA' } : undefined,
    telephone: s.phone || undefined,
    ...(rating.count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.avg, reviewCount: rating.count } } : {}),
  };
  // أمان: هرّب < > & وفواصل الأسطر يونيكود حتى لا يكسر محتوى المتجر وسم <script ld+json> (XSS مخزّن).
  const storeJsonLdHtml = JSON.stringify(storeJsonLd)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: storeJsonLdHtml }} />
      {/* تثبيت المتجر كتطبيق مستقل (لغير المالك) */}
      {!isOwner && <InstallPrompt scope="store" name={name} brand={brand} storageKey={`trbhh_install_store_${storeId}`} />}

      {/* ===== شريط علوي: بحث داخل المتجر (مستقل) ===== */}
      <div className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-2">
          <form className="relative flex-1">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input name="q" defaultValue={query} placeholder="ابحث في المتجر" className="h-10 w-full rounded-full border bg-muted/40 pr-9 pl-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
          </form>
          {!session && (
            <>
              <Link href="/" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border text-primary" aria-label="الرجوع لعقار تربح"><Home className="h-4 w-4" /></Link>
              <Link href={`/store-login?s=${encodeURIComponent(meta.handle || String(storeId))}`} className="btn-3d flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold text-white" style={{ background: brand }}>
                <LogIn className="h-4 w-4" /> دخول
              </Link>
            </>
          )}
          {isOwner && meta.allowAds && (
            <Link href="/ads/new?dest=store" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="أضف إعلان"><Plus className="h-5 w-5" /></Link>
          )}
          {isOwner && (
            <Link href="/store/analytics" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="إحصائيات المتجر"><BarChart3 className="h-4 w-4" /></Link>
          )}
          {isOwner && (
            <Link href="/store" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="إدارة المتجر"><Building2 className="h-4 w-4" /></Link>
          )}
        </div>
        {/* شريط التبديل لأي عضو مسجّل: الرجوع لعقار تربح/حساباتك أو التبديل لهوية/متجر آخر */}
        {session && viewerActive && (
          <div className="relative z-40 border-t bg-white/95">
            <div className="mx-auto flex max-w-2xl items-center gap-2 px-3 py-1.5">
              <ProfileSwitcher active={toSwItem(viewerActive)} profiles={viewerProfiles.map(toSwItem)} linked={viewerLinkedItems} />
              <Link href="/" className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/5">
                <Home className="h-3.5 w-3.5" /> الرجوع لعقار تربح
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-3 py-3">
        {isOwner && added === '1' && (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800 shadow-sm">✓ تم نشر الإعلان وإضافته لمتجرك — تجده ضمن الإعلانات أدناه.</div>
        )}
        {meta.status !== 1 && (isOwner || admin) && (
          <div className="rounded-xl border bg-white p-3 text-sm font-bold text-amber-700 shadow-sm">⏳ هذا المتجر {meta.status === 0 ? 'بانتظار موافقة الإدارة' : 'موقوف'} — يظهر لك فقط حالياً.</div>
        )}
        {/* مهلة السداد: المتجر ما زال شغّالاً للزوار والعضو، وصاحبه يُذكَّر بالتجديد قبل انتهائها وإلا يُغلق */}
        {subGrace && isOwner && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm shadow-sm">
            <div className="font-extrabold text-amber-800">⏳ متجرك منتهي الاشتراك وأنت في مهلة السداد — باقٍ{typeof sub?.graceDaysLeft === 'number' && sub.graceDaysLeft > 0 ? ` ${sub.graceDaysLeft} يوم` : ''} على إيقاف متجرك.</div>
            <div className="mt-1 text-xs text-amber-700">متجرك ما زال شغّالاً وظاهراً لعملائك الآن، وسيُغلق تلقائياً بانتهاء المهلة حتى تسدّد. بادر بالسداد.</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/store#sub" className="rounded-lg bg-primary px-4 py-1.5 text-xs font-extrabold text-white">تجديد الاشتراك الآن</Link>
              <Link href="/account/wallet#topup" className="rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary">شحن الرصيد</Link>
            </div>
          </div>
        )}
        {/* مؤشّر إداري: يوضّح للإدارة ما يراه الزوّار فعلاً (لأن الإدارة تتجاوز الحجب دائماً) */}
        {admin && !isOwner && (subGrace || subBlocked) && (
          <div className="rounded-xl border border-sky-300 bg-sky-50 p-3 text-xs font-bold text-sky-800">
            ℹ️ عرض إداري: {subGrace ? `اشتراك هذا المتجر في مهلة السداد${typeof sub?.graceDaysLeft === 'number' && sub.graceDaysLeft > 0 ? ` (باقٍ ${sub.graceDaysLeft} يوم)` : ''} — لا يزال ظاهراً للزوار عادي.` : 'اشتراك هذا المتجر منتهٍ بعد المهلة — يظهر للزوار «غير نشط مؤقتاً»، وأنت تراه بصلاحية الإدارة.'}
          </div>
        )}

        {/* بوب أب ترحيب بزائر المتجر — يفعّله/يعطّله صاحب المتجر بمفتاح مستقل، ويظهر
            مرة واحدة فقط لكل جلسة تصفح (مفتاح منفصل لكل متجر) ثم يختفي تلقائياً. */}
        {meta.welcomeOn && (
          <WelcomePopup storageKey={`trbhh_store_welcomed_${storeId}`}>
            <p className="text-sm font-bold leading-6" style={{ color: brand }}>
              {fillTemplate(meta.welcomeMsg || DEFAULT_STORE_WELCOME_MSG, { name })}
            </p>
          </WelcomePopup>
        )}

        {/* إعلان/تنويه المتجر — نص يتحكّم به صاحب المتجر (استقلالية تامة) */}
        {meta.announce && (
          <div className="flex items-start gap-2 rounded-xl border-2 p-3 text-sm font-bold shadow-sm" style={{ borderColor: `${brand}40`, background: `${brand}0d`, color: brand }}>
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="whitespace-pre-line leading-6">{meta.announce}</span>
          </div>
        )}

        {/* كوبونات الخصم — يضيفها صاحب المتجر من لوحته، والعميل ينسخ الرمز ويرسله عند الطلب */}
        {coupons.length > 0 && (
          <div className="space-y-2 rounded-xl border-2 border-dashed p-3 shadow-sm" style={{ borderColor: `${brand}66`, background: `${brand}0d` }}>
            <div className="text-sm font-extrabold" style={{ color: brand }}>🎟️ كوبونات خصم من المتجر</div>
            <div className="flex flex-wrap gap-2">
              {coupons.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold shadow-sm ring-1 ring-black/10">
                  <b dir="ltr" className="select-all" style={{ color: brand }}>{c.code}</b>
                  <span className="text-foreground/80">{c.discount}</span>
                  {c.expiresAt && <span className="text-[10px] text-muted-foreground">حتى {c.expiresAt}</span>}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">انسخ الرمز وأرسله للمتجر عند الطلب ليطبّق الخصم.</p>
          </div>
        )}

        {/* ===== رأس المتجر بهويته البصرية (حسب القالب) ===== */}
        <div className={`overflow-hidden bg-white shadow-md ring-1 ring-black/5 ${tk.card}`}>
          <div className={`relative w-full ${tk.hero}`} style={{ background: bannerBackground(meta.banner, brand) }}>
            <div className={`absolute inset-0 flex p-4 ${tk.align === 'center' ? 'flex-col items-center justify-center gap-2 text-center' : 'items-end gap-3'}`}>
              <div className={`relative h-20 w-20 shrink-0 overflow-hidden border-4 border-white bg-muted shadow-lg ${tk.logo}`}><Image src={s.logo} alt={name} fill sizes="80px" className="object-cover" /></div>
              <div className={tk.align === 'center' ? '' : 'min-w-0 pb-1'} style={{ color: onBrand }}>
                <div className={`flex items-center gap-1 font-extrabold drop-shadow ${tk.title} ${tk.align === 'center' ? 'justify-center' : ''}`}>{name}{s.trusted && <BadgeCheck className="h-5 w-5" />}</div>
                {meta.tagline && <div className="truncate text-sm opacity-95 drop-shadow">{meta.tagline}</div>}
              </div>
            </div>
          </div>

          <div className="p-4">
            {/* شارات الثقة: معتمد · المستوى · التخصص · عمر المتجر */}
            <div className="flex flex-wrap items-center gap-1.5">
              {meta.status === 1 && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"><ShieldCheck className="h-3.5 w-3.5" /> متجر موثّق</span>}
              {storePlus && <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-l from-amber-400 to-amber-600 px-2.5 py-1 text-[11px] font-extrabold text-white shadow">⭐ متجر Plus</span>}
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tierStyle[tier.key]}`}>{tier.key === 'gold' && <Crown className="h-3.5 w-3.5" />}{tier.label}</span>
              {openNow !== null && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${openNow ? 'bg-emerald-600' : 'bg-slate-500'}`}>
                  🕒 {openNow ? 'مفتوح الآن' : 'مغلق الآن'}
                </span>
              )}
              {meta.specialty && <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: brand }}><Tag className="h-3.5 w-3.5" /> {meta.specialty}</span>}
              {year && <span className="inline-flex items-center gap-1 rounded-full bg-secondary/60 px-2.5 py-1 text-[11px] font-bold text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" /> متجر منذ {year}</span>}
            </div>

            {s.address && <div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" />{s.address}</div>}

            {/* إحصائيات المتجر — كل متجر يتحكّم بإظهار عناصره */}
            {statCards.length > 0 && (
              <div className={`mt-3 grid ${gridCols[statCards.length]} gap-2 text-center`}>
                {statCards.map((c) => (
                  <div key={c.key} className="rounded-xl bg-secondary/40 p-2">
                    <div className="flex items-center justify-center gap-1 font-bold" style={{ color: brand }}>
                      <c.icon className={`h-4 w-4 ${c.star ? 'fill-amber-400 text-amber-400' : ''}`} /> {c.val}
                    </div>
                    <div className="text-[11px] text-muted-foreground">{c.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* أزرار سطر واحد بالأيقونات فقط: متابعة، واتساب، اتصال، مشاركة */}
            <div className="mt-3 flex gap-2">
              {!isOwner && (
                <form action={followStoreAction} className="flex-1">
                  <input type="hidden" name="storeId" value={storeId} />
                  <button aria-label={following ? 'إلغاء المتابعة' : 'متابعة'} title={following ? 'متابَع ✓' : 'متابعة'} className="grid h-11 w-full place-items-center rounded-xl text-white shadow-sm" style={{ background: following ? '#64748b' : brand }}>
                    <Heart className={`h-5 w-5 ${following ? 'fill-white' : ''}`} />
                  </button>
                </form>
              )}
              {wa && (
                <StoreContactLink storeId={storeId} kind="whatsapp" href={wa} target="_blank" className="grid h-11 flex-1 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
                  <MessageCircle className="h-5 w-5" />
                </StoreContactLink>
              )}
              {s.phone && (
                <StoreContactLink storeId={storeId} kind="call" href={`tel:${s.phone}`} className="grid h-11 flex-1 place-items-center rounded-xl border bg-white shadow-sm">
                  <Phone className="h-5 w-5" style={{ color: brand }} />
                </StoreContactLink>
              )}
              {/* مشاركة المتجر — قائمة كل التطبيقات */}
              <span className="h-11 flex-1 rounded-xl border bg-white shadow-sm" style={{ color: brand }} title="مشاركة">
                <ShareButtons
                  url={`https://${SITE.domain}/companies/${storeId}`}
                  title={`متجر ${name}`}
                  text={[`متجر ${name} على عقار تربح`, (meta.about || s.description || '').replace(/\s+/g, ' ').trim().slice(0, 120)].filter(Boolean).join('\n')}
                  compact
                  iconOnly
                  card={{ url: `https://${SITE.domain}/companies/${storeId}`, title: `متجر ${name}`, city: meta.specialty || '', image: s.logo && !s.logo.endsWith('placeholder-ad.svg') ? s.logo : '/logo-aqar-256.png?v=4' }}
                />
              </span>
            </div>
            {(canInvite || alreadyPartner) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {canInvite && (
                  <form action={sendCollabAction}>
                    <input type="hidden" name="toStore" value={storeId} />
                    <Button variant="outline"><Handshake className="h-4 w-4" /> دعوة للتعاون</Button>
                  </form>
                )}
                {alreadyPartner && <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><Handshake className="h-4 w-4" /> شريك متعاون</span>}
              </div>
            )}
          </div>
        </div>

        {/* ===== تبويبات (روابط قفز) ===== */}
        <nav className="sticky top-[52px] z-20 flex gap-1 rounded-xl bg-white p-1 text-sm font-bold shadow-sm ring-1 ring-black/5">
          <a href="#catalog" className="flex-1 rounded-lg py-2 text-center text-white" style={{ background: brand }}>الإعلانات</a>
          {!hidden.has('about') && <a href="#about" className="flex-1 rounded-lg py-2 text-center text-muted-foreground hover:bg-muted/50">نبذة</a>}
          {showReviews && <a href="#reviews" className="flex-1 rounded-lg py-2 text-center text-muted-foreground hover:bg-muted/50">التقييمات</a>}
        </nav>

        {/* ===== الكتالوج ===== */}
        <div id="catalog" className="scroll-mt-28">
          <h2 className="mb-2 text-lg font-bold" style={{ color: brand }}>
            {query ? `نتائج البحث «${query}» (${en(active.length)})` : `كتالوج المتجر (${en(active.length)})`}
          </h2>
          {active.length > 0 ? <StoreCatalog ads={active} style={catalogStyle} fields={catalogFields} brand={brand} linkBase={`/companies/${storeId}/p`} /> : <p className="rounded-xl bg-white p-6 text-center text-sm text-muted-foreground shadow-sm">{query ? 'لا توجد إعلانات مطابقة لبحثك.' : 'لا توجد إعلانات معروضة بعد.'}</p>}
        </div>

        {partnerAds.length > 0 && (
          <div className="scroll-mt-28">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-bold" style={{ color: brand }}><Handshake className="h-5 w-5" /> إعلانات شركائنا</h2>
            <StoreCatalog ads={partnerAds} style={catalogStyle} fields={catalogFields} brand={brand} linkBase={`/companies/${storeId}/p`} />
          </div>
        )}

        {/* ===== نبذة ===== */}
        {!hidden.has('about') && (meta.about || s.description || meta.specialty || meta.audience) && (
          <div id="about" className="scroll-mt-28 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="font-bold" style={{ color: brand }}>عن المتجر</h2>
            {(meta.about || s.description) && <p className="whitespace-pre-line leading-7 text-foreground/90">{meta.about || s.description}</p>}
            {(meta.specialty || meta.audience) && (
              <div className="grid gap-2 sm:grid-cols-2">
                {meta.specialty && (
                  <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3">
                    <Tag className="mt-0.5 h-4 w-4 shrink-0" style={{ color: brand }} />
                    <div><div className="text-[11px] text-muted-foreground">التخصّص</div><div className="text-sm font-bold text-foreground/90">{meta.specialty}</div></div>
                  </div>
                )}
                {meta.audience && (
                  <div className="flex items-start gap-2 rounded-xl bg-secondary/40 p-3">
                    <Target className="mt-0.5 h-4 w-4 shrink-0" style={{ color: brand }} />
                    <div><div className="text-[11px] text-muted-foreground">الطبقة المستهدفة</div><div className="text-sm font-bold text-foreground/90">{meta.audience}</div></div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== التواصل ومشاركة رابط المتجر ===== */}
        <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <h2 className="font-bold" style={{ color: brand }}>التواصل مع المتجر</h2>
          {(meta.phone || meta.email || meta.contacts) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {meta.phone && <StoreContactLink storeId={storeId} kind="call" href={`tel:${meta.phone}`} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-3 text-sm font-bold text-foreground/90"><Phone className="h-4 w-4 shrink-0" style={{ color: brand }} /> <span dir="ltr">{meta.phone}</span></StoreContactLink>}
              {meta.email && <a href={`mailto:${meta.email}`} className="flex items-center gap-2 rounded-xl bg-secondary/40 p-3 text-sm font-bold text-foreground/90"><Mail className="h-4 w-4 shrink-0" style={{ color: brand }} /> <span dir="ltr" className="truncate">{meta.email}</span></a>}
              {meta.contacts && <div className="flex items-center gap-2 rounded-xl bg-secondary/40 p-3 text-sm font-bold text-foreground/90 sm:col-span-2"><Link2 className="h-4 w-4 shrink-0" style={{ color: brand }} /> <span dir="ltr" className="truncate">{meta.contacts}</span></div>}
            </div>
          )}
          {/* ✉️ مراسلة صاحب المتجر — تصل رسالته في «الرسائل» ويرد منها */}
          {!isOwner && (
            <div className="rounded-xl border p-3" style={{ borderColor: `${brand}33` }}>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-bold" style={{ color: brand }}><MessageCircle className="h-4 w-4" /> راسل صاحب المتجر</div>
              {msgsent === '1' && <p className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">✓ وصلت رسالتك لصاحب المتجر — يصلك ردّه في «رسائلي».</p>}
              {msgsent === 'blocked' && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">رسالتك تحتوي محتوى غير مسموح ولم تُرسل.</p>}
              {session ? (
                <form action={messageStoreOwnerAction} className="space-y-2">
                  <input type="hidden" name="storeId" value={storeId} />
                  <textarea name="message" required rows={2} maxLength={1500} placeholder="اكتب رسالتك أو استفسارك…" className="w-full rounded-lg border bg-white p-2.5 text-sm outline-none focus:ring-2" style={{ borderColor: `${brand}44` }} />
                  <button className="btn-3d rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: brand }}>إرسال الرسالة</button>
                </form>
              ) : (
                <Link href={`/login?next=${encodeURIComponent(`/companies/${storeId}`)}`} className="block rounded-lg bg-secondary/50 p-2.5 text-center text-xs font-bold text-muted-foreground">سجّل الدخول لمراسلة صاحب المتجر ←</Link>
              )}
            </div>
          )}

          {/* نقل ملكية المتجر — يبدأ بطلب من المنقول له، ثم موافقة الصاحب الأول، ثم تنفيذ الإدارة */}
          {session && !isOwner && (
            <details className="rounded-xl border border-primary/20 bg-primary/5">
              <summary className="cursor-pointer list-none px-3 py-2 text-sm font-bold text-primary">طلب نقل ملكية هذا المتجر إليّ…</summary>
              <div className="border-t border-primary/15 p-3">
                {t === 'ok' && <p className="mb-2 rounded-lg bg-emerald-50 p-2 text-xs font-bold text-emerald-700">أُرسل طلبك. يظهر لصاحب المتجر للموافقة، ثم تنفّذه الإدارة.</p>}
                {t === 'err' && <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs font-bold text-red-700">تعذّر إرسال الطلب (قد تملك متجراً بالفعل أو المتجر غير متاح).</p>}
                <p className="mb-2 text-[11px] leading-5 text-muted-foreground">
                  يُرسل طلب رسمي لصاحب المتجر الحالي. لا تنتقل الملكية إلا بعد موافقته وتنفيذ إدارة المتاجر. عند الانتقال تنتقل معلومات المتجر (الاسم والجوال والبريد) كاملة.
                </p>
                <form action={requestTransferAction}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <ConfirmSubmit msg="إرسال طلب نقل ملكية هذا المتجر إليك؟ يتطلب موافقة صاحب المتجر ثم تنفيذ الإدارة." className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: brand }}>
                    <Handshake className="h-4 w-4" /> إرسال طلب النقل
                  </ConfirmSubmit>
                </form>
              </div>
            </details>
          )}
        </div>

        {s.branches.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <h2 className="mb-2 flex items-center gap-2 font-bold"><Building2 className="h-4 w-4" /> الفروع</h2>
            <ul className="space-y-1 text-sm">
              {s.branches.map((b) => <li key={b.id} className="flex items-center gap-2"><MapPin className="h-3 w-3 text-muted-foreground" /> <b>{b.name}</b> {b.address && <span className="text-muted-foreground">— {b.address}</span>}</li>)}
            </ul>
          </div>
        )}

        {/* ===== التقييمات والتعليقات (يمكن للمالك قفلها أو إخفاؤها من إعدادات المتجر) ===== */}
        {showReviews && (
        <div id="reviews" className="scroll-mt-28 space-y-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <h2 className="flex items-center gap-2 font-bold" style={{ color: brand }}><Star className="h-5 w-5" /> تقييمات العملاء ({en(rating.count)})</h2>
          {session && !isOwner && (
            <form action={rateStoreAction} className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
              <input type="hidden" name="storeId" value={storeId} />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold">تقييمك:</span>
                <select name="star" defaultValue="5" className="h-9 rounded-lg border bg-white px-2 text-sm">
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
                </select>
              </div>
              <textarea name="note" rows={2} maxLength={500} placeholder="ملاحظتك عن المتجر (اختياري)" className="w-full rounded-lg border bg-white p-2 text-sm" />
              <button className="rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: brand }}>إرسال التقييم</button>
            </form>
          )}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">لا توجد تقييمات بعد.</p>}
          {reviews.map((r) => (
            <div key={r.id} className="rounded-xl border border-border/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-primary">{r.author}</span>
                <span className="flex items-center gap-2"><Stars value={r.star} /> <span className="text-xs text-muted-foreground">{timeAgo(r.at)}</span></span>
              </div>
              {r.note && <p className="mt-1 text-sm text-foreground/90">{r.note}</p>}
            </div>
          ))}
        </div>
        )}

        <DisclaimerBar />
      </div>

      <StoreBottomNav brand={brand} wa={wa} isOwner={isOwner} storeId={storeId} canAdd={!!meta.allowAds} home={`/companies/${meta.handle || storeId}`} />
    </div>
  );
}
