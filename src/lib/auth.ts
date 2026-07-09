import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const COOKIE = 'trbhh_session';
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'dev-insecure-secret-change-me-in-production-please',
);

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
  return session!;
}

/* memoized per-request (React cache): tames repeated hot reads within one navigation */
export const getSession = cache(getSessionImpl);
