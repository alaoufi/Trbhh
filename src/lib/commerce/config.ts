import { parseSar } from './money';
/** Defaults are editable through the commerce administration, never wallet settings. */
export const COMMERCE_DEFAULTS = {
  commerce_enabled: '0',
  commerce_payments_enabled: '0',
  // مفتاح مركزي للشراء (افتراضي معطّل). عندما يكون '0' يُمنع أي شراء حقيقي
  // (إنشاء طلب/بدء دفع) من الخادم مهما كانت بقية الإعدادات — العرض والاستيراد
  // والمزامنة والاختبارات الداخلية تبقى متاحة. يفعّله المشرف يدوياً فقط.
  commerce_purchasing_enabled: '0',
  commerce_notifications_enabled: '0',
  commerce_admin_phone: '',
  commerce_title: 'سلع تربح المعتمدة',
  commerce_description: 'شراء مباشر من تربح. الإعلانات الأخرى للتواصل والاتفاق خارج الموقع.',
  commerce_buy_label: 'متابعة الطلب',
  commerce_unavailable_text: 'الشراء المباشر غير متاح حاليًا.',
  commerce_purchasing_disabled_text: 'الشراء غير متاح حاليًا، المتجر في مرحلة التجهيز.',
  commerce_shipping_terms: '',
  commerce_shipping_fee_sar: '',
  commerce_checkout_error_text: 'تعذر إنشاء الطلب. تحقق من البيانات والكمية المتاحة، ثم أعد المحاولة. لم يبدأ الدفع.',
  commerce_rate_limit_text: 'محاولات كثيرة؛ انتظر عشر دقائق ثم أعد المحاولة. لم يبدأ الدفع.',
  commerce_location_error_text: 'اختر المنطقة ثم مدينة تابعة لها داخل المملكة.',
  commerce_payment_pending_text: 'طلبك مسجّل. لا تُعِد الدفع أثناء التحقق من العملية.',
  commerce_payment_action_required_text: 'تعذر حسم نتيجة الدفع. تواصل مع دعم تربح واذكر رقم الطلب لمراجعة العملية، ولا تُعِد الدفع.',
  commerce_payment_rate_limit_text: 'بلغت حد محاولات التحقق. انتظر عشر دقائق ثم تحقق مجددًا، ولا تُعِد الدفع أثناء انتظار النتيجة.',
  commerce_payment_unavailable_text: 'خدمة الدفع أو التحقق غير متاحة حاليًا. حاول التحقق لاحقًا أو تواصل مع دعم تربح؛ هذه الرسالة لا تؤكد نجاح الدفع أو فشله.',
  commerce_payment_confirmed_text: 'تم تأكيد دفع طلبك لدى تربح.',
  commerce_paid_message: 'تربح: تم تأكيد دفع الطلب {order} بمبلغ {amount} ر.س. مرجع الدفع: {reference}',
} as const;

export type CommerceSettingKey = keyof typeof COMMERCE_DEFAULTS;
export type SettingRow = { k: string; v: string | null };

export function saudiCommercePhone(value: string): string | null {
  let digits = value.trim().replace(/[ +()-]/g, '');
  if (digits.startsWith('00966')) digits = digits.slice(2);
  if (/^05\d{8}$/.test(digits)) digits = `966${digits.slice(1)}`;
  return /^9665\d{8}$/.test(digits) ? digits : null;
}

export function commerceConfigFromRows(rows: SettingRow[]) {
  const values = new Map(rows.map(({ k, v }) => [k, v]));
  const get = (key: CommerceSettingKey): string => values.get(key) ?? COMMERCE_DEFAULTS[key];
  let shippingFeeMinor: number | null = null;
  try { shippingFeeMinor = parseSar(get('commerce_shipping_fee_sar')); } catch { /* explicit fee required, even zero */ }
  return {
    enabled: get('commerce_enabled') === '1',
    paymentsEnabled: get('commerce_payments_enabled') === '1',
    purchasingEnabled: get('commerce_purchasing_enabled') === '1',
    notificationsEnabled: get('commerce_notifications_enabled') === '1',
    adminPhone: saudiCommercePhone(get('commerce_admin_phone')),
    shippingFeeMinor,
    text: {
      title: get('commerce_title'), description: get('commerce_description'),
      buy: get('commerce_buy_label'), unavailable: get('commerce_unavailable_text'),
      purchasingDisabled: get('commerce_purchasing_disabled_text'),
      shippingTerms: get('commerce_shipping_terms'), pending: get('commerce_payment_pending_text'),
      confirmed: get('commerce_payment_confirmed_text'), paidMessage: get('commerce_paid_message'),
      paymentActionRequired: get('commerce_payment_action_required_text'),
      paymentRateLimit: get('commerce_payment_rate_limit_text'),
      paymentUnavailable: get('commerce_payment_unavailable_text'),
      checkoutError: get('commerce_checkout_error_text'), rateLimit: get('commerce_rate_limit_text'), locationError: get('commerce_location_error_text'),
    },
  };
}

export type CommerceConfig = ReturnType<typeof commerceConfigFromRows>;

export function commerceReadiness(config: CommerceConfig, checks: { schemaReady: boolean; gatewayVerified: boolean }) {
  const reason = !config.enabled ? 'disabled'
    : !checks.schemaReady ? 'schema_unavailable'
      : !config.paymentsEnabled ? 'payments_disabled'
        : !checks.gatewayVerified ? 'gateway_unverified' : null;
  return { ready: reason === null, reason };
}
