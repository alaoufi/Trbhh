import { NextRequest, NextResponse } from 'next/server';
import { confirmTopupById, confirmFromWebhook, inspectAlrajhiCallback } from '@/lib/payments';
import { readAlrajhiCallbackBody } from '@/lib/payments/alrajhi-callback';
import { attachProviderRef } from '@/lib/wallet';

export const dynamic = 'force-dynamic';

/**
 * عودة المتصفح بعد الدفع من بوابة المزوّد. نتحقّق من حالة العملية (سحباً من المزوّد — لا نثق
 * بمعطيات الرابط) ونعتمد الشحن إن اكتمل، ثم نعيد العضو إلى محفظته برسالة مناسبة.
 * المزوّدون يعيدون بـ GET غالباً؛ وبعضهم POST — ندعم الاثنين.
 */
async function handle(req: NextRequest, provider: string): Promise<NextResponse> {
  const url = new URL(req.url);
  const q = url.searchParams;
  const resultUrl = new URL('/payment/result', url.origin);

  const topupId = Number(q.get('t') || 0);
  let paid = false;
  try {
    if (topupId > 0) {
      const r = await confirmTopupById(topupId);
      paid = r.credited || r.paid;
    } else {
      // بلا معرّف طلب في الرابط: نحاول عبر معرّف عملية المزوّد في الاستعلام
      let body: unknown = null;
      if (req.method === 'POST') { try { body = await req.json(); } catch { body = Object.fromEntries((await req.formData()).entries()); } }
      const res = await confirmFromWebhook(provider, body, q);
      paid = res.handled;
    }
  } catch { /* نتعامل مع أي فشل كعدم اكتمال — لا نعتمد بلا تأكيد */ }

  if (topupId > 0) resultUrl.searchParams.set('t', String(topupId));
  if (!paid) resultUrl.searchParams.set('state', 'unverified');
  return NextResponse.redirect(resultUrl, { status: 303 });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  return handle(req, provider);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  if (provider === 'alrajhi_arb') {
    const url = new URL(req.url);
    const topupId = Number(url.searchParams.get('t') || 0);
    const body = await readAlrajhiCallbackBody(req);
    const validation = await inspectAlrajhiCallback(topupId, body);
    if (!validation.valid) {
      console.warn('[alrajhi-callback] notification validation failed', { reason: validation.reason, topupId });
      return NextResponse.json([{ status: '2', errorText: 'notification validation failed', errorCode: validation.reason }], { status: 400 });
    }
    await attachProviderRef(topupId, validation.providerRef);
    // The bank redirects the browser to this same URL as a GET after the acknowledgement.
    return NextResponse.json([{ status: '1', result: `${url.origin}${url.pathname}?t=${topupId}` }]);
  }
  return handle(req, provider);
}
