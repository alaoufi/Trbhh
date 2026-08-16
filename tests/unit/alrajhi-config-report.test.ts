import { describe, expect, it } from 'vitest';
import { alrajhiConfigReport } from '@/lib/payments/config';

describe('Al Rajhi configuration report', () => {
  it('lists every required field without exposing its value', () => {
    const report = alrajhiConfigReport({ ALRAJHI_ENVIRONMENT: 'sandbox', ALRAJHI_MERCHANT_ID: 'merchant-123', ALRAJHI_TRANPORTAL_PASSWORD: 'secret-value' });
    expect(report.environment).toBe('sandbox');
    expect(report.fields.find((field) => field.key === 'ALRAJHI_MERCHANT_ID')).toMatchObject({ present: true, required: true });
    expect(report.fields.find((field) => field.key === 'ALRAJHI_TRANPORTAL_PASSWORD')).not.toHaveProperty('value');
    expect(report.ready).toBe(false);
  });

  it('is ready only when every required value is present', () => {
    const env = Object.fromEntries(['ALRAJHI_TERMINAL_ID', 'ALRAJHI_TERMINAL_NAME', 'ALRAJHI_MERCHANT_ID', 'ALRAJHI_TERMINAL_ALIAS_NAME', 'ALRAJHI_TRANPORTAL_ID', 'ALRAJHI_TRANPORTAL_PASSWORD', 'ALRAJHI_TERMINAL_RESOURCE_KEY', 'ALRAJHI_PAYMENT_GATEWAY_URL', 'DATABASE_PAYMENT_SECRET'].map((key) => [key, 'configured']));
    expect(alrajhiConfigReport({ ...env, ALRAJHI_ENVIRONMENT: 'production' }).ready).toBe(true);
  });

  it('accepts the exact sandbox field names issued by the ARB gateway', () => {
    const env = Object.fromEntries([
      'ALRAJHI_TERMINAL_ID', 'ALRAJHI_TERMINAL_NAME', 'ALRAJHI_MERCHANT_ID', 'ALRAJHI_TERMINAL_ALIAS_NAME',
      'ALRAJHI_TRANPORTAL_ID', 'ALRAJHI_TRANPORTAL_PASSWORD', 'ALRAJHI_TERMINAL_RESOURCE_KEY', 'ALRAJHI_PAYMENT_GATEWAY_URL', 'DATABASE_PAYMENT_SECRET',
    ].map((key) => [key, 'configured']));
    const report = alrajhiConfigReport({ ...env, ALRAJHI_ENVIRONMENT: 'sandbox' });
    expect(report.ready).toBe(true);
    expect(report.fields.map((field) => field.key)).toContain('ALRAJHI_TERMINAL_RESOURCE_KEY');
  });
});
