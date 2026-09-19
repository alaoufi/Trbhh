import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient, type Prisma } from '@prisma/client';
import { searchCardVisibility } from '@/lib/search-card-visibility';
import { platformAdPublicWhere } from '@/lib/platform-ad-visibility';

// Explicit opt-in; never reads DATABASE_URL or dotenv. All fixture changes roll back.
const enabled = process.env.SEARCH_VISIBILITY_MYSQL === '1';
const db = enabled ? new PrismaClient({ datasourceUrl: 'mysql://root:local_disposable_root_only@127.0.0.1:33309/trbhh_commerce_preview_20260919' }) : undefined;
afterAll(async () => { await db?.$disconnect(); });
describe.skipIf(!enabled)('real MySQL search visibility', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  async function query({ defaultDays = 0, bannedIds = [], plans = [], subscriptions = [], changes = {}, lifecycle = false }: {
    defaultDays?: number; bannedIds?: bigint[];
    plans?: { id: number; adDays: number }[];
    subscriptions?: { userId: number; packageId: number }[];
    changes?: Prisma.adsUpdateInput; lifecycle?: boolean;
  } = {}) {
    const rollback = new Error('rollback synthetic fixture');
    let ids: bigint[] = [];
    try {
      await db!.$transaction(async (tx) => {
        const database = await tx.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
        expect(database[0].name).toBe('trbhh_commerce_preview_20260919');
        const fixture = await tx.ads.findUniqueOrThrow({ where: { id: 1n }, select: { title: true, user_id: true } });
        expect(fixture).toEqual({ title: 'وظيفة محاسب — إعلان اختبار محلي', user_id: 2n });
        await tx.ads.update({ where: { id: 1n }, data: {
          status: 1, state: 'active', store_only: 0, trbhh_until: null,
          created_at: new Date('2026-09-01T12:00:00Z'), adsSpecial: 'no', expires_at: null, urgent_until: null,
          ...changes,
        } });
        ids = (await tx.ads.findMany({
          where: { id: 1n, AND: [platformAdPublicWhere(now, lifecycle), searchCardVisibility({ now, defaultDays, bannedIds, plans, subscriptions })] },
          select: { id: true }, take: 2,
        })).map((ad) => ad.id);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    return ids;
  }
  it('returns an eligible ordinary ad with no configured plans', async () => {
    expect(await query()).toEqual([1n]);
  });
  it('retains banned-seller exclusion with unlimited defaults', async () => {
    expect(await query({ bannedIds: [2n] })).toEqual([]);
  });
  it('enforces finite default age and includes its exact boundary', async () => {
    expect(await query({ defaultDays: 7 })).toEqual([]);
    expect(await query({ defaultDays: 18 })).toEqual([1n]);
  });
  it('retains finite subscription limits under unlimited defaults', async () => {
    expect(await query({ plans: [{ id: 1, adDays: 7 }], subscriptions: [{ userId: 2, packageId: 1 }] })).toEqual([]);
    expect(await query({ defaultDays: 7, plans: [{ id: 1, adDays: 0 }], subscriptions: [{ userId: 2, packageId: 1 }] })).toEqual([1n]);
  });
  it.each([{ status: 0 }, { state: 'inactive' as const }, { store_only: 1 }])('preserves hidden platform filters: %j', async (changes) => {
    expect(await query({ changes })).toEqual([]);
  });
  it('preserves lifecycle expiry even with unlimited plan visibility', async () => {
    expect(await query({ lifecycle: true, changes: { trbhh_until: now } })).toEqual([]);
    expect(await query({ lifecycle: true, changes: { trbhh_until: new Date(now.getTime() + 1000) } })).toEqual([1n]);
  });
});
