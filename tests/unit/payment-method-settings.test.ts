import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

  it('gives bank transfers their own visible independent on/off control in administration', () => {
    const page = resolve(import.meta.dirname, '../../src/app/admin/payments/page.tsx');
    const actions = resolve(import.meta.dirname, '../../src/app/admin/actions.ts');
    expect(existsSync(page)).toBe(true);
    expect(readFileSync(page, 'utf8')).toContain('تفعيل الحوالات البنكية');
    expect(readFileSync(page, 'utf8')).toContain('حفظ إعداد الحوالات البنكية');
    expect(readFileSync(actions, 'utf8')).toContain('saveBankTransferSettingAction');
  });
});
