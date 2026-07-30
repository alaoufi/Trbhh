/**
 * أنواع طبقة الدفع الإلكتروني (بوابات الدفع) — مجرّدة عن أي مزوّد بعينه.
 *
 * الفكرة: كل مزوّد (Moyasar/Tap/PayTabs/…) يُنفّذ الواجهة `PayProvider` نفسها، فتبقى بقية
 * المنصّة (المحفظة/الشحن/الـ API) لا تعرف تفاصيل أي شركة — نشغّل/نطفئ ونبدّل المزوّد من
 * لوحة الإدارة دون لمس الكود.
 */

/** معرّفات المزوّدين المدعومين/المخطّطين. */
export type PayProviderId = 'moyasar' | 'tap' | 'paytabs' | 'hyperpay' | 'tabby' | 'tamara';

/** وسائل الدفع الفعلية التي قد تدعمها البوابة. */
export type PayMethod = 'mada' | 'visa' | 'mastercard' | 'applepay' | 'stcpay' | 'googlepay' | 'tabby' | 'tamara' | 'card';

/** وضع التشغيل: تجريبي (مفاتيح اختبار) أو مباشر (أموال حقيقية). */
export type PayMode = 'test' | 'live';

/** بيانات اعتماد مزوّد (تُقرأ من الإعدادات — يملؤها الأدمن من لوحة المزوّد). */
export type ProviderCreds = Record<string, string>;

/** مدخلات إنشاء عملية دفع لشحن رصيد. */
export interface CreatePaymentInput {
  amountSar: number;      // المبلغ بالريال السعودي (عدد صحيح ريالات)
  topupId: number;        // معرّف طلب الشحن (wallet_topups.id) — يُمرَّر ذهاباً وإياباً
  description: string;    // وصف يظهر للعميل وفي لوحة المزوّد
  callbackUrl: string;    // رابط عودة المتصفح بعد الدفع (يتحقّق ويعتمد)
  webhookUrl: string;     // رابط إشعار خادم-لخادم (تأكيد موثوق من المزوّد)
  methods?: PayMethod[];  // الوسائل المسموح بها (يختارها الأدمن) — تُقيّد صفحة الدفع عليها
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

/** نتيجة إنشاء عملية الدفع. */
export interface CreatePaymentResult {
  ok: boolean;
  redirectUrl?: string;   // نوجّه المتصفح إليه لإتمام الدفع (صفحة البوابة المستضافة)
  providerRef?: string;   // معرّف العملية لدى المزوّد (يُحفظ للتحقّق لاحقاً)
  error?: string;
}

/** نتيجة التحقّق من حالة عملية (تُسحب من المزوّد — لا نثق بمعطيات المتصفح). */
export interface VerifyResult {
  paid: boolean;          // هل اكتمل الدفع فعلاً؟
  amountSar: number;      // المبلغ المدفوع فعلاً (للمطابقة مع الطلب)
  providerRef: string;
  method?: PayMethod | null;
  status: string;         // حالة المزوّد الخام (للسجل)
}

/** واجهة المزوّد الموحّدة. */
export interface PayProvider {
  id: PayProviderId;
  /** ينشئ عملية دفع ويعيد رابط صفحة الدفع المستضافة. */
  createPayment(input: CreatePaymentInput, creds: ProviderCreds, mode: PayMode): Promise<CreatePaymentResult>;
  /** يتحقّق من حالة عملية بمعرّفها لدى المزوّد (المصدر الموثوق للتأكيد). */
  verifyByRef(providerRef: string, creds: ProviderCreds, mode: PayMode): Promise<VerifyResult>;
  /** يستخرج معرّف العملية من جسم إشعار الويبهوك (لإعادة التحقّق منه). */
  extractRefFromWebhook(body: unknown, query: URLSearchParams): string | null;
}

/** حقل اعتماد مطلوب من المزوّد (لعرضه وتعبئته في لوحة الإدارة). */
export interface CredField {
  key: string;            // مفتاح التخزين (يُخزَّن كـ pay_<provider>_<key>)
  label: string;          // الاسم الظاهر للأدمن
  secret: boolean;        // سرّي؟ (يُقنَّع في الواجهة ولا يُعاد إظهاره)
  placeholder?: string;
  hint?: string;
}

/** بطاقة تعريف مزوّد: اسمه، جاهزيته، وسائله، وما يحتاجه من الشركة (مفاتيح/إعدادات). */
export interface ProviderMeta {
  id: PayProviderId;
  name: string;           // الاسم العربي
  nameEn: string;
  ready: boolean;         // هل مُحوِّل الكود جاهز للتشغيل الآن؟ (وإلا «قيد التجهيز»)
  kind: 'gateway' | 'bnpl'; // بوابة بطاقات أم تقسيط (اشترِ الآن وادفع لاحقاً)
  methods: PayMethod[];   // وسائل الدفع التي تتيحها الشركة
  creds: CredField[];     // ما تحتاجه الشركة لتفعيلها
  docsUrl: string;        // توثيق المزوّد
  notes: string;          // ملاحظات تفاوض/تهيئة موجزة
}
