import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient, type Prisma } from '@prisma/client';
import type { CommerceDb } from '@/lib/commerce/types';
import type { CatalogApproval, CatalogSelection } from '@/lib/suppliers/catalog-selection';
import { approveCatalogSelection, reviewCatalogSelection } from '@/lib/suppliers/catalog-admin';
import { assertSupplierSchemaReady } from '@/lib/suppliers/schema';

type TransactionOptions = { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel };

// Only transaction scheduling / an injected audit failure is decorated. All SQL,
// row locks, mappings, audit inserts, commits and rollbacks use the real database.
function decorateTransaction(db: PrismaClient, decorate: (tx: Prisma.TransactionClient) => Promise<Prisma.TransactionClient>): CommerceDb {
  const transaction = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>, options?: TransactionOptions) =>
    db.$transaction(async tx => run(await decorate(tx)), options);
  return { $queryRaw: db.$queryRaw.bind(db), $transaction: transaction as CommerceDb['$transaction'] };
}

describe.skipIf(process.env.AUTH_DB_TESTS !== '1')('isolated MySQL visual supplier selection', () => {
  const suffix = randomUUID();
  const titlePrefix = `selection-test-${suffix}-`;
  const secret = 'ab'.repeat(32);
  let db: PrismaClient;
  let permitted = false;
  let adminId: bigint | undefined;
  let supplierId: bigint | undefined;
  let connectionId: bigint | undefined;
  let selected: CatalogSelection[] = [];
  let sourceIds: bigint[] = [];

  beforeAll(async () => {
    const raw = process.env.AUTH_TEST_DATABASE_URL || '';
    const url = new URL(raw);
    if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !['/ci', '/trbhh_auth_test'].includes(url.pathname) || url.search || url.hash
      || process.env.DATABASE_URL !== raw) {
      throw new Error('Refusing anything other than the explicit isolated loopback test database');
    }
    // Construct the client only after the guard. No production singleton is imported.
    db = new PrismaClient({ datasourceUrl: raw, log: [] });
    const [actual] = await db.$queryRaw<{ name: string }[]>`SELECT DATABASE() AS name`;
    if ('/' + actual?.name !== url.pathname) throw new Error('Connected database does not match the explicit test database');
    if (await db.users.count() !== 0) throw new Error('Supplier selection suite requires an empty disposable user table');
    await assertSupplierSchemaReady(db);
    permitted = true;
    const admin = await db.users.create({ data: { userName: `selection-admin-${suffix}`, name: 'Synthetic selection administrator', type: 'user', is_admin: 1 } });
    adminId = admin.id;
  }, 20_000);

  beforeEach(async () => {
    selected = [];
    sourceIds = [];
    const supplier = await db.commerce_suppliers.create({ data: { name: `Selection fixture ${suffix}`, active: 1 } });
    supplierId = supplier.id;
    await db.supplier_integration_profiles.create({ data: { supplier_id: supplierId, provider: 'salla', sync_enabled: 0, auto_orders_enabled: 0, mode: 'development' } });
    const connection = await db.supplier_connections.create({ data: { supplier_id: supplierId, provider: 'salla', external_store_id: `selection-${suffix}`, status: 'connected' } });
    connectionId = connection.id;
    for (let index = 0; index < 2; index++) {
      const source = await db.supplier_products.create({ data: {
        supplier_id: supplierId, connection_id: connectionId, external_id: String(index + 1),
        name: `${titlePrefix}${index}`, sku: `SYNTHETIC-${index}`, description: 'Synthetic imported product',
        images: [], categories: [], variants: [],
        options: index === 0 ? [{ externalId: 'synthetic-option', name: 'Size', values: ['Large'] }] : [],
        public_price_minor: 3000, minimum_price_minor: 2000, minimum_margin_minor: 100,
        quantity: index === 0 ? 5 : 0, available: index === 0 ? 1 : 0,
        // Even previously set source flags must be forced off by manual addition.
        active: 1, visible: 1, featured: 1, revision: 3,
      } });
      sourceIds.push(source.id);
      selected.push({ key: `p_${source.id}`, revision: source.revision });
    }
  });

  afterEach(async () => {
    if (!permitted || supplierId === undefined) return;
    // Delete only this suite's recorded fixtures; no table-wide deletes or DDL.
    await db.admin_log.deleteMany({ where: { admin_id: adminId, target: { in: sourceIds.map(String) } } });
    await db.supplier_price_history.deleteMany({ where: { supplier_product_id: { in: sourceIds } } });
    await db.commerce_product_suppliers.deleteMany({ where: { supplier_id: supplierId } });
    await db.supplier_products.deleteMany({ where: { id: { in: sourceIds } } });
    await db.commerce_products.deleteMany({ where: { title: { startsWith: titlePrefix } } });
    if (connectionId !== undefined) await db.supplier_connections.delete({ where: { id: connectionId } });
    await db.supplier_integration_profiles.deleteMany({ where: { supplier_id: supplierId } });
    await db.commerce_suppliers.delete({ where: { id: supplierId } });
    supplierId = undefined;
    connectionId = undefined;
  }, 20_000);

  afterAll(async () => {
    try {
      if (permitted && adminId !== undefined) {
        await db.admin_log.deleteMany({ where: { admin_id: adminId } });
        await db.users.delete({ where: { id: adminId } });
      }
    } finally {
      await db?.$disconnect();
    }
  });

  async function approval(): Promise<CatalogApproval> {
    const review = await reviewCatalogSelection(db, selected, adminId!, secret);
    expect(review.products).toHaveLength(2);
    return { token: review.token, confirmed: true, products: selected.map(item => ({ ...item, cost: '10.00', selling: '25.00' })) };
  }

  async function assertNoAddition() {
    const sources = await db.supplier_products.findMany({ where: { id: { in: sourceIds } }, orderBy: { id: 'asc' } });
    expect(sources).toHaveLength(2);
    expect(sources.every(row => row.commerce_product_id === null && row.unit_cost_minor === null && row.selling_price_minor === null)).toBe(true);
    expect(await db.commerce_products.count({ where: { title: { startsWith: titlePrefix } } })).toBe(0);
    expect(await db.commerce_product_suppliers.count({ where: { supplier_id: supplierId } })).toBe(0);
    expect(await db.supplier_price_history.count({ where: { supplier_product_id: { in: sourceIds } } })).toBe(0);
    expect(await db.admin_log.count({ where: { admin_id: adminId } })).toBe(0);
  }

  it('atomically adds complex and sold-out products with every publish/enable flag off', async () => {
    const input = await approval();
    expect(await approveCatalogSelection(db, input, adminId!, secret)).toEqual({ added: 2 });
    const sources = await db.supplier_products.findMany({ where: { id: { in: sourceIds } }, orderBy: { id: 'asc' } });
    for (const row of sources) {
      expect(row).toMatchObject({ active: 0, visible: 0, featured: 0, revision: 4, unit_cost_minor: 1000, selling_price_minor: 2500, minimum_price_minor: 2000, minimum_margin_minor: 100, pricing_policy: 'manual' });
      expect(row.commerce_product_id).not.toBeNull();
    }
    const commerce = await db.commerce_products.findMany({ where: { title: { startsWith: titlePrefix } } });
    expect(commerce).toHaveLength(2);
    expect(commerce.every(row => row.visible === 0 && row.enabled === 0 && row.price_minor === 2500)).toBe(true);
    expect(await db.commerce_product_suppliers.count({ where: { supplier_id: supplierId } })).toBe(2);
    expect(await db.supplier_price_history.count({ where: { supplier_product_id: { in: sourceIds }, kind: 'admin' } })).toBe(2);
    expect(await db.admin_log.count({ where: { admin_id: adminId } })).toBe(2);
    expect(await db.supplier_integration_profiles.findUnique({ where: { supplier_id: supplierId! } })).toMatchObject({ sync_enabled: 0, auto_orders_enabled: 0, mode: 'development' });
    expect(await db.supplier_connections.findUnique({ where: { id: connectionId! } })).toMatchObject({ status: 'connected', version: 0, encrypted_tokens: null });
  });

  it('rejects a stale second product without adding the earlier product', async () => {
    const input = await approval();
    await db.supplier_products.update({ where: { id: sourceIds[1] }, data: { revision: { increment: 1 }, public_price_minor: 3500 } });
    await expect(approveCatalogSelection(db, input, adminId!, secret)).rejects.toThrow('catalog_stale');
    await assertNoAddition();
  });

  it('rejects replay without duplicate products, mappings, histories or audits', async () => {
    const input = await approval();
    await approveCatalogSelection(db, input, adminId!, secret);
    await expect(approveCatalogSelection(db, input, adminId!, secret)).rejects.toThrow('catalog_stale');
    expect(await db.commerce_products.count({ where: { title: { startsWith: titlePrefix } } })).toBe(2);
    expect(await db.commerce_product_suppliers.count({ where: { supplier_id: supplierId } })).toBe(2);
    expect(await db.supplier_price_history.count({ where: { supplier_product_id: { in: sourceIds } } })).toBe(2);
    expect(await db.admin_log.count({ where: { admin_id: adminId } })).toBe(2);
  });

  it('rolls back both products after an injected failure following the second real audit insert', async () => {
    const input = await approval();
    let audits = 0;
    let mappingsVisibleInsideTransaction = 0;
    const failing = decorateTransaction(db, async tx => new Proxy(tx, {
      get(target, property) {
        if (property === 'admin_log') return new Proxy(target.admin_log, {
          get(delegate, operation) {
            if (operation === 'create') return async (args: Prisma.admin_logCreateArgs) => {
              const result = await delegate.create(args);
              if (++audits === 2) {
                mappingsVisibleInsideTransaction = await tx.commerce_product_suppliers.count({ where: { supplier_id: supplierId } });
                throw new Error('supplier_selection_injected_audit_failure');
              }
              return result;
            };
            return Reflect.get(delegate, operation);
          },
        });
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }));
    await expect(approveCatalogSelection(failing, input, adminId!, secret)).rejects.toThrow('supplier_selection_injected_audit_failure');
    expect(audits).toBe(2);
    expect(mappingsVisibleInsideTransaction).toBe(2);
    await assertNoAddition();
    const sources = await db.supplier_products.findMany({ where: { id: { in: sourceIds } } });
    expect(sources.every(row => row.revision === 3 && row.active === 1 && row.visible === 1 && row.featured === 1)).toBe(true);
  });

  it('allows exactly one approval when two real transactions enter simultaneously', async () => {
    const input = await approval();
    let entered = 0;
    let release!: () => void;
    const bothEntered = new Promise<void>(resolve => { release = resolve; });
    const concurrent = decorateTransaction(db, async tx => {
      if (++entered === 2) release();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([bothEntered, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('Concurrent transaction barrier timed out')), 5000);
        })]);
      } finally {
        clearTimeout(timer);
      }
      return tx;
    });
    const results = await Promise.allSettled([
      approveCatalogSelection(concurrent, input, adminId!, secret),
      approveCatalogSelection(concurrent, input, adminId!, secret),
    ]);
    expect(entered).toBe(2);
    expect(results.filter(result => result.status === 'fulfilled')).toEqual([{ status: 'fulfilled', value: { added: 2 } }]);
    const rejected = results.filter(result => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ message: 'catalog_stale' });
    expect(await db.commerce_products.count({ where: { title: { startsWith: titlePrefix } } })).toBe(2);
    expect(await db.commerce_product_suppliers.count({ where: { supplier_id: supplierId } })).toBe(2);
    expect(await db.supplier_price_history.count({ where: { supplier_product_id: { in: sourceIds } } })).toBe(2);
    expect(await db.admin_log.count({ where: { admin_id: adminId } })).toBe(2);
  }, 20_000);
});
