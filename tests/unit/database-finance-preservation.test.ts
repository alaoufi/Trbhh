import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/release/database-proof.cjs');
const source = readFileSync(script, 'utf8');
const tables = [
  'commerce_orders', 'commerce_order_items', 'commerce_order_suppliers',
  'commerce_payment_attempts', 'commerce_receipts', 'commerce_supplier_accruals',
  'commerce_audit_events', 'finance_reconciliations', 'finance_periods',
  'finance_budgets', 'finance_expenses', 'finance_accrual_reviews',
  'finance_settlements', 'finance_settlement_lines', 'finance_invoices',
  'finance_sequences', 'finance_refunds', 'finance_audit',
  'finance_change_requests', 'finance_tax_policies',
];

function proof() {
  const records = Object.fromEntries(tables.map(name => [name, [
    { id: 1, amount_halala: 11500, snapshot: '{"vat":1500}', updated_at: 'original' },
  ]]));
  const names = ['users', 'ads', ...tables];
  const tx = {
    async $queryRawUnsafe(sql: string) {
      if (sql.includes('SELECT DATABASE()')) return [{ db: 'proof_test', version: 'test', observed_at: 'test' }];
      if (sql.includes('information_schema.TABLES')) return names.map(name => ({ name, engine: 'InnoDB' }));
      if (sql.includes('information_schema.COLUMNS')) return names.flatMap(t =>
        (tables.includes(t) ? ['id', 'amount_halala', 'snapshot', 'updated_at'] : ['id'])
          .map(c => ({ t, c, type: 'text', nullable: 'NO', def: null })));
      if (sql.includes('KEY_COLUMN_USAGE')) return names.map(t => ({ t, c: 'id' }));
      const name = sql.match(/FROM `([a-z_]+)`/)?.[1];
      if (!name) throw Error('Unexpected proof query');
      const rows = records[name] || [];
      if (sql.startsWith('SELECT COUNT')) return [{ n: rows.length }];
      return rows;
    },
  };
  class PrismaClient {
    async $transaction<T>(fn: (value: typeof tx) => Promise<T>) { return fn(tx); }
    async $disconnect() {}
  }
  const require = createRequire(script);
  const api = runInNewContext(source.slice(0, source.lastIndexOf('main().catch')) + '\n({snapshot,verify});', {
    require: (name: string) => name === '@prisma/client' ? { PrismaClient } : require(name),
    process: { env: { DATABASE_URL: 'mysql://test:test@localhost/proof_test' } },
    URL, Buffer, Date, Uint8Array,
  });
  return { records, ...api };
}

describe('financial release preservation uses values, not only row counts', () => {
  it.each(tables)('rejects same-ID amount and snapshot changes in %s', async name => {
    const api = proof();
    const before = await api.snapshot();
    api.records[name][0].amount_halala = 99999;
    api.records[name][0].snapshot = '{"vat":0}';
    const result = api.verify(before, await api.snapshot());
    expect(result.ok).toBe(false);
    expect(result.failures).toContainEqual({ table: name, kind: 'protected_rows_changed', count: 1 });
  });

  it('allows new captured records while preserving earlier financial values', async () => {
    const api = proof();
    const before = await api.snapshot();
    api.records.finance_invoices.push({ id: 2, amount_halala: 0, snapshot: 'pending_policy', updated_at: 'new' });
    api.records.finance_invoices[0].updated_at = 'new';
    expect(api.verify(before, await api.snapshot()).ok).toBe(true);
  });

  it('rejects removal of a previously captured financial record', async () => {
    const api = proof();
    const before = await api.snapshot();
    api.records.commerce_receipts = [];
    expect(api.verify(before, await api.snapshot()).ok).toBe(false);
  });
});
