import Link from 'next/link';
import { CommerceHero, type HeroSlide } from '@/components/commerce/commerce-hero';
import { CommerceGrid, CommerceSpotlight, CommerceCarousel, type CommerceCardItem } from '@/components/commerce/catalog';
import { composeHome, type HomeSectionInput, type ComposeHomeOptions, type HomeSectionAccent } from '@/lib/commerce/home-layout';

/**
 * تركيب الصفحة الرئيسية التجارية الديناميكي (كحلي/ذهبي، RTL) — بمستوى متجر حقيقي:
 *   • Hero متحرّك غنيّ بالصور أعلى الصفحة (يُخفى إن لا شرائح)،
 *   • أقسام مدفوعة بالبيانات بأشكال متنوّعة (شبكة/Spotlight/صفّ أفقي)،
 *   • عنوان كل قسم بطابع لوني مميّز (ذهبي/كحلي/برتقالي) ليتمايز الموردون عن
 *     البائعين الموثوقين عن عروض الأعضاء،
 *   • بانر إعلاني حقيقي (تدرّج + دعوة إجراء) بين الصفوف — لا مساحات فارغة،
 *   • القسم الفارغ لا يُصيَّر إطلاقاً (لا عنوان معلّق).
 */

export type CommerceHomeSection = HomeSectionInput<CommerceCardItem> & { subtitle?: string };

/** بانر ترويجي حقيقي (موسمي/عرض محدود/مورّد) — تدرّج كحلي↔ذهبي + دعوة إجراء. */
export type CommerceBanner = {
  title: string;
  subtitle?: string;
  cta?: string;
  href?: string;
  /** طابع: gold (موسمي) · orange (عرض محدود) · navy (مورّد/فئة). */
  tone?: 'gold' | 'orange' | 'navy';
};

// بانرات فاتحة (تقليل اللون الغامق): خلفية كريمية/فاتحة، نصّ كحلي، لمسة ذهبية.
const BANNER_TONE: Record<NonNullable<CommerceBanner['tone']>, { bg: string; ring: string; glow: string; tag: string }> = {
  gold: { bg: 'from-[#fff8ea] to-[#fbe6bd]', ring: 'ring-[#f0b429]/40', glow: 'bg-[#f0b429]/30', tag: 'bg-[#16294a] text-[#f0b429]' },
  orange: { bg: 'from-[#fff2e6] to-[#ffdcc0]', ring: 'ring-[#ff7418]/30', glow: 'bg-[#ff7418]/25', tag: 'bg-[#ff7418] text-white' },
  navy: { bg: 'from-[#eef3fb] to-[#d8e4f6]', ring: 'ring-[#16294a]/15', glow: 'bg-[#233a63]/20', tag: 'bg-[#16294a] text-white' },
};

function PromoBanner({ banner }: { banner: CommerceBanner }) {
  const tone = BANNER_TONE[banner.tone ?? 'gold'];
  const body = (
    <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-l ${tone.bg} p-6 text-[#16294a] shadow-md ring-1 ${tone.ring} sm:p-8`}>
      {/* توهّج زخرفي فاتح */}
      <span aria-hidden="true" className={`pointer-events-none absolute -left-10 -top-16 h-48 w-48 rounded-full ${tone.glow} blur-3xl`} />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-lg">
          <div className={`mb-1.5 inline-block rounded-full px-3 py-0.5 text-[11px] font-extrabold ${tone.tag}`}>عرض</div>
          <h3 className="text-xl font-extrabold leading-snug sm:text-2xl">{banner.title}</h3>
          {banner.subtitle && <p className="mt-1 text-sm font-semibold text-[#16294a]/65">{banner.subtitle}</p>}
        </div>
        {banner.cta && (
          <span className="inline-flex items-center rounded-xl bg-gradient-to-l from-[#ff7418] to-[#f0b429] px-6 py-3 text-sm font-extrabold text-[#16294a] shadow-md">
            {banner.cta}
          </span>
        )}
      </div>
    </div>
  );
  return banner.href ? <Link href={banner.href} className="block transition hover:brightness-[1.02]">{body}</Link> : body;
}

/** فاصل ذهبي رفيع بين الأقسام. */
function Divider() {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#f0b429]/60 to-transparent" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#f0b429]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#f0b429]/60 to-transparent" />
    </div>
  );
}

const ACCENT_BAR: Record<HomeSectionAccent, string> = {
  gold: 'from-[#ff7418] to-[#f0b429]',
  navy: 'from-[#233a63] to-[#16294a]',
  orange: 'from-[#ff7418] to-[#ff9a4d]',
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

export function CommerceHome({
  hero = [],
  sections,
  options,
  banners,
}: {
  hero?: HeroSlide[];
  sections: CommerceHomeSection[];
  options?: ComposeHomeOptions;
  /** بانرات ترويجية حقيقية تُدرَج في خانات الإعلان بالترتيب (تدوير عند النفاد). */
  banners?: CommerceBanner[];
}) {
  const composed = composeHome(sections, options);
  const subtitleOf = new Map(sections.map((s) => [s.id, s.subtitle]));
  const promos = banners && banners.length > 0 ? banners : null;
  let adIdx = 0;

  return (
    // نطاق الثيم التجاري (كحلي/ذهبي) — معزول عن ثيم الموقع العام
    <div className="commerce-scope space-y-7">
      {hero.length > 0 && <CommerceHero slides={hero} />}

      {composed.map((sec) => {
        const showAd = sec.adSlotAfter && promos;
        const banner = showAd ? promos[adIdx++ % promos.length] : null;
        return (
          <section key={sec.id} className="space-y-4">
            {sec.dividerBefore && <Divider />}
            <SectionHeader title={sec.title} subtitle={subtitleOf.get(sec.id)} accent={sec.accent} />
            {sec.display === 'spotlight' && <CommerceSpotlight items={sec.items} />}
            {sec.display === 'carousel' && <CommerceCarousel items={sec.items} />}
            {sec.display === 'grid' && <CommerceGrid items={sec.items} layout={sec.layout} />}
            {banner && <PromoBanner banner={banner} />}
          </section>
        );
      })}
    </div>
  );
}
