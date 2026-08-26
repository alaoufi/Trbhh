import { describe, expect, it } from 'vitest';
import { isInternalNavigationUrl } from '@/lib/navigation-progress';

describe('isInternalNavigationUrl', () => {
  const current = 'https://trbhh.sa/account/wallet';

  it('starts progress for a different internal page', () => {
    expect(isInternalNavigationUrl('/search?q=سيارة', current)).toBe(true);
  });

  it('does not start progress for external, hash-only, or unchanged links', () => {
    expect(isInternalNavigationUrl('https://example.com', current)).toBe(false);
    expect(isInternalNavigationUrl('#top', current)).toBe(false);
    expect(isInternalNavigationUrl('/account/wallet', current)).toBe(false);
  });
});
