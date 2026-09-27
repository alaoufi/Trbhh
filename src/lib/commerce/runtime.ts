import 'server-only';
import type { CommerceGateway } from './gateway';
import { getSetting } from '@/lib/settings';
import { alrajhiEnvironmentConfigured, getProviderCreds } from '@/lib/payments/config';
import { getPaymentConfig } from '@/lib/payments';
import { makeAlrajhiCommerceGateway } from './gateways/alrajhi';

/**
 * تُسجَّل بوابة التجارة (الراجحي) فقط عند اجتماع شرطين صريحين:
 *  1) مفتاح إداري commerce_gateway_enabled='1' (تفعيل تسجيل البوابة).
 *  2) اكتمال مفاتيح الراجحي في بيئة الخادم.
 * بدون ذلك تبقى null فلا يمكن بدء أي دفع. حتى بعد تسجيلها لا يبدأ دفع فعلي إلا بعد
 * تفعيل commerce_payments_enabled (يتطلب البوابة جاهزة) وcommerce_purchasing_enabled.
 * يُنصح بالاختبار في وضع الساندبوكس (ALRAJHI_ENVIRONMENT=sandbox) قبل الإنتاج.
 */
export async function getCommerceGateway(): Promise<CommerceGateway | null> {
  const enabled = (await getSetting('commerce_gateway_enabled', '0').catch(() => '0')) === '1';
  if (!enabled || !alrajhiEnvironmentConfigured()) return null;
  const [creds, config] = await Promise.all([getProviderCreds('alrajhi_arb'), getPaymentConfig()]);
  const gateway = makeAlrajhiCommerceGateway(creds, config.mode);
  return gateway.ready ? gateway : null;
}
