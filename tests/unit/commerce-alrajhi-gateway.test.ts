import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ createPayment: vi.fn(), verifyByRef: vi.fn() }));
vi.mock('@/lib/payments/providers/alrajhi-arb', () => ({ alrajhiArb: { id: 'alrajhi_arb', createPayment: mock.createPayment, verifyByRef: mock.verifyByRef } }));
vi.mock('@/lib/constants', () => ({ SITE: { domain: 'trbhh.com' } }));

import { makeAlrajhiCommerceGateway } from '@/lib/commerce/gateways/alrajhi';
import type { PaymentAttempt } from '@/lib/commerce/types';

const creds = { tranportal_id: 'T1', tranportal_password: 'P1', terminal_resource_key: 'K1', hosted_payment_url: 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm', gateway_url: '', tranportal_gateway_url: 'https://securepayments.alrajhibank.com.sa/pg/svc' };
const attempt: PaymentAttempt = { id: 42n, orderId: 7n, provider: 'alrajhi_arb', reference: null, redirectUrl: null, merchantOrderId: 'commerce:7:abc', amountMinor: 4550, currency: 'SAR', status: 'creating' };

beforeEach(() => vi.clearAllMocks());

describe('مُحوِّل الراجحي للتجارة', () => {
  it('ready يتطلب اكتمال مفاتيح الراجحي', () => {
    expect(makeAlrajhiCommerceGateway(creds, 'test').ready).toBe(true);
    expect(makeAlrajhiCommerceGateway({ ...creds, terminal_resource_key: '' }, 'test').ready).toBe(false);
  });

  it('create يمرّر trackId=معرّف المحاولة والمبلغ ورابط عودة التجارة', async () => {
    mock.createPayment.mockResolvedValue({ ok: true, providerRef: 'PID9', redirectUrl: 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm?PaymentID=PID9' });
    const g = makeAlrajhiCommerceGateway(creds, 'test');
    const out = await g.create(attempt);
    expect(out).toEqual({ reference: 'PID9', redirectUrl: 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm?PaymentID=PID9' });
    const input = mock.createPayment.mock.calls[0][0];
    expect(input.topupId).toBe(42); // trackId قصير
    expect(input.amountSar).toBe(45.5);
    expect(input.callbackUrl).toBe('https://trbhh.com/api/commerce/pay/final?a=42');
  });

  it('create يرمي عند رفض البنك', async () => {
    mock.createPayment.mockResolvedValue({ ok: false, error: 'declined' });
    await expect(makeAlrajhiCommerceGateway(creds, 'test').create(attempt)).rejects.toThrow('declined');
  });

  it('verify يعتمد فقط عند دفع مؤكَّد بنفس المبلغ', async () => {
    const paid = { ...attempt, reference: 'PID9' };
    mock.verifyByRef.mockResolvedValue({ paid: true, amountSar: 45.5, providerRef: 'PID9', merchantTrackId: '42', status: 'CAPTURED' });
    const g = makeAlrajhiCommerceGateway(creds, 'test');
    const v = await g.verify(paid);
    expect(v).toMatchObject({ verified: true, amountMinor: 4550, merchantOrderId: 'commerce:7:abc', provider: 'alrajhi_arb', reference: 'PID9' });
    // trackId المُمرَّر للتحقق = معرّف المحاولة
    expect(mock.verifyByRef).toHaveBeenCalledWith('PID9', creds, 'test', 45.5, '42');
  });

  it('verify يرفض عند عدم الدفع أو اختلاف المبلغ أو غياب المرجع', async () => {
    const g = makeAlrajhiCommerceGateway(creds, 'test');
    expect(await g.verify(attempt)).toBeNull(); // reference=null
    mock.verifyByRef.mockResolvedValue({ paid: false, amountSar: 0, providerRef: 'PID9', status: 'DECLINED' });
    expect(await g.verify({ ...attempt, reference: 'PID9' })).toBeNull();
    mock.verifyByRef.mockResolvedValue({ paid: true, amountSar: 40.0, providerRef: 'PID9', merchantTrackId: '42', status: 'CAPTURED' });
    expect(await g.verify({ ...attempt, reference: 'PID9' })).toBeNull(); // مبلغ مختلف
  });

  it('isSafeRedirect يقبل مضيف الراجحي فقط وعبر https', () => {
    const g = makeAlrajhiCommerceGateway(creds, 'test');
    expect(g.isSafeRedirect('https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm?PaymentID=x')).toBe(true);
    expect(g.isSafeRedirect('http://securepayments.alrajhibank.com.sa/pg')).toBe(false);
    expect(g.isSafeRedirect('https://evil.example.com/pg')).toBe(false);
  });
});
