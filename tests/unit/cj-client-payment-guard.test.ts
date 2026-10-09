import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ getCommerceConfig: vi.fn() }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: mock.getCommerceConfig }));
// لو تجاوز أي اختبار الحارس (خطأ) فسيحاول الاتصال — نُفشل fetch صراحةً لكشف ذلك.
vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('NETWORK_SHOULD_NOT_BE_CALLED'); }));

import { createCjOrder, payCjOrderBalance, confirmCjOrder } from '@/lib/cj/client';

const ENV = process.env.SUPPLIER_ALLOW_LIVE_ORDERS;
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { process.env.SUPPLIER_ALLOW_LIVE_ORDERS = ENV; });

describe('حارسا الشراء الحيّ — لا اتصال ولا خصم قبل التفعيل اليدوي', () => {
  it('مفتاح الشراء مطفأ → كل العمليات المالية مرفوضة بلا شبكة', async () => {
    mock.getCommerceConfig.mockResolvedValue({ purchasingEnabled: false });
    process.env.SUPPLIER_ALLOW_LIVE_ORDERS = 'true';
    expect(await createCjOrder({})).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
    expect(await payCjOrderBalance({ orderId: 'CJ-1' })).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
    expect(await confirmCjOrder('CJ-1')).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
  });

  it('مفتاح الشراء مفعّل لكن متغيّر البيئة غير "true" → مرفوضة أيضاً', async () => {
    mock.getCommerceConfig.mockResolvedValue({ purchasingEnabled: true });
    process.env.SUPPLIER_ALLOW_LIVE_ORDERS = 'false';
    expect(await createCjOrder({})).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
    expect(await payCjOrderBalance({ shipmentOrderId: 'S1' })).toEqual({ ok: false, error: 'cj_purchasing_disabled' });
  });

  it('كلا الحارسين مطفأ → مرفوضة', async () => {
    mock.getCommerceConfig.mockResolvedValue({ purchasingEnabled: false });
    process.env.SUPPLIER_ALLOW_LIVE_ORDERS = 'false';
    expect(await createCjOrder({})).toMatchObject({ ok: false, error: 'cj_purchasing_disabled' });
  });
});
