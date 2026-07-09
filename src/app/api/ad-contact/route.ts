import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getSettingBool } from '@/lib/settings';

/** تسجيل ضغطة تواصل على إعلان (واتساب/اتصال) — مرة لكل زائر/نوع/إعلان. */
export async function POST(req: Request) {
  try {
    if (!(await getSettingBool('ad_contact_stats_on', true))) return NextResponse.json({ ok: false });
    const body = await req.json().catch(() => null);
    const adId = Number(body?.adId || 0);
    const kind = body?.kind === 'call' ? 'call' : body?.kind === 'whatsapp' ? 'whatsapp' : null;
    if (!adId || !kind) return NextResponse.json({ ok: false });
    const session = await getSession().catch(() => null);
    const vid = (await cookies()).get('trbhh_vid')?.value;
    const viewer = session ? `u${session.uid}` : vid ? `g${vid}` : null;
    if (!viewer) return NextResponse.json({ ok: false });
    const exists = await prisma.ad_contacts.findFirst({ where: { ad_id: BigInt(adId), viewer, kind }, select: { id: true } }).catch(() => null);
    if (!exists) await prisma.ad_contacts.create({ data: { ad_id: BigInt(adId), viewer, kind } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
