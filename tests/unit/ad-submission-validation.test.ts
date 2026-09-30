import { describe, expect, it, vi } from 'vitest';
import { normalizeAdPriceDetails, normalizeLegacyListingSubmission, normalizeSaudiLocation } from '@/lib/ads/submission-validation';
import type { NormalizedListingSubmission } from '@/lib/ad-categories/listing-policy';

const fixedSale = (price: number): NormalizedListingSubmission => ({
  listingType: 'sale',
  adsType: 'offer',
  priceType: 'sale',
  rentPeriod: null,
  price,
});

describe('ad price submission validation', () => {
  it('accepts a valid old price and computes the discount only on the server', () => {
    expect(normalizeAdPriceDetails(fixedSale(800), '1000', true)).toEqual({
      oldPrice: 1000,
      discountPercent: 20,
      warning: null,
    });
  });

  it('rejects malformed old prices and a claimed discount that is not real', () => {
    expect(() => normalizeAdPriceDetails(fixedSale(800), '-1', true)).toThrow('السعر السابق غير صالح');
    expect(() => normalizeAdPriceDetails(fixedSale(800), '800', true)).toThrow('أكبر من السعر الحالي');
    expect(() => normalizeAdPriceDetails(fixedSale(800), '700', true)).toThrow('أكبر من السعر الحالي');
    expect(() => normalizeAdPriceDetails(fixedSale(800), '900.001', true)).toThrow('السعر السابق غير صالح');
  });

  it('drops an old price for bidding, requests, disabled goods, or a zero current price', () => {
    expect(normalizeAdPriceDetails({ ...fixedSale(0), priceType: 'som' }, '999', true).oldPrice).toBe(0);
    expect(normalizeAdPriceDetails({ ...fixedSale(400), adsType: 'request', priceType: null }, '999', true).oldPrice).toBe(0);
    expect(normalizeAdPriceDetails(fixedSale(400), '999', false).oldPrice).toBe(0);
    expect(normalizeAdPriceDetails(fixedSale(0), '999', true).oldPrice).toBe(0);
  });

  it('flags an extreme discount for review without rejecting a potentially real price', () => {
    expect(normalizeAdPriceDetails(fixedSale(68), '800', true)).toMatchObject({
      oldPrice: 800,
      discountPercent: 92,
      warning: 'suspicious_discount',
    });
  });

  it('keeps the legacy fallback strict when taxonomy is disabled', () => {
    expect(normalizeLegacyListingSubmission({ adsType: 'offer', priceType: 'rent', rentPeriod: 'شهري', price: '1200.50' })).toMatchObject({
      listingType: 'rent', priceType: 'rent', rentPeriod: 'شهري', price: 1200.5,
    });
    expect(() => normalizeLegacyListingSubmission({ adsType: 'offer', priceType: 'sale', price: '1e3' })).toThrow('السعر غير صالح');
    expect(() => normalizeLegacyListingSubmission({ adsType: 'offer', priceType: 'sale', price: '0' })).toThrow('أكبر من صفر');
    expect(normalizeLegacyListingSubmission({ adsType: 'offer', priceType: 'som', price: '500' }).price).toBe(0);
  });
});

describe('Saudi region and city validation', () => {
  const lookup = {
    regionExists: vi.fn(async (regionId: number, countryId: number) => regionId === 1 && countryId === 1),
    cityBelongs: vi.fn(async (cityId: number, regionId: number) => cityId === 101 && regionId === 1),
  };

  it('allows an omitted optional location without a database lookup', async () => {
    lookup.regionExists.mockClear();
    lookup.cityBelongs.mockClear();
    await expect(normalizeSaudiLocation({}, lookup)).resolves.toBeNull();
    expect(lookup.regionExists).not.toHaveBeenCalled();
    expect(lookup.cityBelongs).not.toHaveBeenCalled();
  });

  it('requires both region and city once either is supplied', async () => {
    await expect(normalizeSaudiLocation({ regionId: '1' }, lookup)).rejects.toThrow('اختر المدينة');
    await expect(normalizeSaudiLocation({ cityId: '101' }, lookup)).rejects.toThrow('اختر المنطقة');
  });

  it('rejects a city outside the chosen Saudi region', async () => {
    await expect(normalizeSaudiLocation({ countryId: '1', regionId: '1', cityId: '999' }, lookup)).rejects.toThrow('لا تتبع المنطقة');
    await expect(normalizeSaudiLocation({ countryId: '2', regionId: '1', cityId: '101' }, lookup)).rejects.toThrow('المنطقة غير صالحة');
  });

  it('returns canonical numeric ids for a valid hierarchy', async () => {
    await expect(normalizeSaudiLocation({ countryId: '1', regionId: '1', cityId: '101' }, lookup)).resolves.toEqual({
      countryId: 1,
      regionId: 1,
      cityId: 101,
    });
  });
});
