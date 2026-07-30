import { NextRequest, NextResponse } from 'next/server';
import { confirmFromWebhook } from '@/lib/payments';

export const dynamic = 'force-dynamic';

/**
 * إشعار خادم-لخادم من بوابة الدفع (الأكثر موثوقية — يصل حتى لو أغلق العضو المتصفح). نستخرج
 * معرّف العملية، نتحقّق من حالتها سحباً من المزوّد، ونعتمد الشحن (آمنٌ للتكرار). نعيد 200 دائماً
 * حتى لا يعيد المزوّد المحاولة بلا داعٍ على أخطاء غير قابلة للإصلاح.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  const url = new URL(req.url);
  let body: unknown = null;
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) body = await req.json();
    else if (ct.includes('form')) body = Object.fromEntries((await req.formData()).entries());
    else { const t = await req.text(); try { body = JSON.parse(t); } catch { body = { raw: t }; } }
  } catch { body = null; }

  try {
    await confirmFromWebhook(provider, body, url.searchParams);
  } catch { /* الاعتماد آمن للتكرار — نتجاهل الأخطاء العابرة */ }

  return NextResponse.json({ received: true }, { headers: { 'Cache-Control': 'no-store' } });
}
