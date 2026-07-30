import type { ProviderMeta } from './types';

/**
 * كتالوج مزوّدي الدفع في السوق السعودي — «ماذا تحتاج كل شركة لتفعيلها».
 *
 * هذا المرجع يقود لوحة الإدارة: يعرض كل مزوّد، وسائله، والحقول المطلوبة منه (تأخذها من
 * لوحة المزوّد بعد الاشتراك)، ورابط توثيقه. المزوّدون بـ `ready:true` جاهزون للتشغيل فوراً؛
 * الباقون «قيد التجهيز» (نضيف مُحوِّلهم عند إغلاق التفاوض) لكنهم مُدرَجون بمتطلّباتهم للتخطيط.
 *
 * ملاحظة أمان: المفاتيح السرّية تُحفظ في جدول الإعدادات (خارج المستودع) وتُقنَّع في الواجهة —
 * لا تُكتب أي مفاتيح في الكود.
 */
export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'moyasar',
    name: 'ميسّر',
    nameEn: 'Moyasar',
    ready: true,
    kind: 'gateway',
    methods: ['mada', 'visa', 'mastercard', 'applepay', 'stcpay'],
    docsUrl: 'https://docs.moyasar.com',
    notes: 'الأبسط للربط. يدعم مدى وآبل باي وSTC Pay. المفتاح السرّي يبدأ بـ sk_ والعلني بـ pk_.',
    creds: [
      { key: 'secret_key', label: 'المفتاح السرّي (Secret API Key)', secret: true, placeholder: 'sk_live_… أو sk_test_…', hint: 'من لوحة ميسّر ← Settings ← API Keys' },
      { key: 'publishable_key', label: 'المفتاح العلني (Publishable Key)', secret: false, placeholder: 'pk_live_… أو pk_test_…' },
      { key: 'webhook_secret', label: 'سرّ الويبهوك (Webhook Secret)', secret: true, placeholder: 'اختياري — للتحقّق من الإشعارات', hint: 'من لوحة ميسّر ← Webhooks' },
    ],
  },
  {
    id: 'tap',
    name: 'تاب',
    nameEn: 'Tap Payments',
    ready: true,
    kind: 'gateway',
    methods: ['mada', 'visa', 'mastercard', 'applepay', 'stcpay'],
    docsUrl: 'https://developers.tap.company',
    notes: 'واسع الانتشار خليجياً. يدعم مدى وآبل باي وSTC Pay. المفتاح السرّي يبدأ بـ sk_.',
    creds: [
      { key: 'secret_key', label: 'المفتاح السرّي (Secret Key)', secret: true, placeholder: 'sk_live_… أو sk_test_…', hint: 'من لوحة Tap ← Developers ← API Credentials' },
      { key: 'public_key', label: 'المفتاح العلني (Public Key)', secret: false, placeholder: 'pk_live_… أو pk_test_…' },
    ],
  },
  {
    id: 'paytabs',
    name: 'باي تابس',
    nameEn: 'PayTabs',
    ready: true,
    kind: 'gateway',
    methods: ['mada', 'visa', 'mastercard', 'applepay'],
    docsUrl: 'https://site.paytabs.com/en/developers/',
    notes: 'يتطلّب رقم الملف (Profile ID) والمفتاح السرّي (Server Key). المنطقة: السعودية (secure.paytabs.sa).',
    creds: [
      { key: 'profile_id', label: 'رقم الملف (Profile ID)', secret: false, placeholder: '123456', hint: 'من لوحة PayTabs ← Merchant Profile' },
      { key: 'server_key', label: 'المفتاح السرّي (Server Key)', secret: true, placeholder: 'SxxxxxxKEY', hint: 'PayTabs ← Developers ← Key Management' },
    ],
  },
  {
    id: 'hyperpay',
    name: 'هايبر باي',
    nameEn: 'HyperPay',
    ready: false,
    kind: 'gateway',
    methods: ['mada', 'visa', 'mastercard', 'applepay', 'stcpay'],
    docsUrl: 'https://docs.hyperpay.com',
    notes: 'قيد التجهيز. يحتاج Access Token و«Entity ID» منفصلاً لكل وسيلة (مدى/بطاقات/آبل باي) عبر COPYandPAY.',
    creds: [
      { key: 'access_token', label: 'رمز الوصول (Access Token)', secret: true, placeholder: 'Bearer token' },
      { key: 'entity_card', label: 'Entity ID للبطاقات', secret: false },
      { key: 'entity_mada', label: 'Entity ID لمدى', secret: false },
    ],
  },
  {
    id: 'tabby',
    name: 'تابي (تقسيط)',
    nameEn: 'Tabby',
    ready: false,
    kind: 'bnpl',
    methods: ['tabby'],
    docsUrl: 'https://docs.tabby.ai',
    notes: 'قيد التجهيز. اشترِ الآن وادفع لاحقاً — يحتاج Public/Secret Key ورمز المتجر (Merchant Code).',
    creds: [
      { key: 'secret_key', label: 'المفتاح السرّي', secret: true },
      { key: 'public_key', label: 'المفتاح العلني', secret: false },
      { key: 'merchant_code', label: 'رمز المتجر (Merchant Code)', secret: false },
    ],
  },
  {
    id: 'tamara',
    name: 'تمارا (تقسيط)',
    nameEn: 'Tamara',
    ready: false,
    kind: 'bnpl',
    methods: ['tamara'],
    docsUrl: 'https://docs.tamara.co',
    notes: 'قيد التجهيز. تقسيط — يحتاج API Token ورمز إشعار (Notification Token).',
    creds: [
      { key: 'api_token', label: 'رمز الـ API (API Token)', secret: true },
      { key: 'notification_token', label: 'رمز الإشعار (Notification Token)', secret: true },
    ],
  },
];

export function providerMeta(id: string): ProviderMeta | undefined {
  return PROVIDER_META.find((p) => p.id === id);
}

/** المزوّدون الجاهزون للتشغيل الآن (لهم مُحوِّل كود مكتمل). */
export function readyProviders(): ProviderMeta[] {
  return PROVIDER_META.filter((p) => p.ready);
}
