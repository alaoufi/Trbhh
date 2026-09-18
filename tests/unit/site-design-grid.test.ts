import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import * as cards from '@/components/ad-card';
import type { AdCard } from '@/lib/data';
const state = vi.hoisted(() => ({ design: 'v2', enabled: true }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: state.design }) }) }));
vi.mock('@/lib/site-design-server', () => ({ getSiteDesignConfig: async () => ({ enabled: state.enabled, label: 'V2', description: '' }) }));
vi.mock('next/image', () => ({ default: ({ src, alt }: {
        src: string;
        alt: string;
    }) => createElement('img', { src, alt }) }));
const ad: AdCard = { id: 42, title: 'نص الإعلان الأصلي', price: 9500, priceType: 'rent', rentPeriod: 'شهري', adsType: 'offer', image: '/media/uploads/original.jpg', cityName: 'الرياض', categoryName: null, createdAt: '2026-09-19T10:00:00.000Z', special: false, urgent: false, views: 0, sellerName: null, sellerTrusted: false };
it('renders original public data and rental price without invented seller or verification', () => {
    expect(cards).toHaveProperty('AdCardV2');
    const Component = (cards as typeof cards & {
        AdCardV2: typeof cards.AdCard;
    }).AdCardV2;
    const html = renderToStaticMarkup(createElement(Component, { ad }));
    for (const text of ['href="/ads/42"', ad.title, ad.image, '9,500 ر.س / شهر', 'الرياض'])
        expect(html).toContain(text);
    expect(html).not.toMatch(/موثق|تقييم|مميز|مشاهدة/);
    expect(renderToStaticMarkup(createElement(Component, { ad: { ...ad, price: 0, priceType: 'som' } }))).toContain('على السوم');
});
it('preserves actual premium, seller, store and discount metadata', () => {
    const html = renderToStaticMarkup(createElement(cards.AdCardV2, { ad: {
        ...ad, special: true, urgent: true, tier: 'gold', sellerName: 'معلن حقيقي', sellerTrusted: true,
        storeName: 'متجر فعلي', price: 500, oldPrice: 1000,
    } }));
    for (const text of ['إعلان ذهبي مميّز', 'عاجل', 'معلن حقيقي', 'موثق', 'متجر فعلي', '1,000', 'خصم 50٪']) expect(html).toContain(text);
    const silver = renderToStaticMarkup(createElement(cards.AdCardV2, { ad: { ...ad, tier: 'silver' } }));
    expect(silver).toContain('إعلان فضي مميّز');
    const special = renderToStaticMarkup(createElement(cards.AdCardV2, { ad: { ...ad, special: true } }));
    expect(special).toContain('إعلان مميّز');
    const noPrice = renderToStaticMarkup(createElement(cards.AdCardV2, { ad: { ...ad, price: 0, oldPrice: 1000 } }));
    expect(noPrice).not.toContain('خصم');
});
it('server grid only uses V2 when enabled and keeps legacy rendering', async () => {
    state.enabled = true;
    state.design = 'v2';
    expect(renderToStaticMarkup(await cards.AdGrid({ ads: [ad] }))).toContain('ad-card-v2');
    state.enabled = false;
    expect(renderToStaticMarkup(await cards.AdGrid({ ads: [ad] }))).not.toContain('ad-card-v2');
    state.design = 'shop';
    expect(renderToStaticMarkup(await cards.AdGrid({ ads: [ad] }))).toContain('aspect-square');
    state.design = 'unknown';
    expect(renderToStaticMarkup(await cards.AdGrid({ ads: [ad] }))).not.toContain('ad-card-v2');
});
