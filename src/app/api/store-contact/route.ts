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
    if (viewerKey) await recordStoreContact(storeId, viewerKey, kind);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
