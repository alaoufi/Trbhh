import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({
  findMany: vi.fn(),
  getSetting: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({ prisma: { ads: { findMany: state.findMany } } }));
vi.mock('@/lib/redis', () => ({ cached: vi.fn((_key: string, _ttl: number, fn: () => unknown) => fn()) }));
vi.mock('@/lib/saved-search', () => ({ searchSuggestEnabled: vi.fn(async () => true) }));
vi.mock('@/lib/settings', () => ({ getSetting: state.getSetting }));

import { GET } from '@/app/api/search/suggest/route';

describe('search suggestion synonyms', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.findMany.mockResolvedValue([{ title: 'هاتف جديد' }]);
    state.getSetting.mockImplementation(async (key: string, fallback: string) =>
      key === 'search_synonyms' ? 'جوال, موبايل, هاتف' : fallback);
  });

  it('uses the admin dictionary while keeping suggestions bounded', async () => {
    const response = await GET(new NextRequest('https://trbhh.sa/api/search/suggest?q=جوال'));
    expect(await response.json()).toEqual({ items: ['هاتف جديد'] });
    const where = state.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      { title: { contains: 'جوال' } },
      { title: { contains: 'موبايل' } },
      { title: { contains: 'هاتف' } },
    ]));
    expect(state.findMany.mock.calls[0][0].take).toBeLessThanOrEqual(30);
  });
});
