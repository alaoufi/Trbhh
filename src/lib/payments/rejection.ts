export type PaymentRejection = {
  code: 'insufficient_funds' | 'card_blocked' | 'security_restricted' | 'invalid_card' | 'cancelled' | 'declined' | 'verification_pending';
  message: string;
  final: boolean;
};

const rejection = (code: PaymentRejection['code'], message: string): PaymentRejection => ({ code, message, final: true });

// ARB/Neoleap issuer and gateway codes are translated here only for a final
// rejection. Codes remain in the admin record and are never shown to members.
const GATEWAY_MESSAGES: Record<string, PaymentRejection> = {
  IPAY0100042: rejection('declined', 'انتهت صلاحية صفحة الدفع لطول بقائها مفتوحة. ابدأ الطلب من جديد وأكمله خلال دقائق.'),
  IPAY0100282: rejection('declined', 'هذه البطاقة من نوع لا يقبله المتجر حاليًا. استعمل بطاقة مدى.'),
  IPAY0100013: rejection('declined', 'تعذّر بدء العملية لدى البوابة. تواصل معنا.'),
  IPAY0100007: rejection('declined', 'تعذّر التحقّق من بيانات المتجر لدى البوابة. تواصل معنا.'),
};
const MADA_MESSAGES: Record<string, PaymentRejection> = {
  '101': rejection('invalid_card', 'البطاقة منتهية الصلاحية. استعمل بطاقة سارية.'),
  '106': rejection('security_restricted', 'تجاوزت عدد محاولات الرقم السرّي. اتصل بالبنك المُصدر للبطاقة.'),
  '111': rejection('invalid_card', 'رقم البطاقة غير صحيح. راجع الرقم وأعد المحاولة.'),
  '116': rejection('insufficient_funds', 'المبلغ يتجاوز الرصيد المتاح. جرّب بطاقة أخرى أو تحقّق من رصيدك.'),
  '117': rejection('invalid_card', 'الرقم السرّي غير صحيح.'),
  '119': rejection('security_restricted', 'بنكك لا يسمح لهذه البطاقة بالشراء عبر الإنترنت. فعّل «الشراء عبر الإنترنت» من تطبيق بنكك ثم أعد المحاولة.'),
  '121': rejection('security_restricted', 'المبلغ يتجاوز الحدّ اليومي لبطاقتك. راجع حدود الشراء في تطبيق بنكك.'),
  '123': rejection('security_restricted', 'تجاوزت عدد العمليات المسموح اليوم. حاول غدًا أو جرّب بطاقة أخرى.'),
};
const ISO_MESSAGES: Record<string, PaymentRejection> = {
  '01': rejection('declined', 'رفض البنك العملية. اتصل بالبنك المُصدر للبطاقة.'), '03': rejection('declined', 'هذا المتجر غير مقبول لدى بنك البطاقة. جرّب بطاقة أخرى.'),
  '04': rejection('card_blocked', 'البطاقة محجوزة. اتصل بالبنك المُصدر لها.'), '05': rejection('declined', 'رفض البنك العملية بلا سبب معلن. اتصل بالبنك أو جرّب بطاقة أخرى.'),
  '12': rejection('declined', 'العملية غير مقبولة على هذه البطاقة. جرّب بطاقة أخرى.'), '13': rejection('declined', 'المبلغ غير مقبول. راجع المبلغ وأعد المحاولة.'),
  '14': rejection('invalid_card', 'رقم البطاقة غير صحيح. راجع الرقم وأعد المحاولة.'), '30': rejection('declined', 'خطأ في صيغة البيانات المرسلة. أعد المحاولة، وإن تكرّر فتواصل معنا.'),
  '41': rejection('card_blocked', 'البطاقة مُبلَّغ عن فقدانها. اتصل بالبنك المُصدر لها.'), '43': rejection('card_blocked', 'البطاقة مُبلَّغ عن سرقتها. اتصل بالبنك المُصدر لها.'),
  '51': rejection('insufficient_funds', 'المبلغ يتجاوز الرصيد المتاح. جرّب بطاقة أخرى أو تحقّق من رصيدك.'), '54': rejection('invalid_card', 'البطاقة منتهية الصلاحية. استعمل بطاقة سارية.'),
  '55': rejection('invalid_card', 'الرقم السرّي غير صحيح.'), '57': rejection('security_restricted', 'البطاقة غير مفعّلة للشراء عبر الإنترنت. فعّلها من تطبيق بنكك ثم أعد المحاولة.'),
  '61': rejection('security_restricted', 'المبلغ يتجاوز الحدّ المسموح لبطاقتك. راجع حدود الشراء في تطبيق بنكك.'), '62': rejection('card_blocked', 'البطاقة أو الحساب موقوف أو مقيّد. اتصل بالبنك المُصدر للبطاقة.'),
  '65': rejection('security_restricted', 'تجاوزت عدد العمليات المسموح اليوم. حاول غدًا أو جرّب بطاقة أخرى.'), '75': rejection('security_restricted', 'تجاوزت عدد محاولات الرقم السرّي. اتصل بالبنك المُصدر للبطاقة.'),
  '78': rejection('card_blocked', 'البطاقة غير مفعّلة أو الحساب موقوف. فعّلها من تطبيق بنكك أو اتصل به.'), '82': rejection('invalid_card', 'رمز التحقّق (CVV) غير صحيح. راجع الأرقام الثلاثة خلف البطاقة.'),
  '91': rejection('declined', 'بنك البطاقة لا يستجيب حاليًا. أعد المحاولة بعد قليل.'), '96': rejection('declined', 'عطل مؤقّت لدى شبكة الدفع. أعد المحاولة بعد قليل.'),
};

