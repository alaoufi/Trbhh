import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { destroySession, getSession } from '@/lib/auth';

/**
 * A prefetch/preload must NEVER log the user out. Browsers and Next.js may
 * speculatively fetch links (hover, viewport, <link rel=prefetch>, crawlers),
 * which would silently destroy the session and force a repeated login. We only
 * clear the session on a real, user-initiated request.
 */
function isPrefetch(req: Request): boolean {
  const h = req.headers;
  if (h.get('next-router-prefetch') === '1') return true;
  const purpose = (h.get('purpose') || h.get('x-purpose') || h.get('sec-purpose') || '').toLowerCase();
  return purpose.includes('prefetch') || purpose.includes('preview') || purpose.includes('prerender');
}

/** الخروج يُبطل الجلسة على الخادم (تدوير نسخة الجلسة) لا في المتصفح فقط: ملف ارتباط
 *  منسوخ أو مسروق لا يبقى صالحاً بعد الخروج. يترتب عليه خروج بقية أجهزة الحساب أيضاً. */
async function signOut(): Promise<void> {
  const session = await getSession().catch(() => null);
  if (session) {
    const { prisma } = await import('@/lib/prisma');
    await prisma.users.update({ where: { id: BigInt(session.uid) }, data: { auth_session_version: randomUUID() } }).catch(() => {});
  }
  await destroySession();
}

export async function GET(req: Request) {
  if (isPrefetch(req)) return new NextResponse(null, { status: 204 });
  // رابط/صورة في موقع آخر لا تُخرج العضو من حسابه.
  if ((req.headers.get('sec-fetch-site') || '').toLowerCase() === 'cross-site') redirect('/');
  await signOut();
  redirect('/');
}

export async function POST() {
  await signOut();
  redirect('/');
}
