import 'server-only';
import type { CreatePaymentInput, CreatePaymentResult, PayMethod, PayProvider, ProviderCreds, VerifyResult } from '../types';
import { httpJson, obj, str } from './http';

/**
 * مُحوِّل Tap Payments — عبر «Charges»: ننشئ عملية بمصدر src_all (تعرض كل الوسائل: مدى/بطاقات/
 * آبل باي/STC Pay) فنحصل على transaction.url، نوجّه العميل إليها، وبعد الدفع يعيد Tap المتصفح
 * إلى redirect.url ويطلق post.url (ويبهوك). التحقّق دائماً بسحب حالة العملية من Tap.
 * التوثيق: https://developers.tap.company/reference/create-a-charge
 */
const BASE = 'https://api.tap.company/v2';

function mapMethod(src: string | undefined): PayMethod | null {
  const s = (src || '').toLowerCase();
  if (s.includes('mada')) return 'mada';
  if (s.includes('visa')) return 'visa';
  if (s.includes('master')) return 'mastercard';
  if (s.includes('apple')) return 'applepay';
  if (s.includes('stc')) return 'stcpay';
  return s ? 'card' : null;
}

export const tap: PayProvider = {
  id: 'tap',

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const secret = creds.secret_key;
    if (!secret) return { ok: false, error: 'مفتاح Tap السرّي غير مُهيّأ' };
    const [first, ...rest] = (input.customerName || 'عميل تربح').split(' ');
    const res = await httpJson(`${BASE}/charges`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({
        amount: Math.round(input.amountSar * 100) / 100, // Tap يقبل كسوراً عشرية بالريال
        currency: 'SAR',
        description: input.description,
        threeDSecure: true,
        customer: {
          first_name: first || 'عميل',
          last_name: rest.join(' ') || 'تربح',
          email: input.customerEmail || undefined,
          phone: input.customerPhone ? { country_code: '966', number: input.customerPhone.replace(/^0|^966|\D/g, '') } : undefined,
        },
        source: { id: 'src_all' },
        redirect: { url: input.callbackUrl },
        post: { url: input.webhookUrl },
        metadata: { topup_id: String(input.topupId) },
      }),
    });
    const id = str(res.data, 'id');
    const tx = obj(res.data, 'transaction');
    const url = str(tx, 'url');
    if (!res.ok || !id || !url) {
      return { ok: false, error: str(obj(res.data, 'errors'), 'description') || str(res.data, 'message') || res.error || `فشل إنشاء عملية Tap (${res.status})` };
    }
    return { ok: true, redirectUrl: url, providerRef: id };
  },

  async verifyByRef(providerRef: string, creds: ProviderCreds): Promise<VerifyResult> {
    const secret = creds.secret_key;
    const res = await httpJson(`${BASE}/charges/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const status = str(res.data, 'status') || 'UNKNOWN';
    const amount = Number(str(res.data, 'amount') || 0);
    const src = obj(res.data, 'source');
    return {
      paid: status === 'CAPTURED',
      amountSar: Math.round(amount),
      providerRef,
      method: mapMethod(str(src, 'payment_type') || str(src, 'type') || str(src, 'id')),
      status,
    };
  },

  extractRefFromWebhook(body: unknown, query: URLSearchParams): string | null {
    // ويبهوك Tap يحمل id العملية؛ وعودة المتصفح تحمل ?tap_id=
    return str(body, 'id') || query.get('tap_id') || query.get('id') || null;
  },
};
