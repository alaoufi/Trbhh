import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { PrismaClient, type Prisma } from '@prisma/client';
import { searchCardVisibility } from '@/lib/search-card-visibility';
import { platformAdPublicWhere } from '@/lib/platform-ad-visibility';
import { isolatedSearchUrl, searchAdsDdl, SEARCH_FIXTURE_DATABASE } from '../helpers/search-visibility-fixture';

// Only the pure predicate is used: prevent a settings/ambient Prisma import.
vi.mock('@/lib/settings', () => ({ getPlatformAdLifecycleConfig: () => { throw new Error('Settings access is outside the isolated search fixture'); } }));

// Explicit opt-in; never uses DATABASE_URL or a previously created fixture.
const enabled = process.env.SEARCH_VISIBILITY_MYSQL === '1';
let db: PrismaClient | undefined, admin: PrismaClient | undefined, created = false;

describe.skipIf(!enabled)('real MySQL search visibility', () => {
  const now = new Date('2026-09-19T12:00:00Z');
  beforeAll(async () => {
    const url = isolatedSearchUrl(process.env.SEARCH_TEST_DATABASE_URL);
    const sql = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
      encoding: 'utf8', timeout: 20000, env: { ...process.env, DATABASE_URL: url.href },
    });
    const ddl = searchAdsDdl(sql);
    const adminUrl = new URL(url); adminUrl.pathname = '/mysql';
    admin = new PrismaClient({ datasourceUrl: adminUrl.href, log: [] });
    // Deliberately no IF NOT EXISTS or preemptive DROP. A prior DB is not ours.
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_search_visibility_test');
    created = true;
    db = new PrismaClient({ datasourceUrl: url.href, log: [] });
    const database = await db.$queryRawUnsafe<{ name: string }[]>('SELECT DATABASE() AS name');
    expect(database[0].name).toBe(SEARCH_FIXTURE_DATABASE);
    await db.$executeRawUnsafe(ddl);
    await db.ads.create({ data: {
      id: 1n, adsType: 'offer', user_id: 2n, city_id: 1n, category_id: 1n,
      title: 'وظيفة محاسب — إعلان اختبار مستقل', detail: 'Synthetic isolated search visibility fixture', video_path: '',
      state: 'active', status: 1, store_only: 0, adsSpecial: 'no', created_at: new Date('2026-09-01T12:00:00Z'),
    } });
  });
  afterAll(async () => {
    try {
      await db?.$disconnect();
    } finally {
      try { if (created) await admin!.$executeRawUnsafe('DROP DATABASE trbhh_search_visibility_test'); }
      finally { created = false; await admin?.$disconnect(); }
    }
  });
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
        expect(database[0].name).toBe(SEARCH_FIXTURE_DATABASE);
        const fixture = await tx.ads.findUniqueOrThrow({ where: { id: 1n }, select: { title: true, user_id: true } });
        expect(fixture).toEqual({ title: 'وظيفة محاسب — إعلان اختبار مستقل', user_id: 2n });
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
