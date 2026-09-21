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
});
