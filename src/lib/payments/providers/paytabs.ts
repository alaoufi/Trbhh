import 'server-only';
import type { CreatePaymentInput, CreatePaymentResult, PayMethod, PayProvider, ProviderCreds, VerifyResult } from '../types';
import { httpJson, obj, str } from './http';

/**
 * مُحوِّل PayTabs (منطقة السعودية) — «Hosted Payment Page»: نطلب صفحة دفع فنحصل على redirect_url،
 * نوجّه العميل إليها، وبعد الدفع يعيد PayTabs المتصفح إلى return ويطلق callback (ويبهوك).
 * التحقّق دائماً عبر استعلام العملية بـ tran_ref. التوثيق: https://support.paytabs.com/en/
 */
const BASE = 'https://secure.paytabs.sa';

function mapMethod(src: string | undefined): PayMethod | null {
  const s = (src || '').toLowerCase();
  if (s.includes('mada')) return 'mada';
  if (s.includes('visa')) return 'visa';
  if (s.includes('master')) return 'mastercard';
  if (s.includes('apple')) return 'applepay';
  return s ? 'card' : null;
}

export const paytabs: PayProvider = {
  id: 'paytabs',

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const profileId = creds.profile_id;
    const serverKey = creds.server_key;
    if (!profileId || !serverKey) return { ok: false, error: 'بيانات PayTabs (Profile ID / Server Key) غير مُهيّأة' };
    // PayTabs يدعم تقييد الوسائل بدقّة: مدى منفصل عن البطاقات، وApple Pay وSTC Pay.
    const mSet = new Set(input.methods || []);
    const pmSet = new Set<string>();
    if (mSet.has('mada')) pmSet.add('mada');
    if (mSet.has('visa') || mSet.has('mastercard')) pmSet.add('creditcard');
    if (mSet.has('applepay')) pmSet.add('applepay');
    if (mSet.has('stcpay')) pmSet.add('stcpay');
    const payment_methods = [...pmSet];
    const res = await httpJson(`${BASE}/payment/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: serverKey },
      body: JSON.stringify({
        profile_id: Number(profileId),
        tran_type: 'sale',
        tran_class: 'ecom',
        cart_id: `topup-${input.topupId}`,
        cart_description: input.description,
        cart_currency: 'SAR',
        cart_amount: Math.round(input.amountSar * 100) / 100,
        ...(payment_methods.length ? { payment_methods } : {}),
        callback: input.webhookUrl,
        return: input.callbackUrl,
        customer_details: input.customerName ? { name: input.customerName, phone: input.customerPhone || '', email: input.customerEmail || '' } : undefined,
      }),
    });
    const url = str(res.data, 'redirect_url');
    const ref = str(res.data, 'tran_ref');
    if (!res.ok || !url || !ref) {
      const result = obj(res.data, 'result');
      return { ok: false, error: str(res.data, 'message') || (typeof result === 'object' ? str(result, 'message') : undefined) || res.error || `فشل إنشاء دفعة PayTabs (${res.status})` };
    }
    return { ok: true, redirectUrl: url, providerRef: ref };
  },

  async verifyByRef(providerRef: string, creds: ProviderCreds): Promise<VerifyResult> {
    const profileId = creds.profile_id;
    const serverKey = creds.server_key;
    const res = await httpJson(`${BASE}/payment/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: serverKey },
      body: JSON.stringify({ profile_id: Number(profileId), tran_ref: providerRef }),
    });
    const payResult = obj(res.data, 'payment_result');
    const respStatus = str(payResult, 'response_status'); // 'A' = مقبول
    const amount = Number(str(res.data, 'cart_amount') || 0);
    const paymentInfo = obj(res.data, 'payment_info');
    return {
      paid: respStatus === 'A',
      amountSar: Math.round(amount),
      providerRef,
      method: mapMethod(str(paymentInfo, 'payment_method')),
      status: respStatus || str(res.data, 'response_status') || 'unknown',
    };
  },

  extractRefFromWebhook(body: unknown, query: URLSearchParams): string | null {
    return str(body, 'tran_ref') || query.get('tranRef') || query.get('tran_ref') || null;
  },
};
