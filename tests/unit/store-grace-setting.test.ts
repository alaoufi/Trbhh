import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/prisma', () => ({ prisma: { site_settings: { findMany: async () => [{ k: 'sub_grace_days', v: '0' }] } } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
import { getStoreSubPricing, SETTING_SUB_GRACE_DAYS } from '@/lib/settings';

describe('configured subscription grace', () => {
  it('honors an explicit zero-day grace instead of silently applying ten days', async () => {
    expect(SETTING_SUB_GRACE_DAYS).toBe('sub_grace_days');
    expect((await getStoreSubPricing()).graceDays).toBe(0);
  });
});
