import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommerceHero, type HeroSlide } from '@/components/commerce/commerce-hero';

const brand: HeroSlide = {
  id: 'brand', title: 'بيع. اشترِ. وتربح.', subtitle: 'اعرض اللي عندك، واكتشف اللي تحتاجه، وتواصل مباشرة.',
  image: null, href: '/search', cta: 'تصفح السوق', eyebrow: 'سوق سعودي · تواصل مباشر',
};

describe('CommerceHero public homepage contract', () => {
  it('can render the homepage title and its own accessible carousel label', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, { slides: [brand], headingLevel: 1, label: 'اكتشف تربح' }));
    expect(html).toContain('<h1');
    expect(html).not.toContain('<h2');
    expect(html).toContain('aria-label="اكتشف تربح"');
    expect(html).toContain('سوق سعودي · تواصل مباشر');
    expect(html).not.toContain('متوفّر في جميع مناطق المملكة');
    expect(html).toContain('href="/search"');
  });

  it('keeps the existing shop heading and label defaults', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, { slides: [{ ...brand, eyebrow: undefined }] }));
    expect(html).toContain('<h2');
    expect(html).toContain('aria-label="عروض مميّزة"');
    expect(html).toContain('متوفّر في جميع مناطق المملكة');
  });

  it('allows local advertisements to omit an unproven availability claim', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, { slides: [{ ...brand, eyebrow: '' }] }));
    expect(html).not.toContain('متوفّر في جميع مناطق المملكة');
    expect(html).not.toContain('سوق سعودي');
  });

  it('renders an informational slide without a link or marketplace call to action', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, {
      slides: [{ ...brand, href: null, cta: '', title: 'دام عزك يا وطن' }],
    }));
    expect(html).toContain('دام عزك يا وطن');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('تصفّح الآن');
    expect(html).not.toContain('تصفح السوق');
  });

  it('provides an explicit pause control only for a moving carousel', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, { slides: [brand, { ...brand, id: 'another' }] }));
    expect(html).toContain('aria-label="إيقاف الحركة"');
    expect(html).toContain('aria-label="الشريحة 2"');
    const single = renderToStaticMarkup(createElement(CommerceHero, { slides: [brand] }));
    expect(single).not.toContain('إيقاف الحركة');
    expect(single).not.toContain('aria-label="التالي"');
  });

  it('does not render an empty carousel', () => {
    expect(renderToStaticMarkup(createElement(CommerceHero, { slides: [] }))).toBe('');
  });

  it('offers a compact public-home layout without changing the default hero', () => {
    const compact = renderToStaticMarkup(createElement(CommerceHero, { slides: [brand], compact: true }));
    expect(compact).toContain('data-hero-size="compact"');
    expect(compact).toContain('min-h-[230px]');
    expect(compact).toContain('sm:min-h-[320px]');
    const regular = renderToStaticMarkup(createElement(CommerceHero, { slides: [brand] }));
    expect(regular).toContain('data-hero-size="regular"');
    expect(regular).toContain('min-h-[340px]');
  });

  it('keeps a separated banner image outside its readable caption', () => {
    const html = renderToStaticMarkup(createElement(CommerceHero, {
      slides: [{ ...brand, presentation: 'separated', image: '/national-day/leadership.webp', href: null, cta: '' }],
    }));
    expect(html).toContain('data-slide-presentation="separated"');
    expect(html).toContain('data-banner-image="true"');
    expect(html).toContain('<figcaption');
    expect(html.indexOf('data-banner-image="true"')).toBeLessThan(html.indexOf('<figcaption'));
    expect(html).not.toContain('absolute inset-0 bg-[#0b162e]/45');
  });
});
