import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BadgeCheck, MapPin, Phone, MessageCircle, Building2, Users, Star, Search, Heart, Handshake, ShieldCheck, CalendarDays, Crown, Tag, Target, Mail, Link2, Plus, BarChart3, Megaphone, Eye, LogIn } from 'lucide-react';
import { SITE } from '@/lib/constants';
import { CopyLink } from '@/components/copy-link';
import { getStore } from '@/lib/stores';
import { getMyAds } from '@/lib/account';
import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth';
import { hasAnyAdmin } from '@/lib/roles';
import { recordStoreVisit, classifySource, bumpStoreView, getStoreViews } from '@/lib/store-analytics';
import { isStoreSubBlocked } from '@/lib/subscription';
import { getStoreMeta, followersCount, getStoreRating, getStoreReviews, isFollowing, storeIdOfUser, isCollaborator, collaboratorAds, storeProductAdIds, storeIdByHandle, parseHiddenFields, adViewCounts } from '@/lib/merchant';
import { Button } from '@/components/ui/button';
import { DisclaimerBar } from '@/components/disclaimer';
import { StoreBottomNav } from '@/components/store-bottomnav';
import { StoreContactLink } from '@/components/store-contact-link';
import { StoreCatalog } from '@/components/store-catalog';
import { InstallPrompt } from '@/components/install-prompt';
import { waLink } from '@/lib/classified-theme';
import { bannerBackground, storeTier, isLightColor, layoutTokens, isCatalogStyle, DEFAULT_CATALOG_FIELDS } from '@/lib/store-style';
import { timeAgo } from '@/lib/utils';
import { followStoreAction, rateStoreAction, sendCollabAction, requestTransferAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sid = /^\d+$/.test(id) ? Number(id) : await storeIdByHandle(id);
  const s = sid ? await getStore(sid) : null;
  if (!s) return { title: 'متجر' };
  const meta = await getStoreMeta(s.id);
  const name = meta.storeName || s.name || 'متجر';
  const desc = (meta.tagline || meta.about || `متجر ${name} على منصة تربح`).replace(/\s+/g, ' ').trim().slice(0, 160);
  // the store's OWN name + logo when shared (WhatsApp/social) — full independence.
  // fall back to a real PNG only when the merchant hasn't uploaded a logo yet.
  const rawLogo = s.logo && !s.logo.endsWith('placeholder-ad.svg') ? s.logo : '/apple-icon.png';
  const logoAbs = rawLogo.startsWith('http') ? rawLogo : `https://${SITE.domain}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`;
  const url = meta.handle ? `https://${meta.handle}.${SITE.domain}` : `https://${SITE.domain}/companies/${s.id}`;
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

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; t?: string; added?: string }> }) {
  const { id } = await params;
  const { q, t, added } = await searchParams;
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
  const subBlocked = await isStoreSubBlocked(storeId).catch(() => false);
  if ((meta.status !== 1 || subBlocked) && !isOwner && !admin) {
    const pending = meta.status === 0;
    const subOnly = meta.status === 1 && subBlocked;
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary text-3xl">{pending ? '⏳' : '🚫'}</div>
        <h1 className="text-lg font-extrabold text-primary">{pending ? 'هذا المتجر قيد المراجعة' : 'هذا المتجر غير متاح حالياً'}</h1>
        <p className="text-sm text-muted-foreground">{pending ? 'يخضع المتجر لموافقة الإدارة وسيظهر للعملاء بعد اعتماده.' : subOnly ? 'المتجر غير متاح مؤقتاً. سيعود للظهور قريباً.' : 'تم إيقاف هذا المتجر مؤقتاً من قبل الإدارة.'}</p>
        <Link href="/" className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white">الصفحة الرئيسية</Link>
      </div>
    );
  }

  // مشاهدة متجر = كل دخول/تحديث (لا تُحتسب مشاهدة المالك). أمّا الزوّار فمُزال تكرارهم يومياً.
  if (!isOwner) {
    await bumpStoreView(storeId);
    const vid = (await cookies()).get('trbhh_vid')?.value;
    const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
    if (viewerKey) {
      const ref = (await headers()).get('referer');
      await recordStoreVisit(storeId, viewerKey, classifySource(ref, SITE.domain));
    }
  }

  const [myAds, productIds, followers, rating, reviews, following] = await Promise.all([
    getMyAds(s.userId),
    storeProductAdIds(storeId),
    followersCount(storeId),
    getStoreRating(storeId),
    getStoreReviews(storeId),
    session && !isOwner ? isFollowing(session.uid, storeId) : Promise.resolve(false),
  ]);
  // independent catalog: ONLY the ads the merchant added to the store — never
  // all their platform ads. Empty until the owner showcases products.
  const inStore = new Set(productIds);
  const inStoreAds = myAds.filter((a) => a.status === 1 && inStore.has(a.id));
  const viewsById = await adViewCounts(inStoreAds.map((a) => a.id)).catch(() => new Map<number, number>());
  const allActive = inStoreAds.map((a) => ({ id: a.id, title: a.title, price: a.price, adsType: a.adsType, image: a.image, cityName: null, categoryName: null, createdAt: a.createdAt, special: a.special, views: viewsById.get(a.id) ?? 0, sellerName: null, sellerTrusted: false }));
  const active = query ? allActive.filter((a) => (a.title || '').includes(query)) : allActive;
  // نص واتساب للمتجر: نص المتجر إن وُجد، وإلا نصّ افتراضي (لا يظهر فارغاً)
  const { parseTemplates, fillTemplate } = await import('@/lib/settings');
  const storeUrl = meta.handle ? `https://${meta.handle}.${SITE.domain}` : `https://${SITE.domain}/companies/${storeId}`;
  const baseTpl = parseTemplates(meta.msgTemplates)[0] || 'السلام عليكم، لديّ استفسار عن متجر {name}';
  const wa = waLink(s.whatsapp, fillTemplate(baseTpl, { link: storeUrl, name: meta.storeName || s.name }));
  // مشاهدات المتجر = عدد مرّات دخول/تحديث صفحة المتجر (مشاهدة واحدة لكل زيارة)
  const storeViews = await getStoreViews(storeId).catch(() => 0);
  // collaboration: can this viewer (a merchant) invite this store?
  const viewerStoreId = session && !isOwner ? await storeIdOfUser(session.uid) : 0;
  const alreadyPartner = viewerStoreId ? await isCollaborator(viewerStoreId, storeId) : false;
  const canInvite = viewerStoreId > 0 && viewerStoreId !== storeId && !alreadyPartner;
  const partnerAds = await collaboratorAds(storeId).catch(() => []);
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

  return (
    <div className="min-h-screen bg-muted/20 pb-24">
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
            <Link href={`/store-login?s=${encodeURIComponent(meta.handle || String(storeId))}`} className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold text-white shadow-sm" style={{ background: brand }}>
              <LogIn className="h-4 w-4" /> دخول المتجر
            </Link>
          )}
          {isOwner && meta.allowAds && (
            <Link href="/ads/new?dest=store" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="أضف إعلان"><Plus className="h-5 w-5" /></Link>
          )}
          {isOwner && (
            <a href="/store/analytics" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="إحصائيات المتجر"><BarChart3 className="h-4 w-4" /></a>
          )}
          {isOwner && (
            <a href="/store" className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: brand }} aria-label="إدارة المتجر"><Building2 className="h-4 w-4" /></a>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-3 py-3">
        {isOwner && added === '1' && (
          <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800 shadow-sm">✓ تم نشر الإعلان وإضافته لمتجرك — تجده ضمن الإعلانات أدناه.</div>
        )}
        {meta.status !== 1 && (isOwner || admin) && (
          <div className="rounded-xl border bg-white p-3 text-sm font-bold text-amber-700 shadow-sm">⏳ هذا المتجر {meta.status === 0 ? 'بانتظار موافقة الإدارة' : 'موقوف'} — يظهر لك فقط حالياً.</div>
        )}

        {/* إعلان/تنويه المتجر — نص يتحكّم به صاحب المتجر (استقلالية تامة) */}
        {meta.announce && (
          <div className="flex items-start gap-2 rounded-xl border-2 p-3 text-sm font-bold shadow-sm" style={{ borderColor: `${brand}40`, background: `${brand}0d`, color: brand }}>
            <Megaphone className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="whitespace-pre-line leading-6">{meta.announce}</span>
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
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${tierStyle[tier.key]}`}>{tier.key === 'gold' && <Crown className="h-3.5 w-3.5" />}{tier.label}</span>
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

            {/* أزرار: متابعة + تواصل */}
            <div className="mt-3 flex flex-wrap gap-2">
              {!isOwner && (
                <form action={followStoreAction}>
                  <input type="hidden" name="storeId" value={storeId} />
                  <button className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: following ? '#64748b' : brand }}>
                    <Heart className={`h-4 w-4 ${following ? 'fill-white' : ''}`} /> {following ? 'متابَع ✓' : 'متابعة'}
                  </button>
                </form>
              )}
              {wa && <StoreContactLink storeId={storeId} kind="whatsapp" href={wa} target="_blank"><Button variant="whatsapp"><MessageCircle className="h-4 w-4" /> واتساب</Button></StoreContactLink>}
              {s.phone && <StoreContactLink storeId={storeId} kind="call" href={`tel:${s.phone}`}><Button variant="outline"><Phone className="h-4 w-4" /> اتصال</Button></StoreContactLink>}
              {canInvite && (
                <form action={sendCollabAction}>
                  <input type="hidden" name="toStore" value={storeId} />
                  <Button variant="outline"><Handshake className="h-4 w-4" /> دعوة للتعاون</Button>
                </form>
              )}
              {alreadyPartner && <span className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700"><Handshake className="h-4 w-4" /> شريك متعاون</span>}
            </div>
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
          <CopyLink url={`https://${SITE.domain}/companies/${storeId}`} label="رابط المتجر المباشر" />

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
                  <button className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold text-white" style={{ background: brand }}>
                    <Handshake className="h-4 w-4" /> إرسال طلب النقل
                  </button>
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

      <StoreBottomNav brand={brand} wa={wa} isOwner={isOwner} storeId={storeId} canAdd={!!meta.allowAds} home={meta.handle ? `https://${meta.handle}.${SITE.domain}` : `/companies/${storeId}`} />
    </div>
  );
}
