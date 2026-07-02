import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getSession } from './auth';

export type Perm =
  | 'users' | 'ads' | 'duplicates' | 'classified' | 'categories'
  | 'words' | 'reports' | 'verifications' | 'debates' | 'comments' | 'packages';
export type Role = 'manager' | 'moderator' | 'monitor';

export const ROLE_LABELS: Record<Role, string> = { manager: 'مدير', moderator: 'مشرف', monitor: 'مراقب' };

export const ROLE_PERMS: Record<Role, Perm[]> = {
  manager: ['users', 'ads', 'duplicates', 'classified', 'categories', 'words', 'reports', 'verifications', 'debates', 'comments', 'packages'],
  moderator: ['ads', 'duplicates', 'classified', 'debates', 'comments', 'reports'],
  monitor: ['reports', 'verifications', 'words'],
};

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(20) NOT NULL,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

export async function getUserRole(userId: number): Promise<Role | null> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<{ role: string }[]>(`SELECT role FROM admin_roles WHERE user_id = ?`, userId).catch(() => []);
  const r = rows[0]?.role as Role | undefined;
  if (r && ROLE_PERMS[r]) return r;
  // backward compatibility: is_admin = 1 acts as a manager
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { is_admin: true } });
  return u?.is_admin === 1 ? 'manager' : null;
}

/** Bulk-fetch explicit roles for a set of users (does not include is_admin fallback). */
export async function getRolesFor(userIds: number[]): Promise<Map<number, Role>> {
  await ensureTable();
  const map = new Map<number, Role>();
  if (!userIds.length) return map;
  const rows = await prisma.$queryRawUnsafe<{ user_id: bigint; role: string }[]>(
    `SELECT user_id, role FROM admin_roles WHERE user_id IN (${userIds.map(() => '?').join(',')})`,
    ...userIds,
  ).catch(() => []);
  for (const r of rows) {
    const role = r.role as Role;
    if (ROLE_PERMS[role]) map.set(Number(r.user_id), role);
  }
  return map;
}

export async function getUserPerms(userId: number): Promise<Set<Perm>> {
  const role = await getUserRole(userId);
  return new Set(role ? ROLE_PERMS[role] : []);
}

export async function hasPerm(userId: number, perm: Perm): Promise<boolean> {
  return (await getUserPerms(userId)).has(perm);
}

export async function hasAnyAdmin(userId: number): Promise<boolean> {
  return (await getUserPerms(userId)).size > 0;
}

export async function setUserRole(userId: number, role: Role | 'none') {
  await ensureTable();
  if (role === 'none' || !ROLE_PERMS[role as Role]) {
    await prisma.$executeRawUnsafe(`DELETE FROM admin_roles WHERE user_id = ?`, userId);
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO admin_roles (user_id, role) VALUES (?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      userId, role,
    );
  }
}

/** Gate a page by a specific permission. */
export async function requirePerm(perm: Perm) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!(await hasPerm(session.uid, perm))) redirect('/');
  return session;
}

/** Gate the admin area (any permission). */
export async function requireAnyAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!(await hasAnyAdmin(session.uid))) redirect('/');
  return session;
}
