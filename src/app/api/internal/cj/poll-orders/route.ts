import { NextResponse } from 'next/server';
import { constantSecret } from '@/lib/suppliers/crypto';
import { pollOpenCjOrders, processPendingWebhookEvents } from '@/lib/cj/orders/sync-status';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/**
 * استطلاع حالة طلبات CJ المجدول (كرون داخلي) — شبكة أمان للـwebhook. أولاً يعالج أي
 * أحداث webhook معلّقة، ثم يستعلم عن الطلبات المفتوحة من CJ ويطبّق الحالة/التتبّع.
 * قراءة فقط لدى CJ، لا شراء ولا خصم. مصادقة Bearer بنفس سرّ التسوية الداخلي.
 */
export async function POST(request: Request) {
  const secret = process.env.SUPPLIER_RECONCILE_SECRET || '';
  const headers = { 'Cache-Control': 'no-store' };
  if (secret.length < 32) return NextResponse.json({ error: 'not_configured' }, { status: 503, headers });
  const auth = request.headers.get('authorization') || '';
  if (auth.length > 1024 || !auth.startsWith('Bearer ') || !constantSecret(auth.slice(7), secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  }
  try {
    const webhooks = await processPendingWebhookEvents(100);
    const poll = await pollOpenCjOrders(25);
    return NextResponse.json({ ok: true, webhooks, poll }, { headers });
  } catch {
    return NextResponse.json({ error: 'cj_poll_unavailable' }, { status: 503, headers });
  }
}
