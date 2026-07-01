import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getSession } from './auth';

/** Gate: require an admin (users.is_admin = 1). Redirects otherwise. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await prisma.users.findUnique({ where: { id: BigInt(session.uid) }, select: { is_admin: true } });
  if (!user || user.is_admin !== 1) redirect('/');
  return session;
}

export async function isAdmin(userId: number) {
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { is_admin: true } });
  return u?.is_admin === 1;
}

export async function adminStats() {
  const [users, ads, activeAds, pendingVerify, reports, debates] = await Promise.all([
    prisma.users.count(),
    prisma.ads.count(),
    prisma.ads.count({ where: { status: 1, state: 'active' } }),
    prisma.users.count({ where: { step: { gt: 0 }, trusted: 0 } }),
    prisma.repord_ads.count(),
    prisma.debates.count(),
  ]);
  return { users, ads, activeAds, pendingVerify, reports, debates };
}
