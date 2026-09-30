import { describe, expect, it } from 'vitest';
import { safeDealDiscount } from '@/lib/ads/deals';

describe('deal pricing safety', () => {
  it('derives a valid discount server-side', () => {
    expect(safeDealDiscount({ currentPrice: 800, oldPrice: 1000, adsType: 'offer', priceType: 'sale' })).toBe(20);
    expect(safeDealDiscount({ currentPrice: 800, oldPrice: 1000, adsType: 'offer', priceType: 'rent' })).toBe(20);
  });

  it('excludes requests, bidding and invalid old-price claims', () => {
    expect(safeDealDiscount({ currentPrice: 800, oldPrice: 1000, adsType: 'request', priceType: null })).toBeNull();
    expect(safeDealDiscount({ currentPrice: 0, oldPrice: 1000, adsType: 'offer', priceType: 'som' })).toBeNull();
    expect(safeDealDiscount({ currentPrice: 1000, oldPrice: 800, adsType: 'offer', priceType: 'sale' })).toBeNull();
  });

  it('keeps extreme legacy discounts out of the trusted deals page', () => {
    expect(safeDealDiscount({ currentPrice: 68, oldPrice: 800, adsType: 'offer', priceType: 'rent' })).toBeNull();
    expect(safeDealDiscount({ currentPrice: 200, oldPrice: 1000, adsType: 'offer', priceType: 'sale' })).toBeNull();
  });
});
