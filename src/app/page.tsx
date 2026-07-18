import Link from 'next/link';
import { Users, Megaphone, LayoutGrid, Eye, Sparkles, ChevronLeft, Heart, MessageCircle, Phone } from 'lucide-react';
import {
  getCategories,
  getFeaturedAds,
  getHomeLatestAds,
  getMostViewedAds,
  getStats,
  getAdsByCategory,
} from '@/lib/data';
import { CategorySelect } from '@/components/category-select';
import { AdGrid } from '@/components/ad-card';
import { Section } from '@/components/section';
import { PromoSlot } from '@/components/promo-slot';
import { DisclaimerBar } from '@/components/disclaimer';
import { getHomeStats, getHomeClassifiedText, getHomeHeadings, getSettingBool, categoriesEnabled, getSetting, getWelcomePopupSeconds, SETTING_WELCOME_GUEST_TEXT, DEFAULT_WELCOME_GUEST_TEXT } from '@/lib/settings';
import { ShareButtons } from '@/components/share-buttons';
import { SITE } from '@/lib/constants';
import { getSession } from '@/lib/auth';
import { getInterests } from '@/lib/interests';
import { homeFeaturedAds, homeStoreCards, storeIdOfUser } from '@/lib/merchant';
import { StoreMiniCard, type StoreCardData } from '@/components/store-mini-card';
import { OpenStoreBanner } from '@/components/open-store-banner';
import { WelcomeBanner } from '@/components/welcome-banner';
import { GuestWelcomeBanner } from '@/components/guest-welcome-banner';
import { TopupPromoBanner } from '@/components/topup-promo-banner';
import { FeedTextBanner } from '@/components/feed-text-banner';
import { getFeedBannerItems } from '@/lib/settings';
import { Fragment } from 'react';

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

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cats?: string }> }) {
  // ناشر الجدولة الكسول — يرقّي الإعلانات المجدولة التي حان وقتها (خنق ٦٠ث)
  import('@/lib/data').then((m0) => m0.promoteScheduledAds()).catch(() => {});
  const { cats } = await searchParams;
  const [categories, featured, latest, mostViewed, stats, homeStats, clsText] = await Promise.all([
    getCategories(),
    getFeaturedAds(8),
    getHomeLatestAds(),
    getMostViewedAds(8),
    getStats(),
    getHomeStats().catch(() => new Set(['ads', 'users', 'views', 'cats'])),
    getHomeClassifiedText().catch(() => ({ title: 'الإعلانات المبوّبة', sub: 'تصفّح البطاقات أو صمّم إعلانك بالمصمم الذكي' })),
  ]);
  const H = await getHomeHeadings().catch(() => ({ stores: 'متاجر تربح', products: 'منتجات المتاجر', featured: 'إعلانات مميّزة', latest: 'أحدث الإعلانات', mostViewed: 'الأكثر مشاهدة' }));
  const catsParam = (cats || '').split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
  let statCards: { key: string; icon: React.ElementType; value: number; label: string; href?: string }[] = [
    { key: 'ads', icon: Megaphone, value: stats.ads, label: 'إعلان نشط', href: '/search' },
    { key: 'users', icon: Users, value: stats.users, label: 'عضو مسجّل' },
    { key: 'views', icon: Eye, value: stats.views, label: 'مشاهدة' },
    { key: 'cats', icon: LayoutGrid, value: stats.cats, label: 'قسم', href: '/search' },
  ].filter((s) => homeStats.has(s.key));
  // بطاقة «قسم» تُخفى مع إخفاء الأقسام
  // (تُرشَّح لاحقاً بعد جلب catsOn)

  // Categories to pin at the top: the dropdown selection (?cats=) if present,
  // otherwise the logged-in member's chosen "interests".
  const session = await getSession().catch(() => null);
  const interestIds = session ? await getInterests(session.uid).catch(() => []) : [];
  const showIds = catsParam.length ? catsParam : interestIds;
  const nameById = new Map(categories.map((c) => [c.id, c.name]));
  const pinned = (
    await Promise.all(
      showIds.slice(0, 6).map(async (id) => ({ id, name: nameById.get(id) || 'قسم', ads: await getAdsByCategory(id, 4).catch(() => []) })),
    )
  ).filter((p) => p.ads.length > 0);
  const pinnedLabel = catsParam.length ? 'الأقسام المختارة' : '⭐ أقسام تهمّك';
  const storeAds = await homeFeaturedAds().catch(() => []);
  const feedTexts = await getFeedBannerItems().catch(() => []);
  // أزرار تواصل الموقع تحت الإحصائيات — قابلة للتعطيل من التحكم
  const homeActionsOn = await getSettingBool('home_actions_on', true).catch(() => true);
  // إخفاء الأقسام من كل الموقع (مفتاح التحكم) — لا يمس أقسام الإعلانات المحفوظة
  const catsOn = await categoriesEnabled().catch(() => true);
  const noCatsBanner = catsOn ? '' : await import('@/lib/settings').then((m) => m.getSetting(m.SETTING_HOME_NOCATS_BANNER, m.DEFAULT_HOME_NOCATS_BANNER)).catch(() => '');
  if (!catsOn) statCards = statCards.filter((c) => c.key !== 'cats');
  const siteDigits = SITE.phone.replace(/\D/g, '').replace(/^00/, '');
  const storeCards = (await homeStoreCards().catch(() => [])) as StoreCardData[];
  const myStore = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  // الرصيد الترحيبي — بانر للزوار فقط عندما يحدد التحكم مبلغاً أكبر من صفر
  const welcomeCredit = session ? 0 : await import('@/lib/points').then((m) => m.getWelcomeCredit()).catch(() => 0);
  const [guestWelcomeText, welcomePopupSeconds] = await Promise.all([
    getSetting(SETTING_WELCOME_GUEST_TEXT, DEFAULT_WELCOME_GUEST_TEXT),
    getWelcomePopupSeconds(),
  ]);

  return (
    <div className="space-y-4">
      {/* Paid banner — top of home */}
      <PromoSlot placement="home_top" />

      {/* سجّل واحصل على رصيد ترحيبي — للزوار فقط وقابل للإغلاق */}
      {!session && welcomeCredit > 0 && <WelcomeBanner amount={welcomeCredit} />}

      {/* ترحيب بالزائر غير المسجّل + دعوة للتسجيل — أول زيارة في الجلسة فقط، لا يتكرر مزعجاً */}
      {!session && <GuestWelcomeBanner text={guestWelcomeText} seconds={welcomePopupSeconds} />}

      {/* بانر عرض الشحن: اشحن بـ100 ونضيف لك 10 — يظهر عند تفعيل مكافآت الشحن من التحكم */}
      <TopupPromoBanner />

      {/* Category dropdown — pick one or more categories to show */}
      {catsOn && <CategorySelect categories={categories} initial={catsParam} />}

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

      {/* أقسام تهمّك — مثبّتة بالأعلى حسب اختيار العضو */}
      {catsOn && pinned.length > 0 && (
        <div className="space-y-4 rounded-2xl border-2 border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-extrabold text-primary">{pinnedLabel}</span>
            {catsParam.length ? (
              <Link href="/" className="text-xs text-primary hover:underline">إلغاء التصفية</Link>
            ) : (
              <Link href="/account" className="text-xs text-primary hover:underline">تعديل اهتماماتي</Link>
            )}
          </div>
          {pinned.map((p) => (
            <Section key={p.id} title={p.name} href={`/categories/${p.id}`}>
              <AdGrid ads={p.ads} />
            </Section>
          ))}
        </div>
      )}

      {/* بانر قصير عند إخفاء الأقسام — نصه يُعدَّل من الإدارة ← النصوص ← الرئيسية */}
      {!catsOn && noCatsBanner && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/60 bg-gradient-to-l from-amber-50 to-orange-50 px-3 py-2 shadow-sm">
          <span className="text-base">📣</span>
          <p className="text-xs font-bold leading-5 text-amber-900">{noCatsBanner}</p>
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
        <Section title={H.stores} href="/companies">
          {/* شبكة مضغوطة بارتفاع قليل — عمودان على الجوال وحتى أربعة على الشاشات الكبيرة */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {storeCards.map((c) => <StoreMiniCard key={c.id} s={c} href={`/companies/${c.id}`} compact />)}
          </div>
        </Section>
      )}

      {/* منتجات المتاجر — تظهر فقط للمتاجر التي اعتمدت الإدارة عرض منتجاتها */}
      {storeAds.length > 0 && (
        <Section title={H.products} href="/companies">
          <AdGrid ads={storeAds} />
        </Section>
      )}

      {featured.length > 0 && (
        <Section title={H.featured} href="/search?special=1">
          <AdGrid ads={featured} />
        </Section>
      )}

      <Section title={H.latest} href="/search">
        <div className="space-y-4">
          <AdGrid ads={latest.slice(0, 4)} />
          {/* Paid banner — in-feed after 4 ads */}
          <PromoSlot placement="feed" />
          {/* بقية الإعلانات على دفعات: بانر نصي (تسويقي/توعوي متبدل) كل ~10 أسطر
              (20 إعلاناً على شبكة عمودين — أول بانر بعد 20 إعلاناً من أعلى القائمة) */}
          {(() => {
            const rest = latest.slice(4);
            if (!rest.length) return null;
            const chunks: typeof rest[] = [rest.slice(0, 16)];
            for (let i = 16; i < rest.length; i += 20) chunks.push(rest.slice(i, i + 20));
            return chunks.map((c, i) => (
              <Fragment key={i}>
                <AdGrid ads={c} />
                {feedTexts.length > 0 && i < chunks.length - 1 && <FeedTextBanner items={feedTexts} />}
              </Fragment>
            ));
          })()}
          {/* الرئيسية تعرض كل إعلانات آخر شهر — والأقدم عبر البحث والأقسام */}
          <Link href="/search" className="card-3d block rounded-xl p-3 text-center text-sm font-bold text-primary hover:bg-secondary/40">
            الإعلانات الأقدم من شهر تجدها في البحث والأقسام — عرض الكل ←
          </Link>
        </div>
      </Section>

      {mostViewed.length > 0 && (
        <Section title={H.mostViewed}>
          <AdGrid ads={mostViewed} />
        </Section>
      )}

      <DisclaimerBar />
    </div>
  );
}
