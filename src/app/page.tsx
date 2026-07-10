import Link from 'next/link';
import { Users, Megaphone, LayoutGrid, Eye, Sparkles, ChevronLeft } from 'lucide-react';
import {
  getCategories,
  getFeaturedAds,
  getLatestAds,
  getMostViewedAds,
  getStats,
  getAdsByCategory,
} from '@/lib/data';
import { CategorySelect } from '@/components/category-select';
import { AdGrid } from '@/components/ad-card';
import { Section } from '@/components/section';
import { PromoSlot } from '@/components/promo-slot';
import { DisclaimerBar } from '@/components/disclaimer';
import { getHomeStats, getHomeClassifiedText, getHomeHeadings } from '@/lib/settings';
import { getSession } from '@/lib/auth';
import { getInterests } from '@/lib/interests';
import { homeFeaturedAds, homeStoreCards, storeIdOfUser } from '@/lib/merchant';
import { StoreMiniCard, type StoreCardData } from '@/components/store-mini-card';
import { OpenStoreBanner } from '@/components/open-store-banner';
import { WelcomeBanner } from '@/components/welcome-banner';
import { TopupPromoBanner } from '@/components/topup-promo-banner';

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
    getLatestAds(12),
    getMostViewedAds(8),
    getStats(),
    getHomeStats().catch(() => new Set(['ads', 'users', 'views', 'cats'])),
    getHomeClassifiedText().catch(() => ({ title: 'الإعلانات المبوّبة', sub: 'تصفّح البطاقات أو صمّم إعلانك بالمصمم الذكي' })),
  ]);
  const H = await getHomeHeadings().catch(() => ({ stores: 'متاجر تربح', products: 'منتجات المتاجر', featured: 'إعلانات مميّزة', latest: 'أحدث الإعلانات', mostViewed: 'الأكثر مشاهدة' }));
  const catsParam = (cats || '').split(',').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n) && n > 0);
  const statCards: { key: string; icon: React.ElementType; value: number; label: string; href?: string }[] = [
    { key: 'ads', icon: Megaphone, value: stats.ads, label: 'إعلان نشط', href: '/search' },
    { key: 'users', icon: Users, value: stats.users, label: 'عضو مسجّل' },
    { key: 'views', icon: Eye, value: stats.views, label: 'مشاهدة' },
    { key: 'cats', icon: LayoutGrid, value: stats.cats, label: 'قسم', href: '/search' },
  ].filter((s) => homeStats.has(s.key));

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
  const storeCards = (await homeStoreCards().catch(() => [])) as StoreCardData[];
  const myStore = session ? await storeIdOfUser(session.uid).catch(() => 0) : 0;
  // الرصيد الترحيبي — بانر للزوار فقط عندما يحدد التحكم مبلغاً أكبر من صفر
  const welcomeCredit = session ? 0 : await import('@/lib/points').then((m) => m.getWelcomeCredit()).catch(() => 0);

  return (
    <div className="space-y-4">
      {/* Paid banner — top of home */}
      <PromoSlot placement="home_top" />

      {/* سجّل واحصل على رصيد ترحيبي — للزوار فقط وقابل للإغلاق */}
      {!session && welcomeCredit > 0 && <WelcomeBanner amount={welcomeCredit} />}

      {/* بانر عرض الشحن: اشحن بـ100 ونضيف لك 10 — يظهر عند تفعيل مكافآت الشحن من التحكم */}
      <TopupPromoBanner />

      {/* Category dropdown — pick one or more categories to show */}
      <CategorySelect categories={categories} initial={catsParam} />

      {/* Stats — the admin selects which cards to show */}
      {statCards.length > 0 && (
        <div className={`grid gap-2 ${['', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4'][statCards.length] || 'grid-cols-4'}`}>
          {statCards.map((s) => <Stat key={s.key} icon={s.icon} value={s.value} label={s.label} href={s.href} />)}
        </div>
      )}

      {/* أقسام تهمّك — مثبّتة بالأعلى حسب اختيار العضو */}
      {pinned.length > 0 && (
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

      {/* بانر مستقل: افتح متجرك — لغير أصحاب المتاجر */}
      {!myStore && <OpenStoreBanner />}

      {/* Classified ads entry link */}
      <Link href="/classified" className="card-3d flex items-center justify-between gap-3 rounded-2xl p-4">
        <span className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-6 w-6" /></span>
          <span>
            <span className="block font-bold text-primary">{clsText.title}</span>
            <span className="block text-xs text-muted-foreground">{clsText.sub}</span>
          </span>
        </span>
        <ChevronLeft className="h-5 w-5 shrink-0 text-primary" />
      </Link>

      {/* إعلان المتاجر — يظهر تلقائياً لكل متجر معتمد (بطاقة المتجر) */}
      {storeCards.length > 0 && (
        <Section title={H.stores} href="/companies">
          <div className="grid gap-2 sm:grid-cols-2">
            {storeCards.map((c) => <StoreMiniCard key={c.id} s={c} href={`/companies/${c.id}`} />)}
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
          {latest.length > 4 && <AdGrid ads={latest.slice(4)} />}
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
