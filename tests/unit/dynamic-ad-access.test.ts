import { describe, expect, it } from 'vitest';
import { canUseSmartAdsLab } from '@/lib/dynamic-ads/access';

describe('smart ads lab access', () => {
  it('remains closed while the feature flag is off', () => {
    expect(canUseSmartAdsLab({ enabled: false, authorised: true })).toBe(false);
  });

  it('requires an authorised administrator even when enabled', () => {
    expect(canUseSmartAdsLab({ enabled: true, authorised: false })).toBe(false);
    expect(canUseSmartAdsLab({ enabled: true, authorised: true })).toBe(true);
  });
});
