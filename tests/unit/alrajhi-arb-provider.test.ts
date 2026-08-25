import { describe, expect, it } from 'vitest';
import { arbStatusText, buildArbInquiryTrandata, buildArbPurchaseTrandata, decodeArbCallback, decryptArbTrandata, encryptArbTrandata, extractArbCallbackPaymentId, isArbFinalDecline, mergeArbCallbackOutcome, parseArbInitialResponse } from '@/lib/payments/providers/alrajhi-arb';
import { providerMeta } from '@/lib/payments/registry';

const resourceKey = '12345678901234567890123456789012';

describe('Al Rajhi ARB bank-hosted provider', () => {
  it('encrypts and decrypts the bank trandata with the documented resource key', () => {
    const plain = JSON.stringify({ amt: '10.00', action: '1', trackId: '42' });
    const encrypted = encryptArbTrandata(plain, resourceKey);

    expect(encrypted).not.toContain('10.00');
    expect(encrypted).toMatch(/^[0-9A-F]+$/);
    expect(decryptArbTrandata(encrypted, resourceKey)).toBe(plain);
  });

  it('uses the payment id and hosted page URL returned by the bank', () => {
    expect(parseArbInitialResponse([{ status: '1', result: '100201931620827468:https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm' }])).toEqual({
      paymentId: '100201931620827468',
      redirectUrl: 'https://securepayments.alrajhibank.com.sa/pg/paymentpage.htm?PaymentID=100201931620827468',
    });
  });

  it('leaves optional user-defined fields out of the initial bank-hosted request', () => {
    const payload = JSON.parse(buildArbPurchaseTrandata({ amountSar: 10, topupId: 1700000000000123, callbackUrl: 'https://trbhh.sa/callback' }, {
      tranportal_id: 'portal-id', tranportal_password: 'portal-password',
    }));

    expect(payload[0]).toMatchObject({ trackId: '1700000000000123', amt: '10.00' });
    expect(payload[0]).not.toHaveProperty('udf1');
  });

  it('keeps the original merchant TrackID when it inquires by the original ARB payment ID', () => {
    const payload = JSON.parse(buildArbInquiryTrandata({
      amountSar: 10,
      transactionId: '201931951332346',
      trackId: '1700000000000123',
    }, { tranportal_id: 'portal-id', tranportal_password: 'portal-password' }));

    expect(payload[0]).toMatchObject({
      action: '8',
      amt: '10.00',
      currencyCode: '682',
      trackId: '1700000000000123',
      udf5: 'PaymentID',
      transId: '201931951332346',
    });
  });

  it('accepts a callback when the outer notification id differs from the encrypted transaction id', () => {
    const trandata = encryptArbTrandata(JSON.stringify({ paymentId: '123', trackId: '42', result: 'CAPTURED' }), resourceKey);
    expect(decodeArbCallback({ paymentId: '123', trandata }, resourceKey)).toMatchObject({ paymentId: '123', trackId: '42', result: 'CAPTURED' });
    // ARB's Bank Hosted notification sample uses different outer and inner payment IDs.
    // The encrypted transaction id is verified later through the server-to-server inquiry.
    expect(decodeArbCallback({ paymentId: '124', trandata }, resourceKey)).toMatchObject({ paymentId: '123', trackId: '42', result: 'CAPTURED' });
    expect(extractArbCallbackPaymentId({ paymentId: '124', trandata })).toBe('124');
  });

  it('accepts the documented array-shaped merchant notification from ARB', () => {
    const trandata = encryptArbTrandata(JSON.stringify([{ paymentId: '123', trackId: '42', result: 'CAPTURED' }]), resourceKey);
    expect(decodeArbCallback([{ paymentId: '123', trandata }], resourceKey)).toMatchObject({ paymentId: '123', trackId: '42', result: 'CAPTURED' });
  });

  it('recognizes an explicit issuer security decline as final, but not a captured payment', () => {
    expect(isArbFinalDecline({ errorText: 'Transaction declined: security settings' })).toBe(true);
    expect(isArbFinalDecline({ errorText: 'عملية مرفوضة بسبب اعدادات الامان' })).toBe(true);
    expect(isArbFinalDecline({ result: 'CAPTURED' })).toBe(false);
  });

  it('uses a final rejection returned in the outer ARB response envelope even when encrypted data has no error text', () => {
    const outcome = mergeArbCallbackOutcome(
      { paymentId: '1001', transId: '2001', trackId: '93', result: 'NOT CAPTURED' },
      [{ paymentId: '1001', errorText: 'Transaction declined: security settings', error: 'IPAY0200001' }],
    );
    expect(isArbFinalDecline(outcome)).toBe(true);
    expect(outcome.errorText).toBe('Transaction declined: security settings');
  });

  it('preserves alternate ARB issuer-code field names for the member rejection message', () => {
    const outcome = mergeArbCallbackOutcome(
      { paymentId: '1001', transId: '2001', trackId: '93', result: 'DECLINED' },
      [{ paymentId: '1001', ErrorCode: '51', RespCode: '51' }],
    );
    expect(arbStatusText(outcome)).toContain('51');
  });

  it('keeps exactly the field names supplied by the bank', () => {
    expect(providerMeta('alrajhi_arb')?.creds.map((field) => field.label)).toEqual([
      'Terminal ID', 'Terminal Name', 'Merchant ID', 'Terminal Alias Name',
      'Tranportal ID', 'Tranportal Password', 'Terminal Resource Key',
    ]);
  });
});
