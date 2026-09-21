import { describe, expect, it } from 'vitest';
import type { AdCard } from '@/lib/data';
import { publicHomeHero } from '@/lib/public-home';
import { adPriceLabel } from '@/lib/ad-presentation';

const ad: AdCard = { id: 12, title: 'رافعة للإيجار', price: 4000, priceType: 'rent', rentPeriod: 'month', adsType: 'offer', image: '/media/lift.webp', cityName: 'الرياض', categoryName: 'معدات', createdAt: null, special: false, urgent: false, views: 0, sellerName: null, sellerTrusted: false };
describe('public marketplace hero', () => {
  it('always provides the brand and a working search link without publishing any product', () => {
    expect(publicHomeHero([], 'بيع. اشترِ. وتربح.', 'تواصل مباشرة.')).toEqual([{ id: 'trbhh-market', title: 'بيع. اشترِ. وتربح.', subtitle: 'تواصل مباشرة.', image: null, href: '/search', cta: 'تصفح السوق', eyebrow: 'سوق سعودي · تواصل مباشر' }]);
  });
  it('preserves public ad links, rental pricing and the selected category browse target', () => {
    const slides = publicHomeHero([ad], 'تربح', 'سوقك', '/search?category=90');
    expect(slides[0].href).toBe('/search?category=90');
    expect(slides[1]).toMatchObject({ href: '/ads/12', subtitle: adPriceLabel(ad), eyebrow: 'من إعلانات السوق · الرياض' });
    expect(slides.every(slide => slide.href === null || !slide.href.startsWith('/shop'))).toBe(true);
  });
  it('does not leak disabled prices or mislabel requests or paid promotion', () => {
    const request = { ...ad, adsType: 'request', priceEnabled: false };
    const slide = publicHomeHero([request], '', '')[1];
    expect(slide.subtitle).toBe(adPriceLabel(request));
    expect(slide.subtitle).not.toContain('4,000');
    expect(slide.eyebrow).toBe('مطلوب في السوق · الرياض');
    expect(publicHomeHero([{ ...ad, special: true }], '', '')[1].eyebrow).toContain('إعلان مميز');
  });
  it('bounds rotating ad slides without dropping any data from the input feed', () => {
    const ads = Array.from({ length: 24 }, (_, i) => ({ ...ad, id: i + 1 }));
    expect(publicHomeHero(ads, '', '')).toHaveLength(3);
    expect(ads).toHaveLength(24);
  });
});
