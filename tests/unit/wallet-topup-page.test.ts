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
    expect(source).toContain('اشحن رصيدك الآن');
    expect(source).toContain('إتمام الدفع وشحن الرصيد');
    expect(source).toContain('payment-card-symbolic.webp');
    expect(source).toContain('بطاقة صراف الراجحي مدى رمزية');
    expect(source).toContain('Apple Pay');
    expect(source).toContain('STC Pay');
    expect(source).not.toContain('الدفع الآمن الآن');
  });

  it('has a separate payment result page rather than trusting the browser callback', () => {
    const file = resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx');
    expect(existsSync(file)).toBe(true);
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('getTopupById');
    expect(source).toContain('تم شحن الرصيد بنجاح');
    expect(source).toContain('تم رفض شحن الرصيد');
  });

  it('does not ask a member or an administrator to confirm an electronic payment manually', () => {
    const file = resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx');
    const source = readFileSync(file, 'utf8');
    expect(source).toContain('const failed = !success');
    expect(source).not.toContain('httpEquiv="refresh"');
  });

  it('keeps unresolved electronic payments out of the manual top-up administration queue', () => {
    const wallet = readFileSync(resolve(import.meta.dirname, '../../src/lib/wallet.ts'), 'utf8');
    const admin = readFileSync(resolve(import.meta.dirname, '../../src/app/admin/topups/page.tsx'), 'utf8');
    expect(wallet).toContain("source === 'online'");
    expect(wallet).toContain('completedForSource');
    expect(admin).not.toContain('visibleOnlinePending');
  });

  it('keeps bank transfers server-side disabled when the administrator turns them off', () => {
    const actions = readFileSync(resolve(import.meta.dirname, '../../src/app/account/actions.ts'), 'utf8');
    expect(actions).toContain('getTopupMethodAvailability');
    expect(actions).toContain("error=transferoff");
  });

  it('separates confirmed transfers from electronic top-ups in the administration view', () => {
    const admin = readFileSync(resolve(import.meta.dirname, '../../src/app/admin/topups/page.tsx'), 'utf8');
    expect(admin).toContain('الحوالات المؤكدة');
    expect(admin).toContain('عمليات الشحن الإلكتروني');
    expect(admin).toContain('source=online');
  });

  it('supports STC Pay in the Al Rajhi hosted payment terminal and explains final electronic records', () => {
    const registry = readFileSync(resolve(import.meta.dirname, '../../src/lib/payments/registry.ts'), 'utf8');
    const admin = readFileSync(resolve(import.meta.dirname, '../../src/app/admin/topups/page.tsx'), 'utf8');
    const alrajhi = registry.slice(registry.indexOf("id: 'alrajhi_arb'"), registry.indexOf("id: 'neoleap'"));
    expect(alrajhi).toContain("methods: ['mada', 'visa', 'mastercard', 'applepay', 'stcpay']");
    const arb = readFileSync(resolve(import.meta.dirname, '../../src/lib/payments/providers/alrajhi-arb.ts'), 'utf8');
    expect(arb).toContain("card.includes('stc')");
    expect(admin).toContain('تحفظ عمليات الرفض الإلكتروني لمدة 7 أيام');
    expect(admin).toContain('الرصيد الحالي للعضو الآن');
    expect(admin).toContain('وقت الشحن');
  });

  it('takes a successful member directly to the wallet from the final payment result', () => {
    const result = readFileSync(resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx'), 'utf8');
    expect(result).toContain('>محفظتي</Link>');
  });

  it('never presents a third pending-confirmation outcome for electronic payments', () => {
    const result = readFileSync(resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx'), 'utf8');
    expect(result).not.toContain('جار التحقق من الدفع آلياً');
    expect(result).not.toContain('httpEquiv="refresh"');
    expect(result).toContain("const failed = !success");
  });

  it('gives a declined card payment the three next actions requested by the member', () => {
    const result = readFileSync(resolve(import.meta.dirname, '../../src/app/payment/result/page.tsx'), 'utf8');
    expect(result).toContain('تجربة بطاقة أخرى');
    expect(result).toContain('التحويل البنكي');
    expect(result).toContain('الصفحة الرئيسية');
  });
});
