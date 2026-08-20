import { describe, expect, it } from 'vitest';
import { readAlrajhiCallbackBody } from '@/lib/payments/alrajhi-callback';

describe('Al Rajhi sandbox callback body', () => {
  it('reads the bank form payload without consuming the request twice', async () => {
    const request = new Request('https://trbhh.sa/admin/payments/sandbox/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ paymentId: '123', trandata: 'encrypted-data' }),
    });

    await expect(readAlrajhiCallbackBody(request)).resolves.toEqual({ paymentId: '123', trandata: 'encrypted-data' });
  });

  it('preserves the documented JSON-array notification payload', async () => {
    const request = new Request('https://trbhh.sa/api/pay/callback/alrajhi_arb', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ paymentId: '123', trandata: 'encrypted-data' }]),
    });

    await expect(readAlrajhiCallbackBody(request)).resolves.toEqual([{ paymentId: '123', trandata: 'encrypted-data' }]);
  });
});
