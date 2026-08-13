import { describe, expect, it } from 'vitest';
import { platformAdPublicWhere } from '@/lib/platform-ad-visibility';

describe('public ad visibility entitlement', () => {
  it('preserves legacy public-general-ad visibility while enforcement is disabled', () => {
    expect(platformAdPublicWhere(new Date('2026-08-13T12:00:00.000Z'), false)).toEqual({
      status: 1,
      state: 'active',
      AND: [{ OR: [{ store_only: 0 }, { trbhh_until: { gt: new Date('2026-08-13T12:00:00.000Z') } }] }],
    });
  });

  it('requires a future entitlement for every public ad while enforcement is enabled', () => {
    expect(platformAdPublicWhere(new Date('2026-08-13T12:00:00.000Z'), true)).toEqual({
      status: 1,
      state: 'active',
      trbhh_until: { gt: new Date('2026-08-13T12:00:00.000Z') },
    });
  });
});
