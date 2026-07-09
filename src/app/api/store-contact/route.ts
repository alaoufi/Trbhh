import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { recordStoreContact } from '@/lib/store-analytics';

/** Fire-and-forget conversion tracking: a storefront WhatsApp/call click.
 *  Called via navigator.sendBeacon, so it must be cheap and never throw. */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const storeId = Number(body?.storeId || 0);
    const kind = body?.kind === 'call' ? 'call' : body?.kind === 'whatsapp' ? 'whatsapp' : null;
    if (!storeId || !kind) return NextResponse.json({ ok: false });
    const session = await getSession().catch(() => null);
    const vid = (await cookies()).get('trbhh_vid')?.value;
    const viewerKey = session ? `u${session.uid}` : vid ? `g${vid}` : null;
    // تحقّق أن المتجر موجود ومعتمد قبل التسجيل — يمنع تلويث إحصاءات متجر آخر بمعرّفات عشوائية
    const { prisma } = await import('@/lib/prisma');
    const exists = await prisma.stores.count({ where: { id: BigInt(storeId), status: 1 } }).catch(() => 0);
    if (viewerKey && exists) await recordStoreContact(storeId, viewerKey, kind);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
