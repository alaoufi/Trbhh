import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApprovedFiscalPolicy } from '@/lib/finance/fiscal-policy';

const mock = vi.hoisted(() => ({ config: vi.fn(), gateway: vi.fn(), policy: vi.fn(), query: vi.fn(), schema: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 9, name: 'عميل تجريبي' }) }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: mock.query } }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: mock.config }));
vi.mock('@/lib/commerce/runtime', () => ({ getCommerceGateway: mock.gateway }));
vi.mock('@/lib/commerce/schema', () => ({ assertCommerceSchemaReady: mock.schema }));
vi.mock('@/lib/finance/fiscal-policy', () => ({ readApprovedFiscalPolicy: mock.policy }));
vi.mock('@/lib/data', () => ({ getCountries: async () => [], getCities: async () => [], getAreas: async () => [] }));
vi.mock('@/components/region-city-picker', () => ({ RegionCityPicker: () => null }));
vi.mock('@/app/shop/actions', () => ({ createCommerceOrder: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw Error('not_found'); } }));
import ProductCheckout from '@/app/shop/[id]/page';

function policy(enabled: boolean | undefined, priceBasis: 'inclusive' | 'exclusive' = 'exclusive'): ApprovedFiscalPolicy {
  return { id: '1', requestId: '2', at: '2026-01-01T00:00:00.000Z', effectiveFrom: '2026-01-01', issuer: { name: 'جهة تجريبية', address: 'الرياض', taxNumber: enabled === false ? '' : '300000000000003' }, vatBps: 1500, policyReference: 'test-approved-policy', calculationPolicy: { version: 2, priceBasis, itemScope: 'uniform_catalog', shippingPriceBasis: priceBasis, shippingVatBps: 1500, discountTreatment: 'none', rounding: 'line_half_up', policyRollover: 'hold_for_review', automationDelegateId: '9', ...(enabled === undefined ? {} : { vatControl: { enabled, registrationConfirmed: enabled, registrationEffectiveFrom: enabled ? '2026-01-01' : null, registrationThresholdMinor: 37500000 } }) } };
}
const render = async () => renderToStaticMarkup(await ProductCheckout({ params: Promise.resolve({ id: '7' }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mock.config.mockResolvedValue({ enabled: true, purchasingEnabled: true, paymentsEnabled: true, shippingFeeMinor: 125, text: { shippingTerms: 'شروط تجريبية', unavailable: 'الشراء غير متاح', buy: 'مراجعة الطلب' } });
  mock.gateway.mockResolvedValue({ ready: true });
  mock.query.mockResolvedValue([{ id: 7n, title: 'سلعة تجريبية', price_minor: 1025, stock_available: 4 }]);
  mock.schema.mockResolvedValue(undefined);
});

describe('checkout uses the effective central VAT decision', () => {
  it.each(['inclusive', 'exclusive'] as const)('shows zero VAT and exact product/shipping payable while OFF despite a saved rate (%s)', async basis => {
    const saved = policy(false, basis); mock.policy.mockResolvedValue(saved);
    const before = JSON.stringify(saved), html = await render();
    expect(html).toContain('ضريبة القيمة المضافة غير مضافة');
    expect(html).toContain('إجمالي الطلب شامل الشحن: 11.50 ر.س');
    expect(html).toContain('الشحن: 1.25 ر.س');
    expect(html).not.toContain('قبل الضريبة');
    expect(html).not.toContain('شامل الضريبة');
    expect(html).not.toContain('شاملة الضريبة');
    expect(html).not.toContain('الشحن شامل ضريبته');
    expect(JSON.stringify(saved)).toBe(before);
  });
  it.each([true, undefined])('keeps enabled and legacy presentation tied to their actual rates (%s)', async enabled => {
    mock.policy.mockResolvedValue(policy(enabled));
    const html = await render();
    expect(html).toContain('الضريبة: 1.73 ر.س');
    expect(html).toContain('الشحن شامل ضريبته: 1.44 ر.س');
    expect(html).toContain('إجمالي الطلب شامل الشحن والضريبة: 13.23 ر.س');
    expect(html).not.toContain('ضريبة القيمة المضافة غير مضافة');
  });
  it('does not turn a tax-disabled page into a purchasing or payment activation', async () => {
    mock.config.mockResolvedValue({ enabled: false, purchasingEnabled: false, paymentsEnabled: false, text: { unavailable: 'الشراء غير متاح' } });
    const html = await render();
    expect(html).toContain('الشراء غير متاح');
    expect(mock.policy).not.toHaveBeenCalled(); expect(mock.query).not.toHaveBeenCalled();
  });
  it('blocks the form when no complete approved fiscal policy can be read', async () => {
    mock.policy.mockRejectedValue(Error('finance_tax_policy_missing'));
    const html = await render();
    expect(html).toContain('الشراء غير متاح'); expect(html).not.toContain('<form');
  });
});
