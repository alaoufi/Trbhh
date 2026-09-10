import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const payment = vi.hoisted(() => ({ resolve: vi.fn(), confirm: vi.fn(), webhook: vi.fn() }));
vi.mock('@/lib/payments', () => ({ resolveAlrajhiFinalResult: payment.resolve, confirmTopupById: payment.confirm, confirmFromWebhook: payment.webhook }));
import { POST } from '@/app/api/pay/callback/[provider]/route';

describe('Al Rajhi browser callback privacy', () => {
  beforeEach(() => vi.resetAllMocks());
  it.each(['validated', 'invalid', 'unavailable'])('redirects without disclosing the bank payload when %s', async (outcome) => {
    if (outcome === 'unavailable') payment.resolve.mockRejectedValue(new Error('private bank detail'));
    else payment.resolve.mockResolvedValue({ valid: outcome === 'validated', settled: outcome === 'validated', credited: outcome === 'validated', reason: 'private bank detail' });
    const body = { trandata: 'synthetic-encrypted-value', customer: 'synthetic-customer' };
    const response = await POST(new NextRequest('https://trbhh.sa/api/pay/callback/alrajhi_arb?t=42', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), { params: Promise.resolve({ provider: 'alrajhi_arb' }) });
    expect(payment.resolve).toHaveBeenCalledWith(42, body);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('https://trbhh.sa/payment/result?t=42');
    expect(await response.text()).toBe('');
    expect(payment.confirm).not.toHaveBeenCalled();
    expect(payment.webhook).not.toHaveBeenCalled();
  });
  it('does not settle an invalid transaction id', async () => {
    const response = await POST(new NextRequest('https://trbhh.sa/api/pay/callback/alrajhi_arb?t=-1', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'trandata=synthetic' }), { params: Promise.resolve({ provider: 'alrajhi_arb' }) });
    expect(payment.resolve).not.toHaveBeenCalled();
    expect(response.headers.get('location')).toBe('https://trbhh.sa/payment/result');
  });
});
