import Link from 'next/link';
import { CommerceHero, type HeroSlide } from '@/components/commerce/commerce-hero';
import { CommerceGrid, CommerceSpotlight, CommerceCarousel, type CommerceCardItem } from '@/components/commerce/catalog';
import { composeHome, type HomeSectionInput, type ComposeHomeOptions, type HomeSectionAccent } from '@/lib/commerce/home-layout';

/**
 * تركيب الصفحة الرئيسية لمتجر تربح بأسلوب متجر معدّات احترافي (كحلي/برتقالي، RTL):
 *   • Hero متحرّك غنيّ بالصورة أعلى الصفحة،
 *   • شريط ثقة (معدّات موثوقة/توصيل/دعم/دفع آمن)،
 *   • صفوف منتجات بعناوين واضحة وتخطيط متكيّف،
 *   • بانرات ترويجية سفلية (فاتح + كحلي) بدعوة إجراء.
 * القسم الفارغ لا يُصيَّر إطلاقاً.
 */

export type CommerceHomeSection = HomeSectionInput<CommerceCardItem> & { subtitle?: string };

export type CommerceBanner = {
  title: string;
  subtitle?: string;
  cta?: string;
  href?: string;
  tone?: 'light' | 'navy';
};

export type TrustItem = { title: string; subtitle: string; icon: 'shield' | 'truck' | 'support' | 'pay' };

const DEFAULT_TRUST: TrustItem[] = [
  { title: 'عروض موثوقة', subtitle: 'إعلانات محقّقة على المنصّة', icon: 'shield' },
  { title: 'تواصل مباشر', subtitle: 'اتفق مع المُعلن مباشرةً', icon: 'support' },
  { title: 'تغطية واسعة', subtitle: 'في جميع مناطق المملكة', icon: 'truck' },
  { title: 'دفع خارج المنصّة', subtitle: 'المنصّة تعرض وتربط فقط', icon: 'pay' },
];

function TrustIcon({ name }: { name: TrustItem['icon'] }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const cls = 'h-7 w-7 text-[#ff6a1a]';
  if (name === 'shield') return <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden="true"><path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z" /><path d="m9 12 2 2 4-4" /></svg>;
  if (name === 'truck') return <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden="true"><path d="M3 6h11v9H3zM14 9h4l3 3v3h-7z" /><circle cx="7.5" cy="18" r="1.6" /><circle cx="17.5" cy="18" r="1.6" /></svg>;
  if (name === 'support') return <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="3" y="13" width="4" height="6" rx="1.5" /><rect x="17" y="13" width="4" height="6" rx="1.5" /><path d="M20 19a4 4 0 0 1-4 3h-2" /></svg>;
  return <svg viewBox="0 0 24 24" className={cls} {...p} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>;
}

