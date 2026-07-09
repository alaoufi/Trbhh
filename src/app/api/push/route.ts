import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { pushEnabled, getPushPublicKey, savePushSub, deletePushSub, hasPushSub } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** حالة الخدمة والمفتاح العام — يقرأها العميل قبل الاشتراك. */
export async function GET() {
  const enabled = await pushEnabled();
  if (!enabled) return NextResponse.json({ enabled: false });
  const session = await getSession();
  const [key, subscribed] = await Promise.all([
    getPushPublicKey(),
    session ? hasPushSub(session.uid) : Promise.resolve(false),
  ]);
  return NextResponse.json({ enabled: true, key, subscribed });
}

/** حفظ اشتراك الجهاز الحالي (للأعضاء). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await pushEnabled())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  await savePushSub(session.uid, body);
  return NextResponse.json({ ok: true });
}

/** إلغاء اشتراك الجهاز الحالي. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await deletePushSub(String(body.endpoint));
  return NextResponse.json({ ok: true });
}
