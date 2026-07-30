import 'server-only';
import type { CreatePaymentInput, CreatePaymentResult, PayMethod, PayProvider, ProviderCreds, VerifyResult } from '../types';
import { httpJson, obj, str } from './http';

/**
 * مُحوِّل ميسّر (Moyasar) — عبر «الفواتير» (Invoices): ننشئ فاتورة فنحصل على رابط صفحة دفع
 * مستضافة، نوجّه العميل إليها، وبعد الدفع يعيد ميسّر المتصفح إلى callback_url ويطلق ويبهوك.
 * التحقّق النهائي دائماً بسحب حالة الفاتورة من ميسّر (لا نثق بمعطيات المتصفح).
 * التوثيق: https://docs.moyasar.com/invoices
 */
const BASE = 'https://api.moyasar.com/v1';

function auth(secret: string): string {
  // مصادقة Basic: المفتاح السرّي اسم المستخدم وكلمة المرور فارغة.
  return 'Basic ' + Buffer.from(`${secret}:`).toString('base64');
}

function mapMethod(src: string | undefined): PayMethod | null {
  switch ((src || '').toLowerCase()) {
    case 'creditcard': case 'card': return 'card';
    case 'applepay': return 'applepay';
    case 'stcpay': return 'stcpay';
    default: return src ? 'card' : null;
  }
}

export const moyasar: PayProvider = {
  id: 'moyasar',

  async createPayment(input: CreatePaymentInput, creds: ProviderCreds): Promise<CreatePaymentResult> {
    const secret = creds.secret_key;
    if (!secret) return { ok: false, error: 'مفتاح ميسّر السرّي غير مُهيّأ' };
    // تقييد الوسائل على ما اختاره الأدمن. ميسّر يوحّد البطاقات تحت creditcard (مدى/فيزا/
    // ماستركارد معاً) — الفصل الدقيق بين شبكات البطاقات يكون من لوحة ميسّر لا هنا.
    const mSet = new Set(input.methods || []);
    const methods: string[] = [];
    if (mSet.has('mada') || mSet.has('visa') || mSet.has('mastercard')) methods.push('creditcard');
    if (mSet.has('applepay')) methods.push('applepay');
    if (mSet.has('stcpay')) methods.push('stcpay');
    const res = await httpJson(`${BASE}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth(secret) },
      body: JSON.stringify({
        amount: Math.round(input.amountSar * 100), // هللات
        currency: 'SAR',
        description: input.description,
        callback_url: input.callbackUrl,
        ...(methods.length ? { methods } : {}),
        metadata: { topup_id: input.topupId },
      }),
    });
    const id = str(res.data, 'id');
    const url = str(res.data, 'url');
    if (!res.ok || !id || !url) {
      return { ok: false, error: str(res.data, 'message') || res.error || `فشل إنشاء فاتورة ميسّر (${res.status})` };
    }
    return { ok: true, redirectUrl: url, providerRef: id };
  },

  async verifyByRef(providerRef: string, creds: ProviderCreds): Promise<VerifyResult> {
    const secret = creds.secret_key;
    const res = await httpJson(`${BASE}/invoices/${encodeURIComponent(providerRef)}`, {
      headers: { Authorization: auth(secret) },
    });
    const status = str(res.data, 'status') || 'unknown';
    const amountHalalas = Number(str(res.data, 'amount') || 0);
    // الوسيلة من كائن الدفعة المرتبطة إن وُجد
    const payments = res.data.payments;
    let method: PayMethod | null = null;
    if (Array.isArray(payments) && payments[0]) {
      const src = obj(payments[0], 'source');
      method = mapMethod(str(src, 'type'));
    }
    return {
      paid: status === 'paid',
      amountSar: Math.round(amountHalalas / 100),
      providerRef,
      method,
      status,
    };
  },

  extractRefFromWebhook(body: unknown, query: URLSearchParams): string | null {
    // ويبهوك ميسّر يحمل data.invoice_id أو data.id؛ وعودة المتصفح تحمل ?invoice_id=
    const data = obj(body, 'data') || (body as Record<string, unknown> | null) || {};
    return (
      str(data, 'invoice_id') ||
      str(data, 'id') ||
      query.get('invoice_id') ||
      query.get('id') ||
      null
    );
  },
};
