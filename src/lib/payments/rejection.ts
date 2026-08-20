export type PaymentRejection = {
  code: 'insufficient_funds' | 'card_blocked' | 'invalid_card' | 'cancelled' | 'declined' | 'verification_pending';
  message: string;
  final: boolean;
};

/** Converts trusted gateway outcomes to safe, actionable Arabic messages. */
export function classifyPaymentRejection(rawStatus: string | null | undefined): PaymentRejection {
  const status = String(rawStatus || '').trim().toUpperCase();
  if (/CAPTURED|TRACK_MISMATCH|AMOUNT_MISMATCH|INQUIRY|CONFIGURATION|TIMEOUT|NETWORK|UNVERIFIED|UNKNOWN/.test(status)) {
    return { code: 'verification_pending', final: false, message: 'تعذر التحقق من العملية مؤقتاً. لم يُضف أي رصيد؛ أعد المحاولة بعد قليل.' };
  }
  if (/INSUFFICIENT|NOT SUFFICIENT|LOW BALANCE|NO FUNDS/.test(status)) {
    return { code: 'insufficient_funds', final: true, message: 'لم يتوفر رصيد كافٍ في البطاقة لإتمام الدفع.' };
  }
  if (/BLOCK|CLOSED|RESTRICT|SUSPEND|INACTIVE/.test(status)) {
    return { code: 'card_blocked', final: true, message: 'البطاقة موقوفة أو غير مسموح لها بالدفع الإلكتروني. تواصل مع البنك.' };
  }
  if (/INVALID|WRONG|EXPIRED|CVV|CVC|CARD NUMBER/.test(status)) {
    return { code: 'invalid_card', final: true, message: 'بيانات البطاقة غير صحيحة. تحقق من الرقم وتاريخ الانتهاء ورمز الأمان.' };
  }
  if (/CANCEL|CANCELED|CANCELLED/.test(status)) {
    return { code: 'cancelled', final: true, message: 'أُلغيت عملية الدفع. لم يُضف أي مبلغ إلى الرصيد.' };
  }
  return { code: 'declined', final: true, message: 'رفض البنك عملية الدفع. استخدم بطاقة أخرى أو تواصل مع البنك لمعرفة سبب الرفض.' };
}
