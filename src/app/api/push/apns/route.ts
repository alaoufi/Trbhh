import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { pushEnabled } from '@/lib/push';
import { apnsConfigured, deleteApnsDevice, isApnsToken, saveApnsDevice } from '@/lib/apns';
import { APNS_COOKIE } from '@/lib/apns-cookie';

export const dynamic = 'force-dynamic';

/** طلب من صفحة الموقع نفسها فقط: يمنع موقعاً آخر من ربط جهازه بحساب عضو مسجّل الدخول. */
function sameOrigin(req: NextRequest): boolean {
  const site = (req.headers.get('sec-fetch-site') || '').toLowerCase();
  if (site) return site === 'same-origin';
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).host === (req.headers.get('x-forwarded-host') || req.headers.get('host')); } catch { return false; }
}

/** تطبيق iPhone يسجّل رمز جهازه للعضو الحالي (يستدعيه جسر الصفحة بعد أن يسلّمه التطبيق الرمز). */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  if (!(await pushEnabled()) || !apnsConfigured()) return NextResponse.json({ ok: false }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { token?: unknown; sandbox?: unknown } | null;
  const token = typeof body?.token === 'string' ? body.token.toLowerCase() : '';
  if (!isApnsToken(token)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    await saveApnsDevice(session.uid, token, body?.sandbox === true);
  } catch { return NextResponse.json({ ok: false }, { status: 503 }); }
  (await cookies()).set(APNS_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
  return NextResponse.json({ ok: true });
}

/** إيقاف التنبيهات على هذا الجهاز: يُفصل الجهاز المعروف بملف ارتباطه. */
export async function DELETE(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ ok: false }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  const jar = await cookies();
  const token = jar.get(APNS_COOKIE)?.value || '';
  if (token) { await deleteApnsDevice(token).catch(() => {}); jar.delete(APNS_COOKIE); }
  return NextResponse.json({ ok: true });
}
