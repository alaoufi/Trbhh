import 'server-only';
import { getSetting, getSettingBool, getSettingNum, setSetting } from '@/lib/settings';
import { providerMeta, PROVIDER_META } from './registry';
import type { PayMode, PayProviderId, ProviderCreds } from './types';

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
  provider: 'pay_provider',
  mode: 'pay_mode',
  min: 'pay_min',
  max: 'pay_max',
} as const;

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

/** هل الدفع الإلكتروني جاهز فعلاً للاستخدام الآن (مفعّل + مزوّد جاهز ومُهيّأ)؟ */
export async function isOnlinePayReady(): Promise<boolean> {
  const cfg = await getPaymentConfig();
  if (!cfg.enabled || !cfg.provider) return false;
  const meta = providerMeta(cfg.provider);
  if (!meta || !meta.ready) return false;
  return isProviderConfigured(cfg.provider);
}

/** حفظ الإعدادات العامة للدفع (من لوحة الإدارة). */
export async function savePaymentSettings(input: { enabled: boolean; provider: string; mode: string; min: number; max: number }): Promise<void> {
  const pid = PROVIDER_META.some((p) => p.id === input.provider) ? input.provider : '';
  await Promise.all([
    setSetting(PAY_SETTING.on, input.enabled ? '1' : '0'),
    setSetting(PAY_SETTING.provider, pid),
    setSetting(PAY_SETTING.mode, input.mode === 'live' ? 'live' : 'test'),
    setSetting(PAY_SETTING.min, String(Math.max(1, Math.round(input.min) || 10))),
    setSetting(PAY_SETTING.max, String(Math.max(1, Math.round(input.max) || 5000))),
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
