import Link from 'next/link';
import { cookies } from 'next/headers';
import { Users, Megaphone, Eye, Sparkles, ChevronLeft, Heart, MessageCircle, Phone } from 'lucide-react';
import {
  getFeaturedAds,
  getCities,
  getAreas,
  getHomeLatestAds,
  getMostViewedAds,
  getTopRatedAds,
  getStats,
  getPersonalizedAds,
  searchAds,
} from '@/lib/data';
import { PublicSearchForm } from '@/components/public-search-form';
import { HomeCategoryNavigation } from '@/components/home-category-navigation';
import { AdGrid } from '@/components/ad-card';
import { mergeHomeAds, selectedHomeCategory } from '@/lib/home-feed';
import { getCategoryFormConfig } from '@/lib/ad-categories/service';
import { CollapsibleSection } from '@/components/collapsible-section';
import { PromoSlot } from '@/components/promo-slot';
import { getHomeStats, getHomeClassifiedText, getSettingBool, getSetting, getWelcomePopupSeconds, SETTING_WELCOME_GUEST_TEXT, DEFAULT_WELCOME_GUEST_TEXT } from '@/lib/settings';
import { ShareButtons } from '@/components/share-buttons';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { homeFeaturedAds, homeStoreCards, storeIdOfUser } from '@/lib/merchant';
import { StoreMiniCard, type StoreCardData } from '@/components/store-mini-card';
import { OpenStoreBanner } from '@/components/open-store-banner';
import { WelcomeBanner } from '@/components/welcome-banner';
import { GuestWelcomeBanner } from '@/components/guest-welcome-banner';
import { TopupPromoBanner } from '@/components/topup-promo-banner';
import { FeedTextBanner } from '@/components/feed-text-banner';
import { getFeedBannerItems } from '@/lib/settings';
import { PlatformRatingWidget } from '@/components/platform-rating-widget';
import { getPlatformRating, getMyPlatformReview } from '@/lib/platform-rating';
import { CommerceHero } from '@/components/commerce/commerce-hero';
import { publicHomeHero } from '@/lib/public-home';

export const dynamic = 'force-dynamic';

