import 'server-only';
import { getSetting, getSettingBool, getSettingNum, setSetting } from '@/lib/settings';
import { providerMeta, PROVIDER_META } from './registry';
import type { PayMethod, PayMode, PayProviderId, ProviderCreds } from './types';

/**
 * إعدادات الدفع الإلكتروني — كلها من جدول `settings` (قابلة للتحكم من لوحة الإدارة، وخارج
 * المستودع). المفاتيح السرّية تُخزَّن هنا ولا تُكتب في الكود إطلاقاً.
 *
 * مفاتيح الإعدادات:
 *   pay_online_on            مفتاح رئيسي: تفعيل الدفع الإلكتروني.
 *   pay_provider             المزوّد الفعّال (moyasar | tap | paytabs | …).
 *   pay_mode                 وضع التشغيل: test | live.
 *   pay_min / pay_max        حدّا مبلغ الشحن بالريال.
 *   pay_<provider>_<field>   بيانات اعتماد كل مزوّد (كما في الكتالوج).
 */
export const PAY_SETTING = {
  on: 'pay_online_on',
  electronicOn: 'payment_electronic_enabled',
  transferOn: 'payment_transfer_enabled',
  provider: 'pay_provider',
  mode: 'pay_mode',
  min: 'pay_min',
  max: 'pay_max',
  methods: 'pay_methods',
} as const;

export type PaymentMethodPolicyInput = { electronicEnabled: boolean; transferEnabled: boolean; alrajhiConfigured: boolean };
export type PaymentMethodPolicy = { electronic: boolean; transfer: boolean; any: boolean };

/** The bank transfer switch is independent; electronic payment also needs a complete bank configuration. */
export function paymentMethodPolicy(input: PaymentMethodPolicyInput): PaymentMethodPolicy {
  const electronic = input.electronicEnabled && input.alrajhiConfigured;
  const transfer = input.transferEnabled;
  return { electronic, transfer, any: electronic || transfer };
}

type EnvironmentValues = Record<string, string | undefined>;

export function alrajhiEnvironmentConfigured(env: EnvironmentValues = process.env): boolean {
  const mode = env.ALRAJHI_ENVIRONMENT;
  if (mode !== 'sandbox' && mode !== 'production') return false;
  return ['ALRAJHI_MERCHANT_ID', 'ALRAJHI_TERMINAL_ID', 'ALRAJHI_USERNAME', 'ALRAJHI_PASSWORD', 'ALRAJHI_SECRET_KEY', 'ALRAJHI_API_KEY', 'ALRAJHI_API_BASE_URL', 'ALRAJHI_HOSTED_PAYMENT_URL', 'DATABASE_PAYMENT_SECRET']
    .every((key) => (env[key] || '').trim().length > 0);
}

const ALRAJHI_REQUIRED_FIELDS = [
  'ALRAJHI_MERCHANT_ID', 'ALRAJHI_TERMINAL_ID', 'ALRAJHI_USERNAME', 'ALRAJHI_PASSWORD',
  'ALRAJHI_SECRET_KEY', 'ALRAJHI_API_KEY', 'ALRAJHI_API_BASE_URL', 'ALRAJHI_HOSTED_PAYMENT_URL', 'DATABASE_PAYMENT_SECRET',
] as const;

/** Safe for the admin UI: reports configuration presence only, never secret values. */
export function alrajhiConfigReport(env: EnvironmentValues = process.env) {
  const environment = env.ALRAJHI_ENVIRONMENT === 'production' ? 'production' : 'sandbox';
  const fields = ALRAJHI_REQUIRED_FIELDS.map((key) => ({ key, required: true, present: (env[key] || '').trim().length > 0 }));
  return { environment, fields, ready: alrajhiEnvironmentConfigured(env) };
}

export async function getTopupMethodAvailability(): Promise<PaymentMethodPolicy> {
  const [electronicEnabled, transferEnabled] = await Promise.all([
    getSettingBool(PAY_SETTING.electronicOn, false),
    // Preserve the existing live bank-transfer flow until an administrator explicitly turns it off.
    getSettingBool(PAY_SETTING.transferOn, true),
  ]);
  return paymentMethodPolicy({ electronicEnabled, transferEnabled, alrajhiConfigured: alrajhiEnvironmentConfigured() });
}

export async function saveTopupMethodSettings(input: { electronicEnabled: boolean; transferEnabled: boolean }): Promise<void> {
  await Promise.all([
    setSetting(PAY_SETTING.electronicOn, input.electronicEnabled ? '1' : '0'),
    setSetting(PAY_SETTING.transferOn, input.transferEnabled ? '1' : '0'),
  ]);
}

/** الوسائل التي يمكن للأدمن التحكّم بتفعيلها/تعطيلها (لتفاوت الرسوم). */
export const CONTROLLABLE_METHODS: PayMethod[] = ['mada', 'visa', 'mastercard', 'applepay', 'stcpay'];

export const METHOD_LABEL_AR: Record<string, string> = {
  mada: 'مدى', visa: 'فيزا', mastercard: 'ماستركارد', applepay: 'Apple Pay', stcpay: 'STC Pay',
  googlepay: 'Google Pay', tabby: 'تابي', tamara: 'تمارا', card: 'بطاقة',
};

