import { describe, expect, it } from 'vitest';
import { primaryOrigin, redirectLegacyApex } from '@/lib/public-origin';

describe('public origin', () => {
  it('makes trbhh.sa the primary origin', () => {
    expect(primaryOrigin).toBe('https://trbhh.sa');
  });

  it('redirects only the .com apex to the matching Saudi URL', () => {
    expect(redirectLegacyApex('trbhh.com', '/ads/22', '?source=old')).toBe('https://trbhh.sa/ads/22?source=old');
    expect(redirectLegacyApex('store.trbhh.com', '/', '')).toBeNull();
  });
});