function Stat({ icon: Icon, value, label, href }: { icon: React.ElementType; value: number; label: string; href?: string }) {
  const inner = (
    <>
      <Icon className="h-4 w-4 text-primary" />
      <div className="text-sm font-bold leading-tight text-primary">{new Intl.NumberFormat('en-US').format(value)}</div>
      <div className="text-[10px] leading-tight text-muted-foreground">{label}</div>
    </>
  );
  const cls = 'card-3d flex flex-col items-center gap-0.5 rounded-lg p-2 text-center';
  return href ? (
    <Link href={href} className={`${cls} transition hover:-translate-y-0.5 hover:border-primary/40`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export default async function HomePage({ searchParams }: { searchParams?: Promise<{ published?: string; category?: string | string[] }> }) {
  const sp = (await searchParams) || {};
  const categoryConfig = await getCategoryFormConfig().catch(() => null);
  const selectedCategory = selectedHomeCategory(categoryConfig, sp.category);
  // ناشر الجدولة الكسول — يرقّي الإعلانات المجدولة التي حان وقتها (خنق ٦٠ث)
  import('@/lib/data').then((m0) => m0.promoteScheduledAds()).catch(() => {});
  const [featured, latest, mostViewed, topRated, stats, homeStats, clsText] = await Promise.all([
    selectedCategory ? Promise.resolve([]) : getFeaturedAds(8),
    selectedCategory ? searchAds({ categoryId: selectedCategory.id, take: 24, skip: 0 }) : getHomeLatestAds(8),
    selectedCategory ? Promise.resolve([]) : getMostViewedAds(8),
    selectedCategory ? Promise.resolve([]) : getTopRatedAds(8),
    getStats(),
    getHomeStats().catch(() => new Set(['ads', 'users', 'views'])),
    getHomeClassifiedText().catch(() => ({ title: 'الإعلانات المبوّبة', sub: 'تصفّح البطاقات أو صمّم إعلانك بالمصمم الذكي' })),
  ]);
  const statCards: { key: string; icon: React.ElementType; value: number; label: string; href?: string }[] = [
    { key: 'ads', icon: Megaphone, value: stats.ads, label: 'إعلان نشط', href: '/search' },
    { key: 'users', icon: Users, value: stats.users, label: 'عضو مسجّل' },
    { key: 'views', icon: Eye, value: stats.views, label: 'مشاهدة' },
  ].filter((s) => homeStats.has(s.key));

  const session = await getSession().catch(() => null);
  // اهتمام الزائر/العضو يُستنتَج بدلالة المحتوى الفعلي الذي تصفّحه وبحث عنه
  // (كلمات عناوين الإعلانات والمتاجر التي زارها + بحثه المحفوظ). يعمل للزوّار
  // أيضاً عبر معرّف زيارته الدائم (trbhh_vid)، لا الأعضاء فقط.
  const vid = (await cookies()).get('trbhh_vid')?.value;
  const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
  const personalizedAds = selectedCategory ? [] : await getPersonalizedAds(viewerKey, session?.uid || 0, 8).catch(() => []);
  const storeAds = selectedCategory ? [] : await homeFeaturedAds().catch(() => []);
  const feedAds = selectedCategory ? latest : mergeHomeAds(featured, latest, storeAds, mostViewed, topRated);
  const feedSearchHref = selectedCategory ? `/search?category=${selectedCategory.id}` : '/search';
  const feedTexts = await getFeedBannerItems().catch(() => []);
  // أزرار تواصل الموقع تحت الإحصائيات — قابلة للتعطيل من التحكم
  const homeActionsOn = await getSettingBool('home_actions_on', true).catch(() => true);
  const siteDigits = SITE.phone.replace(/\D/g, '').replace(/^00/, '');
  const storeCards = (await homeStoreCards().catch(() => [])) as StoreCardData[];
  const myStore = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  // الرصيد الترحيبي — بانر للزوار فقط عندما يحدد التحكم مبلغاً أكبر من صفر
  const welcomeCredit = session ? 0 : await import('@/lib/points').then((m) => m.getWelcomeCredit()).catch(() => 0);
  const [guestWelcomeText, welcomePopupSeconds] = await Promise.all([
    getSetting(SETTING_WELCOME_GUEST_TEXT, DEFAULT_WELCOME_GUEST_TEXT),
    getWelcomePopupSeconds(),
  ]);
  // تقييم المنصة بالنجوم — قابل للإخفاء من التحكم ← الإعدادات
  const platformRatingOn = await getSettingBool('platform_rating_on', true).catch(() => true);
  // التقييم للمسجّلين فقط: نتحقق من تقييم العضو بمفتاحه (u{id})، لا الزائر — ونجلب تقييمه الحالي للتعديل
  const myViewerKey = session ? `u${session.uid}` : null;
  const [platformRating, myReview] = platformRatingOn
    ? await Promise.all([getPlatformRating().catch(() => ({ avg: 0, count: 0 })), getMyPlatformReview(myViewerKey).catch(() => null)])
    : [{ avg: 0, count: 0 }, null];
  const platformRated = !!myReview;
  const [discoveryOn, discoveryTitle, discoverySubtitle, discoveryPlaceholder, discoveryAddLabel, priceOn, cities, areas] = await Promise.all([
    getSettingBool('home_discovery_on', true),
    getSetting('home_discovery_title', 'تربح — إعلانات ومتاجر قريبة منك'),
    getSetting('home_discovery_subtitle', 'ابحث عن عرضك القادم أو أضف إعلانك وتواصل مباشرة مع المعلن.'),
    getSetting('home_discovery_search_placeholder', 'ماذا تبحث عنه؟'),
    getSetting('home_discovery_add_label', 'أضف إعلانك'),
    getSettingBool('search_price_filter_on', true),
    getCities(), getAreas(),
  ]);

  return (
    <div className="commerce-scope public-marketplace-home space-y-7 sm:space-y-10" data-home-version="marketplace-v2">
      {/* ✅ تأكيد نشر الإعلان — يظهر بعد النشر الناجح والتحويل للرئيسية */}
      {sp.published && (
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-3 text-center text-sm font-extrabold text-emerald-800 shadow-sm">
          ✅ تم نشر إعلانك بنجاح ويظهر الآن في تربح.
          {Number(sp.published) > 0 && <> <Link href={`/ads/${Number(sp.published)}`} className="underline">عرض إعلانك</Link></>}
        </div>
      )}

      {discoveryOn && (
        <section className="space-y-4" aria-label="اكتشف سوق تربح">
          <CommerceHero headingLevel={1} label="اكتشف تربح" slides={publicHomeHero(feedAds, discoveryTitle === 'تربح — إعلانات ومتاجر قريبة منك' ? 'بيع. اشترِ. وتربح.' : discoveryTitle, discoverySubtitle === 'ابحث عن عرضك القادم أو أضف إعلانك وتواصل مباشرة مع المعلن.' ? 'اعرض اللي عندك، واكتشف اللي تحتاجه، وتواصل مباشرة.' : discoverySubtitle, feedSearchHref)} />
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold text-[#16294a]">وش تبحث عنه اليوم؟</h2>
              <Link href="/ads/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff6a1a] px-4 py-2 text-sm font-extrabold text-[#16294a]"><Megaphone className="h-4 w-4" />{discoveryAddLabel}</Link>
            </div>
            <PublicSearchForm regions={cities} areas={areas} params={{ category: selectedCategory?.id.toString() }} priceOn={priceOn} placeholder={discoveryPlaceholder} compact />
          </div>
        </section>
      )}
      <HomeCategoryNavigation selectedCategory={sp.category} config={categoryConfig} visual />
      {/* Paid banner — top of home */}
      <PromoSlot placement="home_top" />

      <section aria-label={selectedCategory?.name || 'السوق'} className="space-y-4">
        {feedAds.length > 0 && <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-extrabold text-[#16294a]"><span className="h-6 w-1.5 rounded-full bg-[#ff6a1a]" />{selectedCategory?.name || 'اكتشف السوق'}</h2><Link href={feedSearchHref} className="py-2 text-sm font-bold text-[#16294a]">عرض الكل ←</Link></div>}
        <div className="space-y-4">
          {selectedCategory && !feedAds.length
            ? <p className="text-sm text-muted-foreground">{categoryConfig?.labels.emptyText}</p>
            : <AdGrid ads={feedAds} appearance="marketplace" />}
          <PromoSlot placement="feed" />
          {feedTexts.length > 0 && <FeedTextBanner items={feedTexts} />}
          {/* تُعرض أحدث دفعة بسرعة؛ البحث يبقى السجل الكامل دون تحميله مسبقاً في الرئيسية. */}
          <Link href={feedSearchHref} className="card-3d block rounded-xl p-3 text-center text-sm font-bold text-primary hover:bg-secondary/40">
            عرض جميع الإعلانات في البحث ←
          </Link>
        </div>
      </section>

      {/* سجّل واحصل على رصيد ترحيبي — للزوار فقط وقابل للإغلاق */}
      {!session && welcomeCredit > 0 && <WelcomeBanner amount={welcomeCredit} />}

      {/* ترحيب بالزائر غير المسجّل + دعوة للتسجيل — أول زيارة في الجلسة فقط، لا يتكرر مزعجاً */}
      {!session && <GuestWelcomeBanner text={guestWelcomeText} seconds={welcomePopupSeconds} />}

      {/* بانر عرض الشحن: اشحن بـ100 ونضيف لك 10 — يظهر عند تفعيل مكافآت الشحن من التحكم */}
      <TopupPromoBanner />

      {/* 🎯 يهمّك الآن — تغذية مخصّصة بدلالة ما تصفّحه وبحث عنه فعلياً،
          تظهر أول محتوى في الصفحة لمن له تصفّح سابق. */}
      {!selectedCategory && personalizedAds.length > 0 && (
        <CollapsibleSection title="🎯 يهمّك الآن" defaultOpen={false}>
          <AdGrid ads={personalizedAds} appearance="marketplace" />
        </CollapsibleSection>
      )}

      {/* تقييم منصة تربح بالنجوم — للزوّار والأعضاء، مرة واحدة لكل منهما */}
      {platformRatingOn && (
        <div className="-mt-2">
          <PlatformRatingWidget avg={platformRating.avg} count={platformRating.count} alreadyRated={platformRated} isLoggedIn={!!session} myStar={myReview?.star || 0} myNote={myReview?.note || ''} />
        </div>
      )}

      {/* Stats — the admin selects which cards to show */}
      {statCards.length > 0 && (
        <div className={`grid gap-2 ${['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][statCards.length] || 'grid-cols-4'}`}>
          {statCards.map((s) => <Stat key={s.key} icon={s.icon} value={s.value} label={s.label} href={s.href} />)}
        </div>
      )}

      {/* أزرار الموقع بسطر واحد: متابعة تربح، واتساب واتصال بالرقم الرسمي، مشاركة الموقع */}
      {homeActionsOn && (
        <div className="flex gap-2">
          <Link href={session ? '/notifications' : '/register'} aria-label="تابع تربح" title={session ? 'تابع تربح — تنبيهاتك' : 'تابع تربح — سجّل الآن'} className="grid h-11 flex-1 place-items-center rounded-xl bg-primary text-white shadow-sm">
            <Heart className="h-5 w-5 fill-white" />
          </Link>
          <a href={`https://wa.me/${siteDigits}`} target="_blank" rel="noopener noreferrer" aria-label="واتساب تربح" title="راسلنا واتساب — للاستفسار والملاحظات" className="grid h-11 flex-1 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
            <MessageCircle className="h-5 w-5" />
          </a>
          <a href={`tel:+${siteDigits}`} aria-label="اتصل بتربح" title="اتصل بنا — للاستفسار والملاحظات" className="grid h-11 flex-1 place-items-center rounded-xl border bg-white text-primary shadow-sm">
            <Phone className="h-5 w-5" />
          </a>
          <span className="h-11 flex-1 rounded-xl border bg-white text-primary shadow-sm" title="شارك تربح">
            <ShareButtons
              url={`https://${SITE.domain}`}
              title={SITE.name}
              text={`${SITE.name} ${SITE.tagline}`}
              compact
              iconOnly
              card={{ url: `https://${SITE.domain}`, title: SITE.name, desc: SITE.tagline, city: '', image: '/logo-header.png' }}
            />
          </span>
        </div>
      )}

      {/* بانر مستقل: افتح متجرك — لغير أصحاب المتاجر */}
      {!myStore && <OpenStoreBanner />}

      {/* Classified ads entry link — بارتفاع قليل */}
      <Link href="/classified" className="card-3d flex items-center justify-between gap-2 rounded-2xl px-3 py-2">
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary"><Sparkles className="h-4 w-4" /></span>
          <span>
            <span className="block text-sm font-bold leading-5 text-primary">{clsText.title}</span>
            <span className="block text-[11px] leading-4 text-muted-foreground">{clsText.sub}</span>
          </span>
        </span>
        <ChevronLeft className="h-4 w-4 shrink-0 text-primary" />
      </Link>

      {/* إعلان المتاجر — يظهر تلقائياً لكل متجر معتمد (بطاقة المتجر) */}
      {storeCards.length > 0 && (
        <section aria-label="متاجر تربح" className="space-y-4">
          <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-extrabold text-[#16294a]"><span className="h-6 w-1.5 rounded-full bg-[#ff6a1a]" />متاجر تربح</h2><Link href="/companies" className="py-2 text-sm font-bold text-[#16294a]">كل المتاجر ←</Link></div>
          {/* شبكة مضغوطة بارتفاع قليل — عمودان على الجوال وحتى أربعة على الشاشات الكبيرة */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {storeCards.map((c) => <StoreMiniCard key={c.id} s={c} href={`/companies/${c.id}`} compact />)}
          </div>
        </section>
      )}
      <section aria-label="تواصل بثقة" className="grid gap-4 rounded-3xl bg-[#16294a] p-6 text-white sm:grid-cols-3 sm:p-8">
        <div><h2 className="font-extrabold text-[#f0b429]">بين البائع والمشتري مباشرة</h2><p className="mt-2 text-sm leading-6 text-white/80">تواصل مع المعلن واتفق معه على تفاصيل السلعة.</p></div>
        <div><h3 className="font-extrabold text-[#f0b429]">بدون عمولة على البيع</h3><p className="mt-2 text-sm leading-6 text-white/80">تربح يتيح لك عرض إعلانك والوصول إلى المهتمين.</p></div>
        <div><h3 className="font-extrabold text-[#f0b429]">تحقق قبل الدفع</h3><p className="mt-2 text-sm leading-6 text-white/80">افحص السلعة، وتأكد من الطرف الآخر، ولا تشارك رمز التحقق.</p></div>
      </section>
    </div>
  );
}
