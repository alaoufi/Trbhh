import { describe, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({
  users: { findUnique: vi.fn(async () => ({ balance: 75 })), update: vi.fn(async () => ({})) },
  wallet_txns: { create: vi.fn(async () => ({ id: 1n })) },
  $executeRaw: vi.fn(async () => 1),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { ...db, $transaction: async (fn: (tx: typeof db) => unknown) => fn(db) } }));
vi.mock('@/data/schema-sync', () => ({ ensureSchema: async () => {} }));
import { charge, captureHold, adjustBalance } from '@/lib/wallet';
import { walletSourceReference } from '@/lib/wallet-source-reference';

describe('operational wallet source references', () => {
  it('persists references through the real charge and adjustBalance writer without changing the debit', async () => {
    const sourceReference = { kind: 'ad', id: 42n, service: 'featured' } as const;
    await charge(7, 25, 'featured', 'original note', sourceReference);
    expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: -25, balance_after: 75, note: 'original note', money_ref: 'svc:v1:ad:42:featured' }) });
  });
  it('preserves a reference on capture and refunds without adding money movements', async () => {
    const sourceReference = { kind: 'member_service_order', id: 42n, service: 'member_service' } as const;
    await captureHold(7, 25, 'member_service', 'capture', sourceReference);
    expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: 'svc:v1:member_service_order:42:member_service' }) });
    await adjustBalance(7, 10, 'refund', { sourceReference });
    expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: 10, reason: 'refund', money_ref: 'svc:v1:member_service_order:42:member_service' }) });
  });
  it('leaves callers without evidence compatible and never invents an identifier', async () => {
    await charge(7, 25, 'featured', 'legacy caller');
    expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: null }) });
    expect(walletSourceReference({ kind: 'ad', id: NaN, service: 'featured' })).toBeNull();
    expect(walletSourceReference({ kind: 'ad', id: -1, service: 'featured' })).toBeNull();
  });
  it('does not claim monetary idempotency: repeated source references still use the existing debit path', async () => {
    db.wallet_txns.create.mockClear();
    const sourceReference = { kind: 'ad', id: 42, service: 'bump' } as const;
    await charge(7, 25, 'bump', undefined, sourceReference);
    await charge(7, 25, 'bump', undefined, sourceReference);
    expect(db.wallet_txns.create).toHaveBeenCalledTimes(2);
  });
});

it('persists a local operational attempt reference on a debit and its existing refund', async () => {
  const sourceReference = { kind: 'operation', id: 'b5d3e721-0839-4b65-8c78-4f7d35db9441', service: 'classified_publish' } as const;
  await charge(7, 25, 'classified', 'publish', sourceReference);
  expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: -25, money_ref: 'svc:v1:operation:b5d3e721-0839-4b65-8c78-4f7d35db9441:classified_publish' }) });
  await adjustBalance(7, 25, 'refund', { sourceReference });
  expect(db.wallet_txns.create).toHaveBeenLastCalledWith({ data: expect.objectContaining({ amount: 25, money_ref: 'svc:v1:operation:b5d3e721-0839-4b65-8c78-4f7d35db9441:classified_publish' }) });
  expect(walletSourceReference({ ...sourceReference, id: 'not-an-operation-id' })).toBeNull();
});
