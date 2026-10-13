import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
const state = vi.hoisted(() => ({ allowed: true, paidAt: null as Date | null }));
vi.mock('@/lib/access-control/guards', () => ({ requireAccess: async () => { if(!state.allowed) throw Error('denied'); return { uid: 3 }; }, hasAccess: async () => false }));
vi.mock('@/lib/cj/orders/store', () => ({ getOrderById: async () => ({ id: 7n, internal_ref: 'TRB-1', status: 'paid', paid_at: state.paidAt, cj_order_id: 'CJ-OLD', cj_lines_json: '[]', product_price_minor: 100, shipping_minor: 100, total_minor: 200, actual_payment_usd_minor: 100, approved_cap_usd_minor: 5000 }), listOrderEvents: async () => [], parseOrderLines: () => [] }));
vi.mock('@/lib/cj/orders/ledger', () => ({ listOrderLedger: async () => [] }));
vi.mock('@/lib/cj/orders/payment', () => ({ cjOrderCapUsdMinor: async () => 5000 }));
vi.mock('@/lib/settings', () => ({ getSetting: async () => '' }));
vi.mock('@/lib/cj/orders/dispatch', () => ({ canDispatch: () => false }));
vi.mock('@/app/admin/suppliers/cj/actions', () => ({ advanceCjOrder: vi.fn(), setCjOrderTracking: vi.fn(), dispatchCjOrderToSupplier: vi.fn() }));
vi.mock('@/components/access-boundary', () => ({ AccessBoundary: () => null }));
import Page from '@/app/admin/suppliers/cj/orders/[id]/page';
describe('Admin CJ purchase evidence display', () => {
  beforeEach(() => { state.allowed = true; state.paidAt = null; });
  it.each(['1','already'])('query paid=%s cannot claim wallet payment success', async paid => {
    state.paidAt = new Date();
    const html = renderToStaticMarkup(await Page({ params: Promise.resolve({id:'7'}), searchParams: Promise.resolve({paid, sent:'1'}) }));
    expect(html).toContain('الشراء والخصم متوقفان');
    expect(html).toContain('سجل دفع سابق غير مطابق');
    expect(html).not.toContain('تمّ الدفع من محفظة CJ بنجاح');
    expect(html).not.toContain('لم يُكرَّر الخصم');
    expect(html).not.toContain('أؤكّد الخصم');
    expect(html).toContain('قبول CJ وتخصيص المخزون غير متحققين');
  });
  it('does not render evidence to an unauthorized user', async () => {
    state.allowed = false;
    await expect(Page({params:Promise.resolve({id:'7'}),searchParams:Promise.resolve({})})).rejects.toThrow('denied');
  });
});
