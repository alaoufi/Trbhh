import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getProduct: vi.fn(), createCjOrder: vi.fn(), getCjBalance: vi.fn(), getCjOrderDetail: vi.fn(),
  verify: vi.fn(), sync: vi.fn(),
}));
vi.mock('@/lib/cj/client', () => ({ getProduct: mock.getProduct, createCjOrder: mock.createCjOrder, getCjBalance: mock.getCjBalance, getCjOrderDetail: mock.getCjOrderDetail }));
vi.mock('@/lib/cj/availability', () => ({ verifyCjVariantForSaudi: mock.verify }));
vi.mock('@/lib/cj/sync', () => ({ cjSyncSettings: mock.sync }));

import { cjSupplier } from '@/lib/cj/supplier';
import { getCommerceSupplier, listSupplierCapabilities } from '@/lib/suppliers/commerce-supplier';

beforeEach(() => {
  vi.clearAllMocks();
  mock.sync.mockResolvedValue({ usdToSarX100: 375 });
  mock.getProduct.mockResolvedValue({ ok: true, data: { variants: [{ vid: 'V1', variantSku: 'S1', variantSellPrice: 10 }] } });
  mock.verify.mockResolvedValue({ status: 'available', vid: 'V1', sku: 'S1', supplierPriceMinor: 3750, salePriceMinor: 5525, stockQuantity: 7, shippingOptions: [{ name: 'CJPacket', priceMinor: 1000, additionalMinor: 0, deliveryDays: '7-15', originCountry: 'CN' }], checkedAt: '2026-10-09T00:00:00Z', priceChanged: false });
  mock.createCjOrder.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: 'SH-1', actualPaymentUsd: 12, orderStatus: 'created' } });
  mock.getCjBalance.mockResolvedValue({ ok: true, data: { amountUsd: 50, bonusUsd: 0, frozenUsd: 0 } });
  mock.getCjOrderDetail.mockResolvedValue({ ok: true, data: { orderId: 'CJ-1', orderStatus: 'Shipped', trackNumber: 'LP1' } });
});

describe('واجهة المورد الموحّدة — CJ', () => {
  it('يُسجَّل CJ في السجلّ ويُعلن قدراته صراحةً', () => {
    expect(getCommerceSupplier('cj')).toBe(cjSupplier);
    expect(listSupplierCapabilities().some((c) => c.key === 'cj')).toBe(true);
    expect(cjSupplier.capabilities).toMatchObject({ key: 'cj', livePrice: true, liveStock: true, liveShipping: true, walletPay: true, directPayLink: false, tracking: true });
  });

  it('verifyVariant يحوّل تحقّق CJ الحيّ إلى عرض موحّد', async () => {
    const r = await cjSupplier.verifyVariant({ pid: 'PID1', vid: 'V1', quantity: 1 });
    expect(r).toMatchObject({ ok: true, data: { vid: 'V1', salePriceMinor: 5525, stockQuantity: 7 } });
    if (r.ok) expect(r.data.shippingOptions[0]).toMatchObject({ name: 'CJPacket', priceMinor: 1000 });
  });

  it('verifyVariant يرفض المدخلات غير الصحيحة وحالات عدم التوفّر', async () => {
    expect(await cjSupplier.verifyVariant({ pid: 'bad id!', vid: 'V1', quantity: 1 })).toMatchObject({ ok: false, error: 'invalid_request' });
    mock.verify.mockResolvedValue({ status: 'out_of_stock', checkedAt: 'x' });
    expect(await cjSupplier.verifyVariant({ pid: 'PID1', vid: 'V1', quantity: 1 })).toMatchObject({ ok: false, error: 'out_of_stock' });
  });

  it('createOrder وwalletBalanceMinor وorderStatus تفوّض لدوال CJ وتوحّد الناتج', async () => {
    expect(await cjSupplier.createOrder({})).toMatchObject({ ok: true, data: { orderId: 'CJ-1', shipmentOrderId: 'SH-1', actualAmountMinor: 1200 } });
    expect(await cjSupplier.walletBalanceMinor()).toEqual({ ok: true, data: 5000 });
    expect(await cjSupplier.orderStatus('CJ-1')).toMatchObject({ ok: true, data: { rawStatus: 'Shipped', trackNumber: 'LP1' } });
  });

  it('يمرّر أخطاء المورد كما هي (الشراء الحيّ معطّل → cj_purchasing_disabled)', async () => {
    mock.createCjOrder.mockResolvedValue({ ok: false, error: 'cj_purchasing_disabled' });
    expect(await cjSupplier.createOrder({})).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
  });
});
