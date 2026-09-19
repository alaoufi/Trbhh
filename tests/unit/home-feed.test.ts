import { describe, expect, it } from 'vitest';
import { mergeHomeAds } from '@/lib/home-feed';

describe('continuous home feed', () => {
  it('places featured first and removes duplicates without mutating sources', () => {
    const featured = [{ id: 2 }, { id: 1 }];
    const latest = [{ id: 3 }, { id: 2 }, { id: 4 }];
    expect(mergeHomeAds(featured, latest).map(ad => ad.id)).toEqual([2, 1, 3, 4]);
    expect(latest.map(ad => ad.id)).toEqual([3, 2, 4]);
  });
  it('handles empty groups without placeholder entries', () => {
    expect(mergeHomeAds([], [{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(mergeHomeAds([], [])).toEqual([]);
  });
});
