import { describe, expect, it, vi } from 'vitest';
const cards = [{ id: 1991, title: 'أثاث', price: 20, adsType: 'sale', image: '/ad.jpg', createdAt: null, views: 699, cityName: 'الرياض', sellerName: 'محمد', sellerTrusted: true }];
const db = vi.hoisted(() => ({ favorites: { findMany: vi.fn(), count: vi.fn(async () => 5) }, ads: { findMany: vi.fn(async () => [{ id: 1991n, title: 'أثاث', price: 20, adsType: 'sale', created_at: null }]) }, photos: { findMany: vi.fn(async () => []) } }));
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/lib/profiles', () => ({ getActiveProfile: async () => ({ type: 'personal', id: 9, isDefault: true }) }));
vi.mock('@/lib/data', () => ({ getAdsByIdsCards: vi.fn(async () => cards) }));
import { getMyFavorites, getMyIdentityFavCount } from '@/lib/account';
import { getAdsByIdsCards } from '@/lib/data';

describe('favorite card data', () => {
  it('uses the full public card projection, without limiting favorites to four comparison slots', async () => {
    db.favorites.findMany.mockResolvedValue([1991, 1989, 1990, 1988, 1987].map((id) => ({ ads_id: BigInt(id) })));
    expect(await getMyFavorites(3)).toEqual(cards);
    expect(await getMyIdentityFavCount(3)).toBe(cards.length);
    expect(getAdsByIdsCards).toHaveBeenCalledWith([1991, 1989, 1990, 1988, 1987], 0);
  });
});
