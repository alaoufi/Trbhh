import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ssoEnabled, isAllowedPeer, signHandoff } from '@/lib/sso';

/**
 * بدء تسليم الجلسة إلى الموقع النظير: /sso/start?to=<origin>&next=<path>
 * يتطلّب جلسة قائمة على هذا الموقع. يبني رمز تسليم موقّعاً ويعيد التوجيه إلى
 * `<to>/sso/accept`. الإداريّون لا يُسلَّمون عبر SSO — يدخلون مباشرة.
 */
export async function GET(req: NextRequest) {
  if (!ssoEnabled()) return NextResponse.redirect(new URL('/', req.url));

  const to = (req.nextUrl.searchParams.get('to') || '').trim().replace(/\/+$/, '');
  const nextRaw = req.nextUrl.searchParams.get('next') || '/';
  const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/';

  if (!to || !isAllowedPeer(to)) return NextResponse.redirect(new URL('/', req.url));

  const session = await getSession();
  if (!session) {
    // سجّل الدخول ثم عُد لإكمال التسليم
    const back = `/sso/start?to=${encodeURIComponent(to)}&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(back)}`, req.url));
  }

  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) } });
  if (!user) return NextResponse.redirect(new URL('/', req.url));

  // أمان: لا تُسلّم حساباً إدارياً عبر SSO (لا يُصدَّر هاش الإداري ولا تُفتح جلسته عن بُعد)
  if (Number(user.is_admin) === 1 || String(user.type) === 'admin') {
    return NextResponse.redirect(`${to}/`);
  }

  const phone = (user.phoneNumber || user.userName || '').trim();
  if (!phone) return NextResponse.redirect(new URL('/', req.url));

  const token = await signHandoff({
    phone,
    name: user.name || user.userName || 'عضو',
    pwhash: user.password ?? null,
  });

  const dest = `${to}/sso/accept?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(dest);
}
