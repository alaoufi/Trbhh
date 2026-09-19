import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';

// Run explicitly with STORE_DB_TESTS=1 and STORE_TEST_DATABASE_URL. The default
// unit suite excludes integration files. Override Vitest's include for this file.
const db = await vi.hoisted(async () => {
  if (process.env.STORE_DB_TESTS !== '1') return { client: undefined, url: undefined };
  const url = new URL(process.env.STORE_TEST_DATABASE_URL || '');
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1' || url.port !== '33309'
    || url.pathname !== '/trbhh_store_test' || url.search || url.hash) {
    throw new Error('Refusing a non-isolated store test database');
  }
  const { PrismaClient } = await import('@prisma/client');
  return { client: new PrismaClient({ datasourceUrl: url.href }), url: url.href };
});
// Only provisioning/request-boundary dependencies are replaced. Every catalog
// query, locking read, transaction, and rollback uses the real Prisma client.
vi.mock('@/lib/prisma', () => ({ prisma: db.client }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
vi.mock('@/lib/profiles', () => ({ getActiveProfile: async () => ({ type: 'store', storeId: 7 }) }));
vi.mock('@/lib/redis', () => ({ cached: vi.fn() }));
vi.mock('@/lib/settings', () => ({ getStoreSubPricing: vi.fn() }));
import { setStoreProducts } from '@/lib/merchant';

describe.skipIf(!db.client)('disposable MySQL store catalog transactions', () => {
  const client = db.client!;
  let admin: PrismaClient;
  let peer: PrismaClient;
  let created = false;
  function triggerDdl(sql: string) {
    const url = new URL(db.url!);
    // Trigger DDL is unsupported by MySQL's prepared-statement protocol.
    execFileSync(process.env.MYSQL_TEST_CLI || 'mysql', [
      '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '--port=33309',
      `--user=${decodeURIComponent(url.username)}`, '--database=trbhh_store_test',
    ], { input: sql, env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  const products = () => client.store_products.findMany({
    select: { store_id: true, ad_id: true }, orderBy: [{ store_id: 'asc' }, { ad_id: 'asc' }],
  });
  const original = [{ store_id: 7, ad_id: 10 }, { store_id: 8, ad_id: 30 }];

  beforeAll(async () => {
    const adminUrl = new URL(db.url!);
    adminUrl.pathname = '/mysql';
    admin = new PrismaClient({ datasourceUrl: adminUrl.href });
    // Deliberately no IF NOT EXISTS: never reuse or erase an existing database.
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_store_test');
    created = true;
    const selected = await client.$queryRaw<{ db: string }[]>`SELECT DATABASE() AS db`;
    expect(selected[0].db).toBe('trbhh_store_test');
    // Minimal tables for the actual queries, with production column types and
    // InnoDB semantics. This is not a full-schema migration integration test.
    await client.$executeRawUnsafe('CREATE TABLE stores (id BIGINT UNSIGNED PRIMARY KEY, user_id INT NOT NULL) ENGINE=InnoDB');
    await client.$executeRawUnsafe('CREATE TABLE ads (id BIGINT UNSIGNED PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL) ENGINE=InnoDB');
    await client.$executeRawUnsafe('CREATE TABLE store_products (store_id INT NOT NULL, ad_id INT NOT NULL, created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(store_id, ad_id)) ENGINE=InnoDB');
    peer = new PrismaClient({ datasourceUrl: db.url! });
  }, 15_000);

  beforeEach(async () => {
    await client.store_products.deleteMany();
    await client.$executeRawUnsafe('DELETE FROM ads');
    await client.$executeRawUnsafe('DELETE FROM stores');
    await client.$executeRawUnsafe('INSERT INTO stores (id,user_id) VALUES (7,5),(8,6)');
    await client.$executeRawUnsafe('INSERT INTO ads (id,user_id) VALUES (10,5),(11,5),(30,6)');
    await client.store_products.createMany({ data: original });
  });

  afterAll(async () => {
    await peer?.$disconnect();
    await client?.$disconnect();
    try {
      if (created) await admin.$executeRawUnsafe('DROP DATABASE trbhh_store_test');
    } finally { await admin?.$disconnect(); }
  }, 15_000);

  it('rolls back the real deletion when MySQL rejects the replacement insert', async () => {
    triggerDdl("CREATE TRIGGER fail_catalog_insert BEFORE INSERT ON store_products FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'forced catalog insert failure';");
    try {
      await expect(setStoreProducts(5, [11])).rejects.toThrow(/forced catalog insert failure/);
      expect(await products()).toEqual(original);
    } finally {
      triggerDdl('DROP TRIGGER fail_catalog_insert;');
    }
  });

  it('commits an owner-filtered replacement and preserves intentional empty selection', async () => {
    const rows = await client.$queryRaw<{ user_id: number }[]>`SELECT user_id FROM stores WHERE id = 7`;
    expect(rows[0].user_id).toBe(5); // Real INT decoding, not a typed mock.
    await setStoreProducts(5, [11, 11, 30]);
    expect(await products()).toEqual([{ store_id: 7, ad_id: 11 }, original[1]]);
    await setStoreProducts(5, []);
    expect(await products()).toEqual([original[1]]);
  });

  it('waits on the ownership row lock and denies the old owner after transfer commits', async () => {
    let save: Promise<{ error?: unknown }> | undefined;
    try {
      await peer.$transaction(async (tx) => {
        await tx.$executeRaw`UPDATE stores SET user_id = 6 WHERE id = 7`;
        // The preliminary nonlocking lookup still sees owner 5. The catalog's
        // SELECT FOR UPDATE must wait and then see the newly committed owner 6.
        save = setStoreProducts(5, [11]).then(() => ({}), error => ({ error }));
        await vi.waitFor(async () => {
          const waits = await client.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*) AS n FROM performance_schema.data_lock_waits w
            JOIN performance_schema.data_locks l ON l.ENGINE_LOCK_ID = w.REQUESTING_ENGINE_LOCK_ID
            WHERE l.OBJECT_SCHEMA = 'trbhh_store_test' AND l.OBJECT_NAME = 'stores'`;
          expect(Number(waits[0].n)).toBeGreaterThan(0);
        }, { timeout: 2500, interval: 25 });
        expect(await products()).toEqual(original);
      }, { timeout: 4000 });
      const result = await save!;
      expect(result.error).toBeInstanceOf(Error);
      expect((result.error as Error).message).toContain('ملكية المتجر');
      expect(await products()).toEqual(original);
    } finally {
      // Drain the pending save even if an assertion aborts the peer transaction.
      await save;
    }
  }, 10_000);
});
