import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/auth';
import { ssoEnabled, verifyHandoff, resolveLocalUser } from '@/lib/sso';
import { toInt } from '@/lib/utils';

/**
 * استقبال تسليم الجلسة من الموقع النظير: /sso/accept?token=<jwt>&next=<path>
 * يتحقّق من الرمز، يجد الحساب محلياً بالجوال أو يُنشئ نسخة محلية له (مع مزامنة
 * بصمة كلمة المرور)، ثم يفتح جلسة محلية. الإداري/المدموج/المحظور لا يُقبل.
 */
export async function GET(req: NextRequest) {
  if (!ssoEnabled()) return NextResponse.redirect(new URL('/', req.url));

  const token = req.nextUrl.searchParams.get('token') || '';
  const nextRaw = req.nextUrl.searchParams.get('next') || '/';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  const claims = await verifyHandoff(token);
  if (!claims) return NextResponse.redirect(new URL('/login?sso=err', req.url));

  const r = await resolveLocalUser(claims);
  if ('blocked' in r) {
    const q = r.blocked === 'banned' ? '?banned=1' : '';
    return NextResponse.redirect(new URL(`/login${q}`, req.url));
  }

  await createSession({ uid: toInt(r.user.id), name: r.user.name || r.user.userName || 'عضو', type: r.user.type });
  return NextResponse.redirect(new URL(next, req.url));
}
