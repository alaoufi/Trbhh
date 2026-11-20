import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { apnsConfigured, hasApnsDevice } from '@/lib/apns';
import { APNS_COOKIE } from '@/lib/apns-cookie';
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
  // تطبيق iPhone: هل هذا الجهاز (المعروف بملف ارتباطه) مسجّل لهذا العضو، وهل الخادم مضبوط بمفتاح Apple.
  const iosToken = (await cookies()).get(APNS_COOKIE)?.value || '';
  const ios = apnsConfigured();
  const iosSubscribed = ios && session && iosToken ? await hasApnsDevice(session.uid, iosToken) : false;
  return NextResponse.json({ enabled: true, key, subscribed, ios, iosSubscribed });
}

/** حفظ اشتراك الجهاز الحالي (للأعضاء). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await pushEnabled())) return NextResponse.json({ ok: false }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body?.endpoint) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    if(!await savePushSub(session.uid, body))return NextResponse.json({ok:false},{status:409});
  }catch{return NextResponse.json({ok:false},{status:503});}
  return NextResponse.json({ ok: true });
}

/** إلغاء اشتراك الجهاز الحالي. */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (body?.endpoint) await deletePushSub(session.uid,String(body.endpoint));
  return NextResponse.json({ ok: true });
}
