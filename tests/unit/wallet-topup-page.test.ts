import { describe, expect, it } from 'vitest';
import { walletTopupView } from '@/lib/wallet-topup-view';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('wallet top-up presentation policy', () => {
  it('offers fixed amounts alongside a custom amount when electronic payment is available', () => {
    expect(walletTopupView({ electronic: true, transfer: true })).toEqual({
      showElectronic: true,
      showBankTransfer: true,
      quickAmounts: [10, 50, 100, 500, 1000],
    });
  });

  it('keeps bank transfer available when electronic payment is disabled', () => {
    expect(walletTopupView({ electronic: false, transfer: true })).toEqual({
      showElectronic: false,
      showBankTransfer: true,
      quickAmounts: [10, 50, 100, 500, 1000],
    });
  });

  it('has a dedicated component for the electronic checkout card', () => {
    const file = resolve(import.meta.dirname, '../../src/components/wallet-online-topup.tsx');
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('WALLET_TOPUP_QUICK_AMOUNTS');
    expect(source).toContain('الدفع الآمن الآن');
  });

  it('has a separate payment result page rather than trusting the browser callback', () => {
    const file = resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx');
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('getTopupById');
    expect(source).toContain('تم الدفع بنجاح');
  });

  it('does not ask a member or an administrator to confirm a pending electronic payment manually', () => {
    const file = resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx');
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('التحقق آلياً');
    expect(source).toContain('httpEquiv="refresh"');
  });
});
