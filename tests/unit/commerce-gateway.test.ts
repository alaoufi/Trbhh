import { describe, expect, it, vi } from 'vitest';
import { initiateCommercePayment, type CommerceGateway } from '@/lib/commerce/gateway';
import type { CommerceDb, PaymentAttempt } from '@/lib/commerce/types';

const persistence = vi.hoisted(() => ({ claimPaymentAttempt: vi.fn(), recordPaymentReference: vi.fn(), markPaymentUncertain: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/commerce/orders', () => persistence);
const attempt = { id: 2n, orderId: 1n, provider: 'fixture', reference: null, merchantOrderId: 'commerce:1', amountMinor: 1025, currency: 'SAR', status: 'creating', redirectUrl: null } as PaymentAttempt;
const db = {} as CommerceDb;
const makeGateway = (): CommerceGateway => ({ id: 'fixture', ready: true, create: vi.fn().mockResolvedValue({ reference: 'r1', redirectUrl: 'https://bank.example/pay?r=r1' }), verify: vi.fn(), isSafeRedirect: url => url.startsWith('https://bank.example/') });
describe('commerce gateway orchestration never blindly repeats creation', () => {
  it('calls external create once only when durable claim is won', async () => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: true, claimToken: 'token', attempt });
    persistence.recordPaymentReference.mockResolvedValueOnce(undefined);
    const gateway = makeGateway();
    const result = await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway);
    expect(result).toEqual({ status: 'redirect', url: 'https://bank.example/pay?r=r1' });
    expect(gateway.create).toHaveBeenCalledExactlyOnceWith(attempt);
    expect(persistence.recordPaymentReference).toHaveBeenLastCalledWith(db, { attemptId: 2n, claimToken: 'token', reference: 'r1', redirectUrl: 'https://bank.example/pay?r=r1' });
  });
  it('a retried request resumes only the same saved hosted payment', async () => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: false, attempt: { ...attempt, status: 'pending', reference: 'r1', redirectUrl: 'https://bank.example/pay?r=r1' } });
    const gateway = makeGateway();
    expect(await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).toEqual({ status: 'redirect', url: 'https://bank.example/pay?r=r1' });
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it.each(['creating', 'uncertain', 'paid'])('never re-creates persisted %s attempt', async status => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: false, attempt: { ...attempt, status } });
    const gateway = makeGateway();
    expect((await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).status).toBe(status === 'paid' ? 'paid' : 'action_required');
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it('treats timeout or failure saving a created reference as uncertain, never as retryable', async () => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: true, claimToken: 'token', attempt });
    persistence.markPaymentUncertain.mockResolvedValueOnce(undefined);
    const gateway = makeGateway();
    vi.mocked(gateway.create).mockRejectedValueOnce(new Error('timeout'));
    expect((await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).status).toBe('action_required');
    expect(persistence.markPaymentUncertain).toHaveBeenLastCalledWith(db, { attemptId: 2n, claimToken: 'token' });
    expect(gateway.create).toHaveBeenCalledTimes(1);
  });
  it('fails closed before claim when no verified adapter is available', async () => {
    persistence.claimPaymentAttempt.mockClear();
    const gateway = makeGateway(); gateway.ready = false;
    expect((await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).status).toBe('unavailable');
    expect(persistence.claimPaymentAttempt).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
  });
  it('does not repeat external creation if persisting the bank reference fails', async () => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: true, claimToken: 'token', attempt });
    persistence.recordPaymentReference.mockRejectedValueOnce(new Error('DB disconnected after bank creation'));
    const gateway = makeGateway();
    expect((await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).status).toBe('action_required');
    expect(gateway.create).toHaveBeenCalledTimes(1);
    expect(persistence.markPaymentUncertain).toHaveBeenLastCalledWith(db, { attemptId: 2n, claimToken: 'token' });
  });
  it('does not expose an arbitrary redirect returned by a provider', async () => {
    persistence.claimPaymentAttempt.mockResolvedValueOnce({ claimed: true, claimToken: 'token', attempt });
    const gateway = makeGateway();
    vi.mocked(gateway.create).mockResolvedValueOnce({ reference: 'r1', redirectUrl: 'https://evil.example/' });
    expect((await initiateCommercePayment(db, { memberId: 7n, orderId: 1n }, gateway)).status).toBe('action_required');
  });
});
