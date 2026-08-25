import { describe, expect, it } from 'vitest';
import { classifyPaymentRejection } from '@/lib/payments/rejection';

describe('payment rejection messages', () => {
  it('explains insufficient card balance without exposing the bank response', () => {
    expect(classifyPaymentRejection('INSUFFICIENT FUNDS')).toMatchObject({ final: true, code: 'insufficient_funds', message: 'تم رفض شحن الرصيد بسبب عدم كفاية الرصيد في البطاقة.' });
    expect(classifyPaymentRejection('Transaction declined: insufficient balance')).toMatchObject({ final: true, code: 'insufficient_funds', message: 'تم رفض شحن الرصيد بسبب عدم كفاية الرصيد في البطاقة.' });
    expect(classifyPaymentRejection('DECLINED 51')).toMatchObject({ final: true, code: 'insufficient_funds', message: 'تم رفض شحن الرصيد بسبب عدم كفاية الرصيد في البطاقة.' });
  });

  it('explains a bank-blocked card and invalid card data distinctly', () => {
    expect(classifyPaymentRejection('CARD BLOCKED BY ISSUER')).toMatchObject({ final: true, code: 'card_blocked', message: 'تم رفض شحن الرصيد لأن البطاقة موقوفة أو غير مسموح لها بالدفع الإلكتروني. تواصل مع البنك.' });
    expect(classifyPaymentRejection('INVALID CARD NUMBER')).toMatchObject({ final: true, code: 'invalid_card', message: 'تم رفض شحن الرصيد بسبب خطأ في بيانات البطاقة. أعد إدخال بيانات البطاقة مرة أخرى.' });
  });

  it('explains issuer security restrictions after OTP without blaming the platform', () => {
    expect(classifyPaymentRejection('Transaction declined: security settings')).toMatchObject({
      final: true,
      code: 'security_restricted',
      message: 'تم رفض شحن الرصيد بسبب إعدادات أمان البطاقة أو عدم السماح بالشراء الإلكتروني. فعّل الشراء الإلكتروني من تطبيق البنك أو استخدم بطاقة أخرى.',
    });
    expect(classifyPaymentRejection('عملية مرفوضة بسبب اعدادات الامان')).toMatchObject({ code: 'security_restricted' });
  });

  it('keeps temporary verification failures pending instead of rejecting or crediting', () => {
    expect(classifyPaymentRejection('inquiry_failed')).toMatchObject({ final: false, code: 'verification_pending' });
    expect(classifyPaymentRejection('CAPTURED')).toMatchObject({ final: false, code: 'verification_pending' });
  });
});
