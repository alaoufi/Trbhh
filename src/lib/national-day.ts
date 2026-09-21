import type { HeroSlide } from '@/components/commerce/commerce-hero';

/** One seasonal presentation window; Saudi Arabia uses UTC+03:00 throughout it. */
const START = Date.parse('2026-09-21T00:00:00+03:00');
const END = Date.parse('2026-09-25T00:00:00+03:00');
export const NATIONAL_DAY_HERO_INTERVAL_MS = 10_000;

export function isNationalDayCampaignActive(now = Date.now()): boolean {
  return Number.isFinite(now) && now >= START && now < END;
}

export function nationalDayHeroSlides(): HeroSlide[] {
  return [
    {
      id: 'national-leadership',
      title: 'وطنٌ نعتز به.. وقيادةٌ نخلص لها',
      subtitle: 'نجدد الولاء والانتماء لوطننا وقيادتنا، ونسأل الله أن يديم على المملكة عزها وأمنها وازدهارها.',
      image: '/national-day/leadership.webp',
      href: null,
      cta: '',
      eyebrow: 'ولاءٌ راسخ · وانتماءٌ لا يتغير',
      contentAlign: 'center',
      imageFit: 'contain',
      presentation: 'separated',
    },
    {
      id: 'national-flag',
      title: 'رايتنا شامخة.. وولاؤنا راسخ',
      subtitle: 'نفخر بتاريخنا، ونعتز بحاضرنا، ونبني مستقبلنا تحت راية التوحيد.',
      image: '/national-day/saudi-flag.svg',
      href: null,
      cta: '',
      eyebrow: 'المملكة العربية السعودية',
      contentAlign: 'center',
      imageFit: 'contain',
      presentation: 'separated',
    },
  ];
}
