import 'server-only';
import { SITE } from '@/lib/constants';
import { alrajhiArb } from '@/lib/payments/providers/alrajhi-arb';
import type { CreatePaymentInput, PayMode, ProviderCreds } from '@/lib/payments/types';
import type { CommerceGateway } from '../gateway';
import type { PaymentAttempt, VerifiedPayment } from '../types';

/**
 * مُحوِّل بوابة التجارة إلى مصرف الراجحي (ARB) — منفصل تماماً عن مسار شحن الرصيد.
 * يستخدم trackId رقمياً قصيراً = معرّف محاولة الدفع (فريد لكل محاولة) فيعمل مع أي حدّ
 * لطول trackId لدى البنك، والتسوية تتطابق عليه. لا يحرّك أي مال بنفسه — التنسيق
 * والمطالبة والتسوية في طبقة التجارة (initiateCommercePayment/reconcileCommerceOrder)،
 * وكلها مقفلة خلف حارس الشراء المركزي ومفتاحَي التفعيل الإداريين.
 */
function hostOf(url: string): string | null {
  try { return url ? new URL(url).host : null; } catch { return null; }
}

export function makeAlrajhiCommerceGateway(creds: ProviderCreds, mode: PayMode): CommerceGateway {
  const allowedHosts = new Set(
    [creds.hosted_payment_url, creds.gateway_url, 'https://securepayments.alrajhibank.com.sa']
      .map(v => hostOf(v || '')).filter((h): h is string => !!h),
  );
  const callbackFor = (attemptId: bigint) => `https://${SITE.domain}/api/commerce/pay/final?a=${attemptId}`;
  return {
    id: 'alrajhi_arb',
    ready: !!(creds.tranportal_id && creds.tranportal_password && creds.terminal_resource_key),
    async create(attempt: PaymentAttempt): Promise<{ reference: string; redirectUrl: string }> {
      const input: CreatePaymentInput = {
        amountSar: attempt.amountMinor / 100,
        topupId: Number(attempt.id), // يُستخدم كـ trackId قصير عند الراجحي
        description: `طلب تربح ${attempt.orderId}`,
        callbackUrl: callbackFor(attempt.id),
        webhookUrl: callbackFor(attempt.id),
      };
      const res = await alrajhiArb.createPayment(input, creds, mode);
      if (!res.ok || !res.providerRef || !res.redirectUrl) throw new Error(res.error || 'alrajhi_create_failed');
      return { reference: res.providerRef, redirectUrl: res.redirectUrl };
    },
    async verify(attempt: PaymentAttempt): Promise<VerifiedPayment | null> {
      if (!attempt.reference) return null;
      const r = await alrajhiArb.verifyByRef(attempt.reference, creds, mode, attempt.amountMinor / 100, String(attempt.id));
      // لا نعتمد الطلب إلا بدفع مؤكَّد من البنك بنفس المبلغ ونفس trackId (محقّق داخل verifyByRef).
      if (!r.paid || Math.round(r.amountSar * 100) !== attempt.amountMinor) return null;
      return {
        amountMinor: attempt.amountMinor, currency: 'SAR', reference: attempt.reference,
        merchantOrderId: attempt.merchantOrderId, provider: 'alrajhi_arb', verified: true, status: r.status,
      };
    },
    isSafeRedirect(url: string): boolean {
      try { const u = new URL(url); return u.protocol === 'https:' && allowedHosts.has(u.host); } catch { return false; }
    },
  };
}
