import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getSession } from './auth';

export type Service =
  | 'users' | 'ads' | 'duplicates' | 'classified' | 'categories'
  | 'words' | 'reports' | 'verifications' | 'debates' | 'comments' | 'packages' | 'promos' | 'backup';
export type Action = 'view' | 'add' | 'edit' | 'delete' | 'archive';

/** Backward-compat alias: a "Perm" is a service (page-level access). */
export type Perm = Service;

/**
 * Each service and the actions that can be granted on it.
 * NOTE: the "ads" service deliberately has NO "edit" — staff may archive or
 * delete an ad but must never edit a member's ad content (privacy).
 */
export const SERVICES: { key: Service; label: string; actions: Action[] }[] = [
  { key: 'users',         label: 'المستخدمون',         actions: ['view', 'edit', 'delete'] },
  { key: 'ads',           label: 'الإعلانات',          actions: ['view', 'archive', 'delete'] },
  { key: 'duplicates',    label: 'الإعلانات المكررة',   actions: ['view', 'delete'] },
  { key: 'classified',    label: 'الإعلانات المبوّبة',   actions: ['view', 'delete'] },
  { key: 'categories',    label: 'الأقسام',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'words',         label: 'الكلمات المرفوضة',    actions: ['view', 'add', 'delete'] },
  { key: 'reports',       label: 'البلاغات',           actions: ['view', 'delete'] },
  { key: 'verifications', label: 'طلبات التوثيق',       actions: ['view', 'edit'] },
  { key: 'debates',       label: 'النقاشات',           actions: ['view', 'delete'] },
  { key: 'comments',      label: 'التعليقات',          actions: ['view', 'delete'] },
  { key: 'packages',      label: 'الباقات',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'promos',        label: 'الإعلانات الترويجية',  actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'backup',        label: 'النسخ الاحتياطي',      actions: ['view', 'add', 'edit', 'delete'] },
];

export const ACTION_LABELS: Record<Action, string> = {
  view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'حذف', archive: 'أرشفة',
};

export const ALL_KEYS: string[] = SERVICES.flatMap((s) => s.actions.map((a) => `${s.key}:${a}`));
const KEY_SET = new Set(ALL_KEYS);
export const key = (s: Service, a: Action) => `${s}:${a}`;

/* ---- role presets (quick-apply bundles of granular permissions) ---- */
export type Role = 'manager' | 'moderator' | 'monitor';
export const ROLE_LABELS: Record<Role, string> = { manager: 'مدير', moderator: 'مشرف', monitor: 'مراقب' };

export const ROLE_PRESET: Record<Role, string[]> = {
  manager: ALL_KEYS,
  moderator: [
    'ads:view', 'ads:archive', 'ads:delete',
    'classified:view', 'classified:delete',
    'comments:view', 'comments:delete',
    'debates:view', 'debates:delete',
    'reports:view', 'reports:delete',
    'duplicates:view', 'duplicates:delete',
    'promos:view', 'promos:edit', 'promos:delete',
  ],
  monitor: ['reports:view', 'verifications:view', 'verifications:edit', 'words:view', 'words:add', 'words:delete'],
};

/** Backward-compat: services a role can reach (used by older callers). */
export const ROLE_PERMS: Record<Role, Perm[]> = {
  manager: SERVICES.map((s) => s.key),
  moderator: ['ads', 'classified', 'comments', 'debates', 'reports', 'duplicates'],
  monitor: ['reports', 'verifications', 'words'],
};

