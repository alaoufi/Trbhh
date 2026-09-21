import type { HeroSlide } from '@/components/commerce/commerce-hero';

/** One seasonal presentation window; Saudi Arabia uses UTC+03:00 throughout it. */
const START = Date.parse('2026-09-21T00:00:00+03:00');
const END = Date.parse('2026-09-25T00:00:00+03:00');

export function isNationalDayCampaignActive(now = Date.now()): boolean {
  return Number.isFinite(now) && now >= START && now < END;
}

export function nationalDayHeroSlides(href: string): HeroSlide[] {
  return [
    {
      id: 'national-leadership',
      title: 'قيادة وطن.. وطموح شعب',
      subtitle: 'خادم الحرمين الشريفين الملك سلمان وسمو ولي العهد الأمير محمد بن سلمان.',
      image: '/national-day/leadership.webp',
      href,
      cta: 'اكتشف السوق',
      eyebrow: 'اليوم الوطني السعودي',
      contentAlign: 'center',
    },
    {
      id: 'national-flag',
      title: 'دام عزك يا وطن',
      subtitle: 'رايتنا خضراء.. وعزّنا يمتد من جيل إلى جيل.',
      image: '/national-day/saudi-flag.svg',
      href,
      cta: 'تصفح السوق',
      eyebrow: 'المملكة العربية السعودية',
      contentAlign: 'center',
      imageFit: 'contain',
    },
  ];
}
