import { describe, expect, it } from 'vitest';
import { isSaudiShippingArea } from '@/lib/commerce/shipping';
describe('Saudi region then city server boundary', () => {
  it('requires selected area parent and Saudi country, not just an existing city pair', () => {
    const area = { city_id: 1 }, region = { id: 1n, country_id: 2 }, country = { id: 2, name: 'السعودية', key: '966' };
    expect(isSaudiShippingArea(area, region, country)).toBe(true);
    expect(isSaudiShippingArea(area, region, { id: 2, name: 'دولة أخرى', key: '1' })).toBe(false);
    expect(isSaudiShippingArea({ city_id: 9 }, region, country)).toBe(false);
    expect(isSaudiShippingArea(area, region, { ...country, id: 3 })).toBe(false);
    expect(isSaudiShippingArea(area, null, country)).toBe(false);
  });
});
