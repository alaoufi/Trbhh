import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const schema = readFileSync(resolve(root, 'prisma/schema.prisma'), 'utf8');
const sync = readFileSync(resolve(root, 'src/data/schema-sync.ts'), 'utf8');

describe('wallet halala migration contract', () => {
  it('keeps parallel halala columns before switching money reads', () => {
    expect(schema).toContain('balance_halala');
    expect(schema).toContain('reserved_halala');
    expect(schema).toContain('amount_halala');
    expect(schema).toContain('model wallet_money_migrations');
  });

  it('uses an explicit checked migration rather than page-load conversion', () => {
    expect(existsSync(resolve(root, 'src/lib/wallet-money-migration.ts'))).toBe(true);
    expect(sync).toContain('wallet_money_migrations');
  });
});
