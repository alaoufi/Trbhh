import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { isNationalDayCampaignActive } from '@/lib/national-day';
import { NationalDayBanner, NationalDayHeroFrame } from '@/components/national-day-banner';

describe('2026 National Day campaign window in Riyadh', () => {
  it.each([
    ['2026-09-20T20:59:59.999Z', false],
    ['2026-09-20T21:00:00.000Z', true],
    ['2026-09-21T00:00:00+03:00', true],
    ['2026-09-23T12:00:00+03:00', true],
    ['2026-09-24T23:59:59.999+03:00', true],
    ['2026-09-24T21:00:00.000Z', false],
    ['2026-09-25T00:00:00+03:00', false],
    ['2027-09-23T12:00:00+03:00', false],
  ])('at %s it is active=%s', (timestamp, active) => {
    expect(isNationalDayCampaignActive(Date.parse(timestamp))).toBe(active);
  });

  it.each([NaN, Infinity, -Infinity])('does not activate for an invalid timestamp %s', value => {
    expect(isNationalDayCampaignActive(value)).toBe(false);
  });
});

describe('inline public-home campaign presentation', () => {
  it('shows the reused greeting with working marketplace links and no blocking overlay', () => {
    const html = renderToStaticMarkup(createElement(NationalDayBanner));
    expect(html).toContain('دام عزك يا وطن');
    expect(html).toContain('اليوم الوطني السعودي');
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/ads/new"');
    expect(html).not.toContain('/shop');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-modal');
    expect(html).not.toContain('fixed');
    expect(html).not.toContain('خصم');
  });

  it('keeps the usual hero unchanged outside the campaign', () => {
    const child = createElement('section', {}, 'Existing hero');
    expect(renderToStaticMarkup(createElement(NationalDayHeroFrame, { active: false }, child)))
      .toBe(renderToStaticMarkup(child));
  });

  it('adds only a scoped frame during the campaign and preserves its child', () => {
    const html = renderToStaticMarkup(createElement(NationalDayHeroFrame, { active: true }, createElement('section', {}, 'Existing hero')));
    expect(html).toContain('data-national-day-hero="true"');
    expect(html).toContain('<section>Existing hero</section>');
  });
});
