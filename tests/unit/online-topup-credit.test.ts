import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '../../src/lib/wallet.ts'), 'utf8');

describe('online top-up credit contract', () => {
  it('uses one database transaction for the paid state, balance, and ledger record', () => {
    const start = source.indexOf('export async function creditOnlineTopupAtomically');
    const end = source.indexOf('/** Member\'s own top-up requests', start);
    const block = source.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain('prisma.$transaction');
    expect(block).toContain('tx.wallet_topups.updateMany');
    expect(block).toContain('tx.users.update');
    expect(block).toContain('tx.wallet_txns.create');
  });
});
