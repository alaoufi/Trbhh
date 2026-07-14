import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const COOKIE = 'trbhh_session';
const INSECURE_DEFAULT = 'dev-insecure-secret-change-me-in-production-please';
const AUTH_SECRET = process.env.AUTH_SECRET || '';
// أمان: لا تُشغّل الإنتاج بمفتاح توقيع افتراضي/ضعيف — وإلا أمكن تزوير الجلسات
// (بما فيها جلسة إداري) بمفتاح معروف. نفشل بوضوح بدل العمل بمفتاح غير آمن.
if (process.env.NODE_ENV === 'production' && (AUTH_SECRET.length < 32 || AUTH_SECRET === INSECURE_DEFAULT)) {
  throw new Error('AUTH_SECRET مفقود أو ضعيف في الإنتاج — عيّن مفتاحاً عشوائياً طوله 32 حرفاً على الأقل.');
}
const secret = new TextEncoder().encode(AUTH_SECRET || INSECURE_DEFAULT);

export type SessionPayload = { uid: number; name: string; type: string; scope?: string };

/**
 * Verify a plaintext password against the stored bcrypt hash.
 * The legacy Laravel data uses the $2y$ prefix, which bcryptjs treats
 * identically to $2a$ — so existing members log in with their ORIGINAL password.
 */
export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  const normalized = hash.startsWith('$2y$') ? '$2a$' + hash.slice(4) : hash;
  try {
    return await bcrypt.compare(plain, normalized);
  } catch {
    return false;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function createSession(payload: SessionPayload): Promise<void> {
  const token = await new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    // Only require HTTPS-only cookies when explicitly behind SSL.
    // (On a plain http://IP:PORT deployment this must stay false, otherwise
    // the browser drops the cookie and the user appears logged out.)
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

async function getSessionImpl(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function destroySession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Load the full user record for the current session (or null). */
export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { prisma } = await import('./prisma');
  return prisma.users.findUnique({ where: { id: BigInt(session.uid) } });
}

/* فحص الحظر لجلسة قائمة — مموّن لكل طلب حتى لا يتكرر الاستعلام عبر النداءات. */
const sessionBanned = cache(async (uid: number): Promise<boolean> => {
  const { isUserBanned } = await import('./moderation');
  return isUserBanned(uid).catch(() => false);
});

/** Guard: return session or redirect to /login (remembering where to return). */
export async function requireUser() {
  const session = await getSession();
  if (!session) {
    const { redirect } = await import('next/navigation');
    const { headers } = await import('next/headers');
    const path = (await headers()).get('x-pathname') || '';
    const next = path && path.startsWith('/') && !path.startsWith('/login') ? `?next=${encodeURIComponent(path)}` : '';
    redirect(`/login${next}`);
  }
  // أمان: افرض الحظر على الجلسات القائمة أيضاً — المحظور أثناء جلسته لا يواصل
  // النشر/المراسلة/الصرف بجلسته السابقة (الرمز صالح ٣٠ يوماً بلا هذا الفحص).
  if (await sessionBanned(session!.uid)) {
    const { redirect } = await import('next/navigation');
    redirect('/login?banned=1');
  }
  return session!;
}

/* memoized per-request (React cache): tames repeated hot reads within one navigation */
export const getSession = cache(getSessionImpl);
