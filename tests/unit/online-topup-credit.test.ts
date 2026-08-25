import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(import.meta.dirname, '../../src/lib/wallet.ts'), 'utf8');

describe('online top-up credit contract', () => {
  it('keeps rejected online payments for seven days only and never deletes a successful credit', () => {
    expect(source).toContain('export const REJECTED_ONLINE_TOPUP_RETENTION_DAYS = 7');
    expect(source).toContain('export async function purgeExpiredRejectedOnlineTopups');
    expect(source).toContain("source: 'online', status: 2");
    expect(source).toContain('decided_at: { lt: cutoff }');
  });

  it('returns the member current balance to the electronic top-up administration list', () => {
    expect(source).toContain('userBalance: number');
    expect(source).toContain('balance: true');
    expect(source).toContain('userBalance: balanceById.get');
  });

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

  it('sends a single success SMS only after the atomic credit succeeds', () => {
    const payments = readFileSync(resolve(import.meta.dirname, '../../src/lib/payments/index.ts'), 'utf8');
    expect(payments).toContain('sendTopupSuccessSms');
    expect(payments).toContain('r.ok && !r.already');
    expect(payments).toContain('credited.ok && !credited.already');
  });

  it('uses the member-facing success wording with amount and date', () => {
    expect(source).toContain('تم إضافة رصيد بمبلغ');
    expect(source).toContain('في تاريخ');
  });
});
