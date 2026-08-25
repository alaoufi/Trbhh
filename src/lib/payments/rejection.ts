export type PaymentRejection = {
  code: 'insufficient_funds' | 'card_blocked' | 'security_restricted' | 'invalid_card' | 'cancelled' | 'declined' | 'verification_pending';
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
    return { code: 'insufficient_funds', final: true, message: 'تم رفض شحن الرصيد بسبب عدم كفاية الرصيد في البطاقة.' };
  }
  if (/BLOCK|CLOSED|RESTRICT|SUSPEND|INACTIVE/.test(status)) {
    return { code: 'card_blocked', final: true, message: 'تم رفض شحن الرصيد لأن البطاقة موقوفة أو غير مسموح لها بالدفع الإلكتروني. تواصل مع البنك.' };
  }
  if (/SECURITY|3D\s*SECURE|3DS|AUTHENTICATION|OTP|ECOMMERCE|E-?COMMERCE|ONLINE PAYMENT|NOT PERMITTED|إعدادات?\s*الأمان|اعدادات?\s*الامان/.test(status)) {
    return { code: 'security_restricted', final: true, message: 'تم رفض شحن الرصيد بسبب إعدادات أمان البطاقة أو عدم السماح بالشراء الإلكتروني. فعّل الشراء الإلكتروني من تطبيق البنك أو استخدم بطاقة أخرى.' };
  }
  if (/INVALID|WRONG|EXPIRED|CVV|CVC|CARD NUMBER/.test(status)) {
    return { code: 'invalid_card', final: true, message: 'تم رفض شحن الرصيد بسبب خطأ في بيانات البطاقة. أعد إدخال بيانات البطاقة مرة أخرى.' };
  }
  if (/CANCEL|CANCELED|CANCELLED/.test(status)) {
    return { code: 'cancelled', final: true, message: 'تم إلغاء عملية شحن الرصيد. لم يُضف أي مبلغ إلى رصيدك.' };
  }
  return { code: 'declined', final: true, message: 'تم رفض شحن الرصيد من البنك بسبب غير محدد. استخدم بطاقة أخرى أو تواصل مع البنك لمعرفة سبب الرفض.' };
}