/** مفتاح إعداد بيانات اعتماد مزوّد. */
export function credKey(provider: string, field: string): string {
  return `pay_${provider}_${field}`;
}

export interface PaymentConfig {
  enabled: boolean;
  provider: PayProviderId | '';
  mode: PayMode;
  min: number;
  max: number;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const [enabled, provider, mode, min, max] = await Promise.all([
    getSettingBool(PAY_SETTING.on, false),
    getSetting(PAY_SETTING.provider, ''),
    getSetting(PAY_SETTING.mode, 'test'),
    getSettingNum(PAY_SETTING.min, 10),
    getSettingNum(PAY_SETTING.max, 5000),
  ]);
  const pid = (PROVIDER_META.some((p) => p.id === provider) ? provider : '') as PayProviderId | '';
  return {
    enabled,
    provider: pid,
    mode: mode === 'live' ? 'live' : 'test',
    min: Math.max(1, min || 10),
    max: Math.max(1, max || 5000),
  };
}

/** الوسائل المُفعّلة من الأدمن (افتراضياً كلها). قيمة مخزّنة = احترام اختيار الأدمن حرفياً. */
export async function getEnabledMethods(): Promise<PayMethod[]> {
  const raw = (await getSetting(PAY_SETTING.methods, '')).trim();
  if (!raw) return [...CONTROLLABLE_METHODS]; // غير محدّد بعد → الكل مُفعّل
  const set = raw.split(',').map((s) => s.trim());
  return CONTROLLABLE_METHODS.filter((m) => set.includes(m));
}

/** الوسائل الفعّالة فعلاً للمزوّد الحالي = المُفعّلة ∩ ما يدعمه المزوّد. */
export async function getActiveMethods(provider: string): Promise<PayMethod[]> {
  const meta = providerMeta(provider);
  if (!meta) return [];
  const enabled = await getEnabledMethods();
  const supported = new Set(meta.methods);
  return enabled.filter((m) => supported.has(m));
}

export async function setEnabledMethods(methods: string[]): Promise<void> {
  const clean = CONTROLLABLE_METHODS.filter((m) => methods.includes(m));
  await setSetting(PAY_SETTING.methods, clean.join(','));
}

/** بيانات اعتماد مزوّد (قيَمها الحقيقية — للاستخدام الخادمي فقط). */
export async function getProviderCreds(provider: string): Promise<ProviderCreds> {
  const meta = providerMeta(provider);
  if (!meta) return {};
  const out: ProviderCreds = {};
  await Promise.all(
    meta.creds.map(async (c) => {
      out[c.key] = (await getSetting(credKey(provider, c.key), '')).trim();
    }),
  );
  return out;
}

/** هل المزوّد مُهيّأ (كل الحقول السرّية المطلوبة مُدخَلة)؟ */
export async function isProviderConfigured(provider: string): Promise<boolean> {
  const meta = providerMeta(provider);
  if (!meta || !meta.ready) return false;
  const creds = await getProviderCreds(provider);
  // نعتبر الحقول السرّية إلزامية للتهيئة (المفاتيح العلنية قد تكون اختيارية لبعض التدفّقات).
  return meta.creds.filter((c) => c.secret).every((c) => (creds[c.key] || '').length > 0);
}

/** هل الدفع الإلكتروني جاهز فعلاً للاستخدام الآن (مفعّل + مزوّد جاهز ومُهيّأ + وسيلة واحدة على الأقل)؟ */
export async function isOnlinePayReady(): Promise<boolean> {
  const cfg = await getPaymentConfig();
  if (!cfg.enabled || !cfg.provider) return false;
  const meta = providerMeta(cfg.provider);
  if (!meta || !meta.ready) return false;
  if (!(await isProviderConfigured(cfg.provider))) return false;
  const active = await getActiveMethods(cfg.provider);
  return active.length > 0;
}

/** حفظ الإعدادات العامة للدفع (من لوحة الإدارة). */
export async function savePaymentSettings(input: { enabled: boolean; provider: string; mode: string; min: number; max: number; methods?: string[] }): Promise<void> {
  const pid = PROVIDER_META.some((p) => p.id === input.provider) ? input.provider : '';
  await Promise.all([
    setSetting(PAY_SETTING.on, input.enabled ? '1' : '0'),
    setSetting(PAY_SETTING.provider, pid),
    setSetting(PAY_SETTING.mode, input.mode === 'live' ? 'live' : 'test'),
    setSetting(PAY_SETTING.min, String(Math.max(1, Math.round(input.min) || 10))),
    setSetting(PAY_SETTING.max, String(Math.max(1, Math.round(input.max) || 5000))),
    input.methods ? setEnabledMethods(input.methods) : Promise.resolve(),
  ]);
}

/** حفظ بيانات اعتماد مزوّد. الحقول السرّية: لا تُحدَّث إن تُركت فارغة (حتى لا يُمحى المخزّن). */
export async function saveProviderCreds(provider: string, values: Record<string, string>): Promise<void> {
  const meta = providerMeta(provider);
  if (!meta) return;
  await Promise.all(
    meta.creds.map(async (c) => {
      const v = (values[c.key] ?? '').trim();
      if (c.secret && v === '') return; // ترك السرّي فارغاً = الإبقاء على القيمة الحالية
      await setSetting(credKey(provider, c.key), v.slice(0, 400));
    }),
  );
}
