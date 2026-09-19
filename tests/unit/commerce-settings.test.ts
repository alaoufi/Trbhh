import { describe, expect, it, vi } from 'vitest';
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: { site_settings: { findMany } } }));
import { getCommerceConfig } from '@/lib/commerce/settings';

describe('strict commerce configuration reads', () => {
  it('propagates database unavailability, never substitutes enabled defaults', async () => {
    findMany.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(getCommerceConfig()).rejects.toThrow('database unavailable');
  });
  it('observes a disabled switch on the next call without a cached enabled policy', async () => {
    findMany.mockResolvedValueOnce([{ k: 'commerce_enabled', v: '1' }]);
    expect((await getCommerceConfig()).enabled).toBe(true);
    findMany.mockResolvedValueOnce([{ k: 'commerce_enabled', v: '0' }]);
    expect((await getCommerceConfig()).enabled).toBe(false);
  });
});
