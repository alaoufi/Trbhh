import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
const db = await vi.hoisted(async () => {
  if (process.env.SUBSCRIPTION_DB_TESTS !== '1') return { client: undefined, url: undefined };
  const url = new URL(process.env.SUBSCRIPTION_TEST_DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '33309' || url.pathname !== '/trbhh_subscription_test' || url.search || url.hash) throw new Error('Refusing a non-isolated subscription test database');
  const { PrismaClient } = await import('@prisma/client');
  return { client: new PrismaClient({ datasourceUrl: url.href }), url: url.href };
});
vi.mock('@/lib/prisma', () => ({ prisma: db.client }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/merchant', () => ({ getActiveStoreId: async () => 7 }));
vi.mock('@/lib/admin-inbox', () => ({ getPrimaryAdminId: async () => 0 }));
vi.mock('@/lib/chat', () => ({ sendChat: vi.fn() }));
vi.mock('@/lib/settings', () => ({
  getStoreSubPricing: async () => ({ enabled: true, graceDays: 10 }), subPlanPrice: () => 25,
  getStorePlusPricing: async () => ({ enabled: true }), plusPlanPrice: () => 35,
  SUB_PLAN_MONTHS: { monthly: 1 }, SUB_PLAN_LABELS: { monthly: 'شهري' },
  autoRenewEnabled: async () => true, getSetting: async () => '', setSetting: async () => {},
}));
import { subscribeStore, buyStorePlus, runAutoRenewals } from '@/lib/subscription';

describe.skipIf(!db.client)('subscription transactions on disposable MySQL', () => {
  const client = db.client!;
  let admin: PrismaClient;
  let created = false;
  beforeAll(async () => {
    const url = new URL(db.url!); url.pathname = '/mysql';
    admin = new PrismaClient({ datasourceUrl: url.href });
    // Never reuse an existing database; cleanup is permitted only after our CREATE succeeds.
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_subscription_test'); created = true;
    expect((await client.$queryRaw<{ db: string }[]>`SELECT DATABASE() AS db`)[0].db).toBe('trbhh_subscription_test');
    await client.$executeRawUnsafe('CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY, balance INT NOT NULL, reserved INT NOT NULL) ENGINE=InnoDB');
    await client.$executeRawUnsafe('CREATE TABLE stores (id BIGINT UNSIGNED PRIMARY KEY, user_id INT NOT NULL, sub_until TIMESTAMP NULL, show_until TIMESTAMP NULL, plus_until TIMESTAMP NULL, auto_renew INT NOT NULL DEFAULT 0, status INT NOT NULL DEFAULT 0, on_trial INT NOT NULL DEFAULT 1, sub_plan VARCHAR(20) NULL, show_on_platform INT NOT NULL DEFAULT 0, store_name VARCHAR(120) NULL) ENGINE=InnoDB');
    await client.$executeRawUnsafe('CREATE TABLE wallet_txns (id BIGINT PRIMARY KEY AUTO_INCREMENT, user_id BIGINT UNSIGNED NOT NULL, amount INT NOT NULL, balance_after INT NOT NULL, amount_halala INT NULL, balance_after_halala INT NULL, money_ref VARCHAR(80) NULL, reason VARCHAR(40) NOT NULL, note VARCHAR(200) NULL, admin_id BIGINT UNSIGNED NULL, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
  }, 15000);
  beforeEach(async () => {
    await client.$executeRawUnsafe('DELETE FROM wallet_txns');
    await client.$executeRawUnsafe('DELETE FROM stores');
    await client.$executeRawUnsafe('DELETE FROM users');
    await client.$executeRawUnsafe('INSERT INTO users (id,balance,reserved) VALUES (5,100,0)');
    await client.$executeRawUnsafe('INSERT INTO stores (id,user_id) VALUES (7,5)');
  });
  afterAll(async () => {
    await client?.$disconnect();
    try { if (created) await admin.$executeRawUnsafe('DROP DATABASE trbhh_subscription_test'); }
    finally { await admin?.$disconnect(); }
  }, 15000);
  const wallet = () => client.users.findUnique({ where: { id: 5n }, select: { balance: true, reserved: true } });
  const entitlement = () => client.stores.findUnique({ where: { id: 7n }, select: { status: true, sub_until: true, plus_until: true, on_trial: true } });
  it.each([['subscription', subscribeStore], ['Plus', buyStorePlus]] as const)('%s rolls back the debit and ledger when entitlement update is rejected', async (_name, buy) => {
    await client.$executeRawUnsafe('ALTER TABLE stores ADD CONSTRAINT fail_entitlement CHECK (sub_until IS NULL)');
    try {
      expect((await buy(5, 'monthly')).ok).toBe(false);
      expect((await wallet())?.balance).toBe(100);
      expect(await client.wallet_txns.count()).toBe(0);
      expect((await entitlement())?.sub_until).toBeNull();
    } finally { await client.$executeRawUnsafe('ALTER TABLE stores DROP CHECK fail_entitlement'); }
  });
  it('checks available balance against reserved funds without creating a moderation task', async () => {
    await client.$executeRawUnsafe('UPDATE users SET reserved = 90 WHERE id = 5');
    expect((await subscribeStore(5, 'monthly')).ok).toBe(false);
    expect(await wallet()).toEqual({ balance: 100, reserved: 90 });
    expect(await client.wallet_txns.count()).toBe(0);
  });
  it('commits Plus entitlement and payment together without approving moderation', async () => {
    expect((await buyStorePlus(5, 'monthly')).ok).toBe(true);
    expect((await wallet())?.balance).toBe(65);
    expect(await client.wallet_txns.count()).toBe(1);
    expect(await entitlement()).toMatchObject({ status: 0, on_trial: 0, sub_until: expect.any(Date), plus_until: expect.any(Date) });
  });
  it('concurrent automatic sweeps charge the same due period only once', async () => {
    await client.$executeRawUnsafe("UPDATE stores SET status = 1, on_trial = 0, auto_renew = 1, sub_plan = 'monthly', sub_until = NOW() WHERE id = 7");
    await Promise.all([runAutoRenewals(), runAutoRenewals()]);
    expect((await wallet())?.balance).toBe(75);
    expect(await client.wallet_txns.count()).toBe(1);
    expect((await entitlement())?.sub_until?.getTime()).toBeGreaterThan(Date.now() + 25 * 86400000);
  });
});
