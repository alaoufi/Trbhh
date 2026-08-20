import { describe, expect, it } from 'vitest';
import { classifyPaymentRejection } from '@/lib/payments/rejection';

describe('payment rejection messages', () => {
  it('explains insufficient card balance without exposing the bank response', () => {
    expect(classifyPaymentRejection('INSUFFICIENT FUNDS')).toMatchObject({ final: true, code: 'insufficient_funds', message: 'لم يتوفر رصيد كافٍ في البطاقة لإتمام الدفع.' });
  });

  it('explains a bank-blocked card and invalid card data distinctly', () => {
    expect(classifyPaymentRejection('CARD BLOCKED BY ISSUER')).toMatchObject({ final: true, code: 'card_blocked', message: 'البطاقة موقوفة أو غير مسموح لها بالدفع الإلكتروني. تواصل مع البنك.' });
    expect(classifyPaymentRejection('INVALID CARD NUMBER')).toMatchObject({ final: true, code: 'invalid_card', message: 'بيانات البطاقة غير صحيحة. تحقق من الرقم وتاريخ الانتهاء ورمز الأمان.' });
  });

  it('keeps temporary verification failures pending instead of rejecting or crediting', () => {
    expect(classifyPaymentRejection('inquiry_failed')).toMatchObject({ final: false, code: 'verification_pending' });
    expect(classifyPaymentRejection('CAPTURED')).toMatchObject({ final: false, code: 'verification_pending' });
  });
});
