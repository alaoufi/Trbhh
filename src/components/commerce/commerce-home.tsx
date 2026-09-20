import { CommerceHero, type HeroSlide } from '@/components/commerce/commerce-hero';
import { CommerceGrid, type CommerceCardItem } from '@/components/commerce/catalog';
import { composeHome, type HomeSectionInput, type ComposeHomeOptions } from '@/lib/commerce/home-layout';

/**
 * تركيب الصفحة الرئيسية التجارية الديناميكي (كحلي/ذهبي، RTL):
 *   • Hero متحرّك أعلى الصفحة (يُخفى إن لا شرائح)،
 *   • أقسام مدفوعة بالبيانات: الفارغ منها لا يُصيَّر إطلاقاً (لا عنوان معلّق)،
 *   • فاصل ذهبي قبل كل قسم، وخانة إعلان ديناميكية كل N أقسام،
 *   • تخطيط كل قسم يتغيّر تلقائيّاً حسب عدد منتجاته (محرّك home-layout).
 * لا HTML خام: العناوين نصّ صِرف. القسم بلا عناصر يختفي كليّاً.
 */

export type CommerceHomeSection = HomeSectionInput<CommerceCardItem> & { subtitle?: string };

function AdSlot() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[#f0b429]/50 bg-[#f0b429]/5 px-4 py-6 text-center">
      <div className="text-sm font-extrabold text-[#16294a]">مساحة إعلانية</div>
      <div className="mt-0.5 text-xs text-[#16294a]/60">تظهر هنا الإعلانات الديناميكية المفعّلة من الإدارة.</div>
    </div>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#f0b429]/60 to-transparent" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#f0b429]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent via-[#f0b429]/60 to-transparent" />
    </div>
  );
}

export function CommerceHome({
  hero = [],
  sections,
  options,
  adSlot,
}: {
  hero?: HeroSlide[];
  sections: CommerceHomeSection[];
  options?: ComposeHomeOptions;
  /** عقدة إعلان مخصّصة تُعرض في خانات الإعلان — الافتراضي مساحة إعلانية أنيقة. */
  adSlot?: React.ReactNode;
}) {
  const composed = composeHome(sections, options);
  const subtitleOf = new Map(sections.map((s) => [s.id, s.subtitle]));

  return (
    // نطاق الثيم التجاري (كحلي/ذهبي) — معزول عن ثيم الموقع العام
    <div className="commerce-scope space-y-6">
      {hero.length > 0 && <CommerceHero slides={hero} />}

      {composed.map((sec) => (
        <div key={sec.id} className="space-y-3">
          {sec.dividerBefore && <Divider />}
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#16294a]">
              <span className="inline-block h-5 w-1.5 rounded-full bg-gradient-to-b from-[#ff7418] to-[#f0b429]" />
              {sec.title}
            </h2>
            {subtitleOf.get(sec.id) && <span className="text-xs font-bold text-[#16294a]/60">{subtitleOf.get(sec.id)}</span>}
          </div>
          <CommerceGrid items={sec.items} layout={sec.layout} />
          {sec.adSlotAfter && (adSlot ?? <AdSlot />)}
        </div>
      ))}
    </div>
  );
}
