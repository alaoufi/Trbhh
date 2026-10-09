import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  createMany: vi.fn(),
  findMany: vi.fn(),
  aggregate: vi.fn(),
  count: vi.fn(),
}));
vi.mock('@/lib/prisma', () => ({ prisma: { cj_ledger: { createMany: mock.createMany, findMany: mock.findMany, aggregate: mock.aggregate, count: mock.count } } }));

import { recordLedgerEntry, ledgerNetOutflowUsdMinor, reconcileReport } from '@/lib/cj/orders/ledger';

beforeEach(() => {
  vi.clearAllMocks();
  mock.createMany.mockResolvedValue({ count: 1 });
  mock.findMany.mockResolvedValue([]);
  mock.aggregate.mockResolvedValue({ _sum: { amount_usd_minor: 1200 } });
  mock.count.mockResolvedValue(3);
});

describe('recordLedgerEntry — قيد محاسبي idempotent', () => {
  it('يُدرج قيداً صحيحاً ويعيد true', async () => {
    const ok = await recordLedgerEntry({ entryKey: 'CJTEST-1:charge', orderId: 7n, amountUsdMinor: 1200, cjRef: 'CJ-1' });
    expect(ok).toBe(true);
    expect(mock.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('قيد مكرّر (skipDuplicates) → count=0 → false', async () => {
    mock.createMany.mockResolvedValue({ count: 0 });
    expect(await recordLedgerEntry({ entryKey: 'dup', amountUsdMinor: 100 })).toBe(false);
  });

  it('مفتاح فارغ أو مبلغ غير رقمي يُرفض بلا كتابة', async () => {
    expect(await recordLedgerEntry({ entryKey: '', amountUsdMinor: 100 })).toBe(false);
    expect(await recordLedgerEntry({ entryKey: 'k', amountUsdMinor: Number.NaN })).toBe(false);
    expect(mock.createMany).not.toHaveBeenCalled();
  });

  it('غياب الجدول (رمي) لا يكسر — يعيد false', async () => {
    mock.createMany.mockRejectedValue(new Error('no table'));
    expect(await recordLedgerEntry({ entryKey: 'k', amountUsdMinor: 100 })).toBe(false);
  });
});

describe('ledgerNetOutflowUsdMinor — صافي الخصم', () => {
  it('يجمع المبالغ', async () => {
    expect(await ledgerNetOutflowUsdMinor()).toBe(1200);
  });
  it('صفر عند غياب قيود أو خطأ', async () => {
    mock.aggregate.mockResolvedValue({ _sum: { amount_usd_minor: null } });
    expect(await ledgerNetOutflowUsdMinor()).toBe(0);
    mock.aggregate.mockRejectedValue(new Error('x'));
    expect(await ledgerNetOutflowUsdMinor()).toBe(0);
  });
});

describe('reconcileReport — المطابقة مع كشف CJ', () => {
  it('يحسب الفرق عند توفّر مصروف CJ', async () => {
    const r = await reconcileReport(1000);
    expect(r).toMatchObject({ ledgerNetUsdMinor: 1200, cjSpentUsdMinor: 1000, differenceUsdMinor: 200, entries: 3 });
  });
  it('difference = null عند غياب مصروف CJ', async () => {
    const r = await reconcileReport(null);
    expect(r.differenceUsdMinor).toBeNull();
    expect(r.ledgerNetUsdMinor).toBe(1200);
  });
});