let ensured = false;
async function ensureTables() {
  if (ensured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS admin_perms (
      user_id BIGINT UNSIGNED NOT NULL,
      perm VARCHAR(40) NOT NULL,
      PRIMARY KEY (user_id, perm)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // legacy preset table (kept for back-compat with earlier assignments)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      user_id BIGINT UNSIGNED NOT NULL,
      role VARCHAR(20) NOT NULL,
      PRIMARY KEY (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  ensured = true;
}

/** The full set of granular permission keys granted to a user. */
export async function getUserPermKeys(userId: number): Promise<Set<string>> {
  await ensureTables();
  // is_admin = 1 is a full manager (back-compat)
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { is_admin: true } }).catch(() => null);
  if (u?.is_admin === 1) return new Set(ALL_KEYS);

  const out = new Set<string>();
  const perms = await prisma.$queryRawUnsafe<{ perm: string }[]>(`SELECT perm FROM admin_perms WHERE user_id = ?`, userId).catch(() => []);
  for (const p of perms) if (KEY_SET.has(p.perm)) out.add(p.perm);

  // expand any legacy role assignment into keys
  const roleRows = await prisma.$queryRawUnsafe<{ role: string }[]>(`SELECT role FROM admin_roles WHERE user_id = ?`, userId).catch(() => []);
  const role = roleRows[0]?.role as Role | undefined;
  if (role && ROLE_PRESET[role]) for (const k of ROLE_PRESET[role]) out.add(k);

  return out;
}

export async function hasAction(userId: number, service: Service, action: Action): Promise<boolean> {
  return (await getUserPermKeys(userId)).has(key(service, action));
}

/** Services the user can at least view (for nav/menu/dashboard). */
export async function getUserPerms(userId: number): Promise<Set<Perm>> {
  const keys = await getUserPermKeys(userId);
  const set = new Set<Perm>();
  for (const s of SERVICES) if (keys.has(key(s.key, 'view'))) set.add(s.key);
  return set;
}

/** Any action on a service → the service area is reachable. */
export async function hasPerm(userId: number, service: Service): Promise<boolean> {
  const keys = await getUserPermKeys(userId);
  return SERVICES.find((s) => s.key === service)?.actions.some((a) => keys.has(key(service, a))) ?? false;
}

export async function hasAnyAdmin(userId: number): Promise<boolean> {
  return (await getUserPermKeys(userId)).size > 0;
}

/** True only for full managers (all permissions / is_admin). */
export async function isManager(userId: number): Promise<boolean> {
  return (await getUserPermKeys(userId)).size >= ALL_KEYS.length;
}

/** Replace a user's granular permissions with the given key list. */
export async function setUserPerms(userId: number, keys: string[]) {
  await ensureTables();
  const valid = [...new Set(keys.filter((k) => KEY_SET.has(k)))];
  await prisma.$executeRawUnsafe(`DELETE FROM admin_perms WHERE user_id = ?`, userId);
  await prisma.$executeRawUnsafe(`DELETE FROM admin_roles WHERE user_id = ?`, userId).catch(() => {});
  for (const k of valid) {
    await prisma.$executeRawUnsafe(`INSERT IGNORE INTO admin_perms (user_id, perm) VALUES (?, ?)`, userId, k);
  }
}

export async function applyRolePreset(userId: number, role: Role | 'none') {
  if (role === 'none' || !ROLE_PRESET[role as Role]) {
    await setUserPerms(userId, []);
  } else {
    await setUserPerms(userId, ROLE_PRESET[role as Role]);
  }
}

/** Best-effort label for a user's current permission set (for display). */
export async function getUserRole(userId: number): Promise<Role | null> {
  const keys = await getUserPermKeys(userId);
  if (!keys.size) return null;
  if (keys.size >= ALL_KEYS.length) return 'manager';
  const sameAs = (r: Role) => ROLE_PRESET[r].length === keys.size && ROLE_PRESET[r].every((k) => keys.has(k));
  if (sameAs('moderator')) return 'moderator';
  if (sameAs('monitor')) return 'monitor';
  return null; // custom set
}

/* ---- gates ---- */
export async function requireAction(service: Service, action: Action) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!(await hasAction(session.uid, service, action))) redirect('/');
  return session;
}

/** Page-level gate: requires the "view" action on a service. */
export async function requirePerm(service: Service) {
  return requireAction(service, 'view');
}

export async function requireAnyAdmin() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!(await hasAnyAdmin(session.uid))) redirect('/');
  return session;
}
