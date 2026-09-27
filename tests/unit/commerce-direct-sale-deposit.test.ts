import { beforeEach, describe, expect, it, vi } from 'vitest';

// حالة مشتركة للـ mock: استعلامات prisma المستخدمة في deposit.ts وmember-sell.ts.
const state = vi.hoisted(() => ({
  userFind: vi.fn(),
  productFind: vi.fn(),
  queryRaw: vi.fn(),
  execRaw: vi.fn(),
  canSell: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    users: { findUnique: state.userFind },
    commerce_products: { findMany: state.productFind },
    ads: { findUnique: vi.fn(async () => ({ id: 5n, user_id: 7n, title: 'سلعة' })) },
    $queryRaw: state.queryRaw,
    $executeRaw: state.execRaw,
  },
}));
vi.mock('@/lib/commerce/seller-types', () => ({ canMemberSellDirectly: state.canSell }));

import { memberSaleExposure, memberDepositSummary } from '@/lib/commerce/deposit';
import { listAdForDirectSale } from '@/lib/commerce/member-sell';

describe('تأمين البيع المباشر وسقف السلع', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    state.canSell.mockResolvedValue(true);
    state.userFind.mockResolvedValue({ sale_deposit_minor: 10000n }); // تأمين 100 ر.س
    state.queryRaw.mockResolvedValue([]); // لا سلعة سابقة لنفس الإعلان
    state.execRaw.mockResolvedValue(undefined);
  });

  it('يحسب الالتزام = مجموع (السعر × المخزون) ويستثني إعلاناً محدداً', async () => {
    state.productFind.mockResolvedValue([
      { ad_id: 1n, price_minor: 4000, stock_available: 3 }, // 12000
      { ad_id: 2n, price_minor: 1000, stock_available: 5 }, // 5000
    ]);
    expect(await memberSaleExposure(7)).toBe(17000);
    expect(await memberSaleExposure(7, 2)).toBe(12000); // استثناء الإعلان 2
  });

  it('ملخّص التأمين يعطي المتبقّي = المسجَّل − المستخدَم', async () => {
    state.userFind.mockResolvedValue({ sale_deposit_minor: 20000n });
    state.productFind.mockResolvedValue([{ ad_id: 1n, price_minor: 5000, stock_available: 2 }]); // 10000
    const s = await memberDepositSummary(7);
    expect(s).toMatchObject({ depositMinor: 20000, exposureMinor: 10000, remainingMinor: 10000 });
  });

  it('يرفض عرض سلعة يتجاوز مجموع قيمتها التأمين', async () => {
    // تأمين 100 ر.س، ومحاولة عرض سلعة إجمالي 60 ر.س × كمية 3 = 180 ر.س > 100
    state.productFind.mockResolvedValue([]); // لا التزام آخر
    const r = await listAdForDirectSale(7, 5, { itemMinor: 4000, shippingMinor: 1000, siteCommMinor: 500, memberCommMinor: 500 }, 3);
    expect(r).toEqual({ ok: false, error: 'deposit_exceeded' });
    expect(state.execRaw).not.toHaveBeenCalled();
  });

  it('يقبل العرض ضمن حدّ التأمين ويحفظ السلعة', async () => {
    // إجمالي 60 ر.س × 1 = 60 ر.س ≤ 100
    state.productFind.mockResolvedValue([]);
    const r = await listAdForDirectSale(7, 5, { itemMinor: 4000, shippingMinor: 1000, siteCommMinor: 500, memberCommMinor: 500 }, 1);
    expect(r).toEqual({ ok: true });
    expect(state.execRaw).toHaveBeenCalled();
  });

  it('لا يبيع من ليس مسموحاً له مباشرةً', async () => {
    state.canSell.mockResolvedValue(false);
    const r = await listAdForDirectSale(7, 5, { itemMinor: 4000, shippingMinor: 0, siteCommMinor: 0, memberCommMinor: 0 }, 1);
    expect(r).toEqual({ ok: false, error: 'not_allowed' });
  });
});
