import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeMarketHub, type HomeMarketHubProps } from '@/components/home-market-hub';
import type { AdCard } from '@/lib/data';

Object.assign(globalThis, { React });
const ad = (id: number): AdCard => ({ id, title: `إعلان المصدر ${id}`, price: 1200, adsType: 'sale', image: '/placeholder.svg', cityName: null, categoryName: null, createdAt: null, special: false, urgent: false, views: 0, sellerName: null, sellerTrusted: false });
const props: HomeMarketHubProps = {
  opportunities: [{ categoryId: 1, categoryName: 'معدات', href: '/search?category=1', image: null }],
  categories: [{ id: 1, name: 'معدات' }], ads: [], isLoggedIn: false,
};
const render = (override: Partial<HomeMarketHubProps> = {}) => renderToStaticMarkup(React.createElement(HomeMarketHub, { ...props, ...override }));

describe('home market hub', () => {
  it('renders source titles and prices, honours source destinations, and limits the first group to four', () => {
    const html = render({ ads: [{ ...ad(1), href: '/companies/2/p/1' }, ad(2), ad(3), ad(4), ad(5)] });
    expect(html).toContain('إعلان المصدر 1');
    expect(html).toContain('1,200 ر.س');
    expect(html).toContain('href="/companies/2/p/1"');
    expect(html).not.toContain('إعلان المصدر 5');
    expect(html).toContain('المجموعة التالية');
    expect(html).toContain('المجموعة السابقة');
  });
  it('offers real discovery navigation when there are no ads and no empty paging controls', () => {
    const html = render();
    expect(html).toContain('تصفّح الإعلانات');
    expect(html).not.toContain('المجموعة التالية');
    expect(html).toContain('href="/search?category=1"');
    expect(html).toContain('href="/companies"');
    expect(html).toContain('href="/ads/new"');
    expect(html).toContain('href="/login"');
    expect(render({ isLoggedIn: true })).toContain('href="/account"');
  });
  it('deduplicates category opportunities and preserves non-numeric source price labels', () => {
    const html = render({ opportunities: [...props.opportunities, ...props.opportunities], ads: [{ ...ad(1), price: 0, priceType: 'som' }] });
    expect(html).toContain('على السوم');
    expect(html.match(/href="\/search\?category=1"/g)).toHaveLength(2);
    expect(html).not.toContain('المجموعة التالية');
    expect(html).not.toContain('شراء');
  });
});

