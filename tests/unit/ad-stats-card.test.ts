import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AdStatsCard } from '@/components/ad-stats-card';

Object.assign(globalThis, { React });
const stats = {
  views: 605, contacts: 9, messages: 0, expiresAt: '2022-01-01T00:00:00Z',
  createdAt: '2022-01-01T00:00:00Z', favorites: 4,
  periods: { '7d': { views: 39, contacts: 2 }, '30d': { views: 134, contacts: 6 }, all: { views: 605, contacts: 9 } },
};

describe('account ad stats presentation', () => {
  it('initially renders the selected seven-day values instead of lifetime totals', () => {
    const html = renderToStaticMarkup(React.createElement(AdStatsCard, { stats }));
    expect(html).toContain('>39<');
    expect(html).not.toContain('>605<');
    expect(html).toContain('المفضلة الحالية');
    expect(html).not.toContain('رسائل');
  });

  it('never treats a legacy featured-until field as the ad expiration date', () => {
    const html = renderToStaticMarkup(React.createElement(AdStatsCard, { stats }));
    expect(html).not.toContain('ينتهي:');
    expect(html).not.toContain('Invalid Date');
  });
});