function documentedCodeMessage(status: string): PaymentRejection | null {
  const ipay = status.match(/\bIPAY\d{7}\b/i)?.[0]?.toUpperCase();
  if (ipay && GATEWAY_MESSAGES[ipay]) return GATEWAY_MESSAGES[ipay];
  if (/\bEXPIRED\b/.test(status)) return GATEWAY_MESSAGES.IPAY0100042;
  if (/\bBRAND\b/.test(status)) return GATEWAY_MESSAGES.IPAY0100282;
  const code = status.match(/(?:AUTHRESPCODE|RESP(?:ONSE)?CODE|RESPCODE)\s*[=:]?\s*(\d{2,3})/i)?.[1]
    || status.match(/(?:^|\s)(\d{3})(?:\s|$)/)?.[1]
    || status.match(/(?:^|\s)(\d{2})(?:\s|$)/)?.[1];
  if (!code) return null;
  return (code.length === 3 ? MADA_MESSAGES[code] : ISO_MESSAGES[code]) || null;
}

/** Converts trusted gateway outcomes to safe, actionable Arabic messages. */
export function classifyPaymentRejection(rawStatus: string | null | undefined): PaymentRejection {
  const status = String(rawStatus || '').trim().toUpperCase();
  const documented = documentedCodeMessage(status);
  if (documented) return documented;
  if (/CAPTURED|TRACK_MISMATCH|AMOUNT_MISMATCH|INQUIRY|CONFIGURATION|TIMEOUT|NETWORK|UNVERIFIED|UNKNOWN/.test(status)) {
    return { code: 'verification_pending', final: false, message: 'تعذر التحقق من العملية مؤقتاً. لم يُضف أي رصيد؛ أعد المحاولة بعد قليل.' };
  }
  // ISO 8583 code 51 is the issuer response for insufficient funds. ARB may
  // send it separately from the generic "DECLINED" result.
  if (/INSUFFICIENT|NOT SUFFICIENT|LOW BALANCE|NO FUNDS|\b51\b/.test(status)) {
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
