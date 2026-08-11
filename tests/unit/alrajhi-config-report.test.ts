import { describe, expect, it } from 'vitest';
import { alrajhiConfigReport } from '@/lib/payments/config';

describe('Al Rajhi configuration report', () => {
  it('lists every required field without exposing its value', () => {
    const report = alrajhiConfigReport({ ALRAJHI_ENVIRONMENT: 'sandbox', ALRAJHI_MERCHANT_ID: 'merchant-123', ALRAJHI_PASSWORD: 'secret-value' });
    expect(report.environment).toBe('sandbox');
    expect(report.fields.find((field) => field.key === 'ALRAJHI_MERCHANT_ID')).toMatchObject({ present: true, required: true });
    expect(report.fields.find((field) => field.key === 'ALRAJHI_PASSWORD')).not.toHaveProperty('value');
    expect(report.ready).toBe(false);
  });

  it('is ready only when every required value is present', () => {
    const env = Object.fromEntries(['ALRAJHI_MERCHANT_ID', 'ALRAJHI_TERMINAL_ID', 'ALRAJHI_USERNAME', 'ALRAJHI_PASSWORD', 'ALRAJHI_SECRET_KEY', 'ALRAJHI_API_KEY', 'ALRAJHI_API_BASE_URL', 'ALRAJHI_HOSTED_PAYMENT_URL', 'DATABASE_PAYMENT_SECRET'].map((key) => [key, 'configured']));
    expect(alrajhiConfigReport({ ...env, ALRAJHI_ENVIRONMENT: 'production' }).ready).toBe(true);
  });
});
