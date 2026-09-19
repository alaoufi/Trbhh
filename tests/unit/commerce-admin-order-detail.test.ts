import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const state = vi.hoisted(() => ({ gate: vi.fn(), query: vi.fn() }));
vi.mock('@/lib/roles', () => ({ requireAction: state.gate }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.query } }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not_found'); } }));
import Detail from '@/app/admin/commerce/orders/[id]/page';

const shipping = { name: 'Fixture recipient', phone: '+966500000000', addressLine: 'Fixture street 12', city: 'Riyadh', postalCode: '12345', country: 'SA' };
const order = { id: 12n, member_id: 7n, status: 'paid', fulfillment_status: 'offline_pending', subtotal_minor: 2050, shipping_fee_minor: 500, total_minor: 2550, shipping };
describe('private read-only admin order detail', () => {
  beforeEach(() => { vi.resetAllMocks(); state.gate.mockResolvedValue({ uid: 9 }); });
  it('requires independent commerce view permission before querying', async () => {
    state.gate.mockRejectedValue(new Error('forbidden'));
    await expect(Detail({ params: Promise.resolve({ id: '12' }) })).rejects.toThrow('forbidden');
    expect(state.gate).toHaveBeenCalledWith('commerce', 'view');
    expect(state.query).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '01', '1.5', '1e2', '12 OR 1=1', ' 12', '1000000000000000'])('rejects invalid ID %s before querying', async id => {
    await expect(Detail({ params: Promise.resolve({ id }) })).rejects.toThrow('not_found');
    expect(state.gate).toHaveBeenCalledWith('commerce', 'view');
    expect(state.query).not.toHaveBeenCalled();
  });
  it('returns not found without fetching items for a missing order', async () => {
    state.query.mockResolvedValueOnce([]);
    await expect(Detail({ params: Promise.resolve({ id: '12' }) })).rejects.toThrow('not_found');
    expect(state.query).toHaveBeenCalledTimes(1);
  });
  it.each([shipping, JSON.stringify(shipping)])('renders stored item and shipping snapshots, with bounded exact queries', async snapshot => {
    state.query.mockResolvedValueOnce([{ ...order, shipping: snapshot }]).mockResolvedValueOnce([
      { id: 3n, title: 'Purchased snapshot', quantity: 2, unit_price_minor: 1025, total_minor: 2050 },
    ]).mockResolvedValueOnce([{product_id:4n,supplier_id:9n,supplier_name:'Original supplier',supplier_sku:'SKU-private',quantity:2,unit_cost_minor:350,total_cost_minor:700}]);
    const html = renderToStaticMarkup(await Detail({ params: Promise.resolve({ id: '12' }) }));
    for (const value of [...Object.values(shipping), 'Purchased snapshot', '10.25', '20.50', '25.50', '5.00', 'خارج الموقع']) expect(html).toContain(value);
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).toContain('Original supplier');
    expect(html).toContain('SKU-private');
    expect(html).toContain('7.00');
    expect(html).toContain('/admin/commerce/accounts?supplier=9');
    expect(state.query).toHaveBeenCalledTimes(3);
    for (const call of state.query.mock.calls) {
      expect(call.slice(1)).toEqual([12n]);
      expect(call[0].join('?')).toMatch(/WHERE (?:id|order_id)=\? .*LIMIT \d+/);
    }
    expect(state.gate.mock.invocationCallOrder[0]).toBeLessThan(state.query.mock.invocationCallOrder[0]);
  });
});
