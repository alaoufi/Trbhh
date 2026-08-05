import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ssoEnabled, verifyServiceToken } from '@/lib/sso';
import { verifyLoginLocal } from '@/lib/login-core';
import { toInt } from '@/lib/utils';

/**
 * نقطة تحقّق خادم-لخادم للدخول المباشر الفيدرالي (لا تُستدعى من المتصفح):
 * الموقع النظير يرسل بيانات الدخول ليتحقّق منها هذا الموقع محلياً فقط (بلا
 * فيدرالية متبادلة تمنع التكرار اللانهائي). لا تُرجِع بصمة الإداري إطلاقاً.
 */
export async function POST(req: NextRequest) {
  if (!ssoEnabled()) return NextResponse.json({ ok: false }, { status: 404 });

  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!(await verifyServiceToken(bearer))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { identifier?: string; password?: string };
  try {
    body = (await req.json()) as { identifier?: string; password?: string };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const r = await verifyLoginLocal(String(body.identifier || ''), String(body.password || ''));
  if (!r.ok) return NextResponse.json({ ok: false });

  const user = await prisma.users.findUnique({ where: { id: BigInt(r.uid) } });
  if (!user) return NextResponse.json({ ok: false });
  // الإداري لا يُوحَّد أبداً عبر SSO
  if (Number(user.is_admin) === 1 || String(user.type) === 'admin') {
    return NextResponse.json({ ok: false, admin: true });
  }

  return NextResponse.json({
    ok: true,
    phone: user.phoneNumber || user.userName || '',
    name: user.name || user.userName || 'عضو',
    pwhash: user.password ?? null,
  });
}
