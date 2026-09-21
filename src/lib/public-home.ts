import type { AdCard } from '@/lib/data';
import type { HeroSlide } from '@/components/commerce/commerce-hero';
import { adPriceLabel, compactAdTitle } from '@/lib/ad-presentation';
import { PLACEHOLDER } from '@/lib/media';

/** Presentation only. Input is the existing eligible public homepage feed. */
export function publicHomeHero(ads: AdCard[], title: string, subtitle: string, browseHref = '/search'): HeroSlide[] {
  const live = ads.filter(ad => Number.isSafeInteger(ad.id) && ad.id > 0 && typeof ad.title === 'string' && ad.title.trim()).slice(0, 2);
  const image = (ad?: AdCard) => ad?.image && ad.image !== PLACEHOLDER ? ad.image : null;
  return [
    { id: 'trbhh-market', title, subtitle, image: image(live[0]), href: browseHref, cta: 'تصفح السوق', eyebrow: 'سوق سعودي · تواصل مباشر' },
    ...live.map(ad => ({ id: `ad-${ad.id}`, title: compactAdTitle(ad.title), subtitle: adPriceLabel(ad), image: image(ad), href: `/ads/${ad.id}`, cta: 'عرض الإعلان', eyebrow: [ad.adsType === 'request' ? 'مطلوب في السوق' : ad.special ? 'إعلان مميز' : 'من إعلانات السوق', ad.cityName].filter(Boolean).join(' · ') })),
  ];
}
