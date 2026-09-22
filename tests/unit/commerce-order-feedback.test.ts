import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { commerceConfigFromRows } from '@/lib/commerce/config';

const state = vi.hoisted(() => ({ query: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/auth', () => ({ requireUser: async () => ({ uid: 7 }) }));
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: state.query } }));
vi.mock('@/lib/commerce/settings', () => ({ getCommerceConfig: state.config }));
vi.mock('@/lib/commerce/runtime', () => ({ getCommerceGateway: async () => null }));
vi.mock('@/app/account/orders/actions', () => ({ payCommerceOrder: vi.fn(), cancelCommerceOrder: vi.fn(), checkCommercePayment: vi.fn() }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not_found'); } }));
import MemberOrder from '@/app/account/orders/[id]/page';

const custom = [
  { k: 'commerce_payment_action_required_text', v: 'CUSTOM intervention' },
  { k: 'commerce_payment_rate_limit_text', v: 'CUSTOM inquiry limit' },
  { k: 'commerce_payment_unavailable_text', v: 'CUSTOM inquiry unavailable' },
];
async function render(searchParams: Record<string, string | string[]> = {}, status = 'awaiting_payment') {
  state.query.mockResolvedValueOnce([{ id: 1n, status, total_minor: 100, shipping_fee_minor: 0 }])
    .mockResolvedValueOnce([]).mockResolvedValueOnce([{ status: 'uncertain' }]);
  return renderToStaticMarkup(await MemberOrder({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve(searchParams) }));
}
describe('owned order payment feedback', () => {
  beforeEach(() => { vi.resetAllMocks(); state.config.mockResolvedValue(commerceConfigFromRows(custom)); });
  it.each([
    [{ payment: 'action_required' }, 'CUSTOM intervention'],
    [{ error: 'rate' }, 'CUSTOM inquiry limit'],
    [{ error: 'unavailable' }, 'CUSTOM inquiry unavailable'],
    [{ payment: 'unavailable' }, 'CUSTOM inquiry unavailable'],
  ])('renders editable feedback for %j', async (query, message) => {
    const html = await render(query);
    expect(html).toContain(message);
    expect(html).toContain('role="alert"');
  });
  it('provides nonempty defaults without claiming payment never started', () => {
    const text = commerceConfigFromRows([]).text;
    for (const key of ['paymentActionRequired', 'paymentRateLimit', 'paymentUnavailable'] as const) {
      expect(text[key]).toBeTruthy();
      expect(text[key]).not.toContain('لم يبدأ الدفع');
    }
  });
  it('cannot confirm payment through a forged query', async () => {
    expect(await render({ payment: 'paid' })).not.toContain(commerceConfigFromRows([]).text.confirmed);
  });
  it.each(['paid', 'cancelled'])('ignores stale failure feedback for database status %s', async status => {
    const html = await render({ payment: 'action_required', error: 'rate' }, status);
    expect(html).not.toContain('CUSTOM');
    if (status === 'paid') expect(html).toContain(commerceConfigFromRows([]).text.confirmed);
  });
  it('ignores unknown and repeated query values', async () => {
    expect(await render({ payment: ['action_required'], error: '<script>bad</script>' })).not.toContain('CUSTOM');
  });
  it('does not display order data or feedback for a non-owned order', async () => {
    state.query.mockResolvedValueOnce([]);
    await expect(MemberOrder({ params: Promise.resolve({ id: '1' }), searchParams: Promise.resolve({ payment: 'action_required' }) })).rejects.toThrow('not_found');
    expect(state.config).not.toHaveBeenCalled();
    expect(state.query.mock.calls[0].slice(1)).toEqual([1n, 7n]);
  });
});
vi.mock('@/lib/finance/schema',()=>({financeSchemaAvailable:async()=>false}));