function TrustBar({ items = DEFAULT_TRUST }: { items?: TrustItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm sm:grid-cols-4 sm:divide-x sm:divide-x-reverse sm:divide-black/5">
      {items.map((it) => (
        <div key={it.title} className="flex items-center gap-3 sm:justify-center sm:px-2">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ff6a1a]/10"><TrustIcon name={it.icon} /></span>
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-[#16294a]">{it.title}</div>
            <div className="truncate text-[11px] font-semibold text-[#16294a]/55">{it.subtitle}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export type CommerceCategory = { name: string; href: string; image?: string | null };

function CatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#16294a]/45" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-5 9 5-9 5z" /><path d="M3 9v6l9 5 9-5V9" /><path d="M12 14v6" />
    </svg>
  );
}

function CatMedia({ image, name }: { image?: string | null; name: string }) {
  if (!image) return <CatIcon />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={image} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />;
}

/** «تصفّح حسب الفئة» — بطاقات موحّدة: صف أفقي قابل للسحب على الجوال، شبكة على الحاسوب. */
function CommerceCategories({ items }: { items: CommerceCategory[] }) {
  if (!items || items.length === 0) return null;
  return (
    <section className="space-y-4">
      <SectionHeader title="تصفّح حسب الفئة" accent="navy" />
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-4 sm:overflow-visible md:grid-cols-6 lg:grid-cols-7">
        {items.map((c) => (
          <Link key={c.name} href={c.href} className="group flex w-20 shrink-0 flex-col items-center gap-2 sm:w-auto">
            <span className="grid aspect-square w-full max-w-[84px] place-items-center overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm transition group-hover:shadow-md">
              <CatMedia image={c.image} name={c.name} />
            </span>
            <span className="line-clamp-1 w-full text-center text-xs font-bold text-[#16294a]">{c.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const ACCENT_BAR: Record<HomeSectionAccent, string> = {
  gold: 'from-[#ff8a3d] to-[#ff6a1a]',
  navy: 'from-[#233a63] to-[#16294a]',
  orange: 'from-[#ff8a3d] to-[#ff6a1a]',
};

function SectionHeader({ title, subtitle, accent }: { title: string; subtitle?: string; accent: HomeSectionAccent }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2.5 text-lg font-extrabold text-[#16294a] sm:text-xl">
        <span className={`inline-block h-6 w-1.5 rounded-full bg-gradient-to-b ${ACCENT_BAR[accent]}`} />
        {title}
      </h2>
      {subtitle && <span className="shrink-0 text-xs font-bold text-[#16294a]/55">{subtitle}</span>}
    </div>
  );
}

function BottomBanners({ banners }: { banners: CommerceBanner[] }) {
  if (banners.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {banners.slice(0, 2).map((b, i) => {
        const navy = b.tone === 'navy';
        const body = (
          <div className={`relative flex h-full flex-col justify-center overflow-hidden rounded-2xl p-6 shadow-sm ring-1 sm:p-7 ${navy ? 'bg-gradient-to-l from-[#0f1d38] to-[#233a63] text-white ring-black/10' : 'bg-gradient-to-l from-[#fff5ea] to-[#ffe6cc] text-[#16294a] ring-[#ff6a1a]/25'}`}>
            <span aria-hidden="true" className={`pointer-events-none absolute -left-8 -top-10 h-36 w-36 rounded-full blur-3xl ${navy ? 'bg-[#ff6a1a]/25' : 'bg-[#ff6a1a]/20'}`} />
            <h3 className="relative text-lg font-extrabold sm:text-xl">{b.title}</h3>
            {b.subtitle && <p className={`relative mt-1 text-sm font-semibold ${navy ? 'text-white/80' : 'text-[#16294a]/65'}`}>{b.subtitle}</p>}
            {b.cta && <span className="relative mt-4 inline-flex w-fit items-center rounded-xl bg-[#ff6a1a] px-6 py-2.5 text-sm font-extrabold text-white shadow-sm">{b.cta}</span>}
          </div>
        );
        return b.href ? <Link key={i} href={b.href} className="block transition hover:brightness-[1.02]">{body}</Link> : <div key={i}>{body}</div>;
      })}
    </div>
  );
}

export function CommerceHome({
  hero = [],
  sections,
  options,
  banners = [],
  trust,
  categories = [],
}: {
  hero?: HeroSlide[];
  sections: CommerceHomeSection[];
  options?: ComposeHomeOptions;
  /** بانرات سفلية (فاتح/كحلي) بدعوة إجراء. */
  banners?: CommerceBanner[];
  /** عناصر شريط الثقة (اختياري) — الافتراضي أربعة عناصر. */
  trust?: TrustItem[];
  /** فئات «تصفّح حسب الفئة» (اختياري) — لا تُصيَّر إن كانت فارغة. */
  categories?: CommerceCategory[];
}) {
  const composed = composeHome(sections, options);
  const subtitleOf = new Map(sections.map((s) => [s.id, s.subtitle]));

  return (
    <div className="commerce-scope space-y-7">
      {hero.length > 0 && <CommerceHero slides={hero} />}
      <TrustBar items={trust} />
      <CommerceCategories items={categories} />

      {composed.map((sec) => (
        <section key={sec.id} className="space-y-4">
          <SectionHeader title={sec.title} subtitle={subtitleOf.get(sec.id)} accent={sec.accent} />
          {sec.display === 'spotlight' && <CommerceSpotlight items={sec.items} />}
          {sec.display === 'carousel' && <CommerceCarousel items={sec.items} />}
          {sec.display === 'grid' && <CommerceGrid items={sec.items} layout={sec.layout} />}
        </section>
      ))}

      <BottomBanners banners={banners} />
    </div>
  );
}
