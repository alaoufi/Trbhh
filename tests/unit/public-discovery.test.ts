import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { normalizePriceRange, normalizeSearchParams, positiveSearchId } from '@/lib/search-filters';
import { adPriceLabel, compactAdTitle } from '@/lib/ad-presentation';
import { allowAutomaticPrompt, claimPromptSession, PROMPT_SESSION_KEY } from '@/lib/prompt-policy';
import { PublicSearchForm } from '@/components/public-search-form';
import { AdCard, AdCardList, AdCardShop } from '@/components/ad-card';
import type { AdCard as Card } from '@/lib/data';

vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement('img', { src, alt }) }));
const card: Card = { id: 42, title: 'شاليه للإيجار شاليه للإيجار', price: 500, priceType: 'rent', rentPeriod: 'يومي', adsType: 'offer', image: '/placeholder.png', cityName: null, categoryName: null, createdAt: null, special: false, urgent: false, views: 0, sellerName: 'المعلن', sellerTrusted: false };

describe('public price and search presentation', () => {
  it('shows the same rental amount and period in all card designs', () => {
    for (const Component of [AdCard, AdCardList, AdCardShop]) {
      const html = renderToStaticMarkup(createElement(Component, { ad: card }));
      expect(html).toContain('500 ر.س / يوم');
      expect(html).not.toContain('شاليه للإيجار شاليه للإيجار');
    }
  });
  it('does not present an unspecified amount as free or show a discount without a price', () => {
    const html = renderToStaticMarkup(createElement(AdCard, { ad: { ...card, price: 0, oldPrice: 600 } }));
    expect(html).toContain('السعر غير محدد');
    expect(html).toContain('الموقع غير محدد');
    expect(html).not.toContain('خصم');
    expect(adPriceLabel({ price: 0, priceType: 'som' })).toBe('على السوم');
  });
  it('removes only exact repeated phrases while keeping meaningful words', () => {
    expect(compactAdTitle('معدات للبيع | معدات للبيع')).toBe('معدات للبيع');
    expect(compactAdTitle('بيت كبير وبيت صغير')).toBe('بيت كبير وبيت صغير');
  });
  it('normalizes reversed ranges and rejects malformed or overflowing prices', () => {
    expect(normalizePriceRange('800', '500')).toEqual({ minPrice: 500, maxPrice: 800 });
    for (const value of ['', '-1', 'NaN', 'Infinity', '12abc', '1e10', '5000000000']) expect(normalizePriceRange(value, undefined).minPrice).toBeUndefined();
    expect(normalizePriceRange('0', '500.50')).toEqual({ minPrice: 0, maxPrice: 500.5 });
  });
  it('rejects invalid location IDs and sorts while keeping query and type', () => {
    expect(positiveSearchId('1.5')).toBeUndefined();
    expect(positiveSearchId('9999999999999999999')).toBeUndefined();
    expect(normalizeSearchParams({ q: '  شاليه  ', type: 'request', sort: 'bad', city: '-9' })).toMatchObject({ q: 'شاليه', type: 'request', sort: 'newest', cityId: undefined });
  });
});

describe('automatic invitation coordination', () => {
  it('allows one invitation per browser session and prevents simultaneous prompts', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(claimPromptSession(storage, 'welcome')).toBe(true);
    expect(claimPromptSession(storage, 'install')).toBe(false);
    expect(claimPromptSession(storage, 'location')).toBe(false);
    expect(claimPromptSession(storage, 'welcome')).toBe(true);
    expect(values.get(PROMPT_SESSION_KEY)).toBe('welcome');
  });
  it('keeps auth, publishing, detail contact and admin screens free of automatic prompts', () => {
    for (const path of ['/login', '/register', '/ads/new', '/ads/42', '/admin/settings']) expect(allowAutomaticPrompt(path)).toBe(false);
    expect(allowAutomaticPrompt('/')).toBe(true);
    expect(allowAutomaticPrompt('/search')).toBe(true);
  });
});

describe('public search form controls', () => {
  const location = {
    regions: [{ id: 1, name: 'منطقة الرياض', countryId: 1 }, { id: 2, name: 'دولة أخرى', countryId: 2 }],
    areas: [{ id: 11, name: 'الخرج', cityId: 1 }, { id: 12, name: 'الخرج', cityId: 1 }, { id: 21, name: 'مدينة خارجية', cityId: 2 }],
  };
  it('renders only Saudi locations and retains a selected duplicate city without duplicating its name', () => {
    const html = renderToStaticMarkup(createElement(PublicSearchForm, { ...location, params: { city: '1', area: '12', minPrice: '500', maxPrice: '800', special: '1' } }));
    expect(html).not.toContain('دولة أخرى');
    expect(html).not.toContain('مدينة خارجية');
    expect(html.match(/>الخرج</g)).toHaveLength(1);
    expect(html).toContain('value="12" selected=""');
    expect(html).toContain('name="special"');
    expect(html).toContain('name="minPrice"');
    expect(html).toContain('value="500"');
  });
  it('honors the admin price toggle and requires a region before exposing cities', () => {
    const html = renderToStaticMarkup(createElement(PublicSearchForm, { ...location, priceOn: false }));
    expect(html).not.toContain('name="minPrice"');
    expect(html).not.toContain('name="maxPrice"');
    expect(html).not.toContain('>الخرج<');
    expect(html).toMatch(/name="area"[^>]*disabled/);
  });
});
