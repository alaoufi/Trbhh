import { describe, expect, it } from 'vitest';
import { publicStoreWhere, storeSubscriptionState } from '@/lib/store-subscription-access';

const now = new Date('2026-09-10T12:00:00Z');
const pricing = { enabled: true, graceDays: 3 };

describe('effective public store visibility', () => {
  it('expires visibility only after the configured subscription grace period', () => {
    expect(storeSubscriptionState(new Date('2026-09-07T12:00:00Z'), pricing, now)).toBe('grace');
    expect(storeSubscriptionState(new Date('2026-09-07T11:59:59Z'), pricing, now)).toBe('suspended');
    expect(publicStoreWhere(pricing, now)).toEqual({ status: 1, OR: [{ sub_until: null }, { sub_until: { gte: new Date('2026-09-07T12:00:00Z') } }] });
  });

  it('honors the existing no-subscription and disabled enforcement semantics', () => {
    expect(storeSubscriptionState(null, pricing, now)).toBe('none');
    expect(storeSubscriptionState(new Date('2022-01-01'), { ...pricing, enabled: false }, now)).toBe('off');
    expect(publicStoreWhere({ ...pricing, enabled: false }, now)).toEqual({ status: 1 });
  });
});
