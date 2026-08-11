import { describe, expect, it } from 'vitest';
import { paymentMethodPolicy } from '@/lib/payments/config';

describe('payment method activation policy', () => {
  it('keeps both top-up methods off until an administrator enables them', () => {
    expect(paymentMethodPolicy({ electronicEnabled: false, transferEnabled: false, alrajhiConfigured: true })).toEqual({ electronic: false, transfer: false, any: false });
  });

  it('allows transfer independently of electronic gateway configuration', () => {
    expect(paymentMethodPolicy({ electronicEnabled: false, transferEnabled: true, alrajhiConfigured: false })).toEqual({ electronic: false, transfer: true, any: true });
  });

  it('refuses electronic payment until the Al Rajhi environment is complete', () => {
    expect(paymentMethodPolicy({ electronicEnabled: true, transferEnabled: false, alrajhiConfigured: false })).toEqual({ electronic: false, transfer: false, any: false });
    expect(paymentMethodPolicy({ electronicEnabled: true, transferEnabled: false, alrajhiConfigured: true })).toEqual({ electronic: true, transfer: false, any: true });
  });
});
