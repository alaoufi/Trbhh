import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: mocks.config }));
import { createCjOrder, payCjOrderBalance, confirmCjOrder } from '@/lib/cj/client';
describe('P0: unverified CJ financial commitment cannot be enabled by configuration', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal('fetch', vi.fn()); mocks.config.mockResolvedValue({ purchasingEnabled: true }); vi.stubEnv('SUPPLIER_ALLOW_LIVE_ORDERS', 'true'); });
  it.each([{}, { payType: 2 }, { payType: 3, orderNumber: 'TRB-1' }])('blocks order creation including payment override %j', async input => {
    expect(await createCjOrder(input)).toMatchObject({ ok: false, error: 'cj_purchase_commitment_unverified' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{ orderId: 'CJ-1' }, { shipmentOrderId: 'SH-1', payId: 'TRB-1' }])('blocks both wallet debit paths %j', async input => {
    expect(await payCjOrderBalance(input)).toMatchObject({ ok: false, error: 'cj_purchase_commitment_unverified' });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('blocks order confirmation without acceptance and reservation evidence', async () => {
    expect(await confirmCjOrder('CJ-1')).toMatchObject({ ok: false, error: 'cj_purchase_commitment_unverified' });
    expect(fetch).not.toHaveBeenCalled();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
});

