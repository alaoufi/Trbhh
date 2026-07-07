import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getSession } from './auth';
import { getSetting, setSetting } from './settings';
import { ensureSchema } from '@/data/schema-sync';

export type Service =
  | 'users' | 'ads' | 'duplicates' | 'classified' | 'categories'
  | 'words' | 'reports' | 'verifications' | 'debates' | 'comments' | 'packages' | 'promos' | 'backup' | 'messages' | 'stores';
export type Action = 'view' | 'add' | 'edit' | 'delete' | 'archive' | 'suspend' | 'ban';

/** Backward-compat alias: a "Perm" is a service (page-level access). */
export type Perm = Service;

/**
 * Each service and the actions that can be granted on it.
 * NOTE: the "ads" service deliberately has NO "edit" — staff may archive or
 * delete an ad but must never edit a member's ad content (privacy).
 */
export const SERVICES: { key: Service; label: string; actions: Action[] }[] = [
  { key: 'users',         label: 'المستخدمون',         actions: ['view', 'edit', 'ban', 'delete'] },
  { key: 'ads',           label: 'الإعلانات',          actions: ['view', 'archive', 'delete'] },
  { key: 'duplicates',    label: 'الإعلانات المكررة',   actions: ['view', 'delete'] },
  { key: 'classified',    label: 'الإعلانات المبوّبة',   actions: ['view', 'edit', 'suspend', 'delete'] },
  { key: 'categories',    label: 'الأقسام',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'words',         label: 'الكلمات المرفوضة',    actions: ['view', 'add', 'delete'] },
  { key: 'reports',       label: 'البلاغات',           actions: ['view', 'delete'] },
  { key: 'messages',      label: 'مراقبة المراسلات',    actions: ['view', 'delete'] },
  { key: 'verifications', label: 'طلبات التوثيق',       actions: ['view', 'edit'] },
  { key: 'debates',       label: 'النقاشات',           actions: ['view', 'delete'] },
  { key: 'comments',      label: 'التعليقات',          actions: ['view', 'delete'] },
  { key: 'packages',      label: 'الباقات',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'promos',        label: 'الإعلانات الترويجية',  actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'backup',        label: 'النسخ الاحتياطي',      actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'stores',        label: 'المتاجر',            actions: ['view', 'edit', 'suspend', 'delete'] },
];

export const ACTION_LABELS: Record<Action, string> = {
  view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'حذف', archive: 'أرشفة', suspend: 'تعطيل', ban: 'حظر',
};

export const ALL_KEYS: string[] = SERVICES.flatMap((s) => s.actions.map((a) => `${s.key}:${a}`));
const KEY_SET = new Set(ALL_KEYS);
export const key = (s: Service, a: Action) => `${s}:${a}`;

/* ---- role presets (quick-apply bundles of granular permissions) ---- */
export type Role = 'manager' | 'moderator' | 'monitor' | 'store_monitor' | 'member' | 'visitor';
export const ROLE_LABELS: Record<Role, string> = {
  manager: 'مدير عام', moderator: 'مشرف', monitor: 'مراقب', store_monitor: 'مراقب متاجر تربّح', member: 'عضو', visitor: 'زائر',
};

/** Admin-granular presets (applied to a single admin user's admin_perms). */
export const ROLE_PRESET: Record<Role, string[]> = {
  manager: ALL_KEYS,
  moderator: [
    'ads:view', 'ads:archive', 'ads:delete',
    'classified:view', 'classified:delete',
    'comments:view', 'comments:delete',
    'debates:view', 'debates:delete',
    'reports:view', 'reports:delete',
    'messages:view', 'messages:delete',
    'duplicates:view', 'duplicates:delete',
    'promos:view', 'promos:edit', 'promos:delete',
  ],
  monitor: ['reports:view', 'verifications:view', 'verifications:edit', 'words:view', 'words:add', 'words:delete'],
  store_monitor: ['stores:view', 'stores:edit', 'stores:suspend', 'stores:delete'],
  member: [],
  visitor: [],
};

/** Backward-compat: services a role can reach (used by older callers). */
export const ROLE_PERMS: Record<Role, Perm[]> = {
  manager: SERVICES.map((s) => s.key),
  moderator: ['ads', 'classified', 'comments', 'debates', 'reports', 'duplicates', 'messages'],
  monitor: ['reports', 'verifications', 'words'],
  store_monitor: ['stores'],
  member: [],
  visitor: [],
};

/* ============================================================
   Detailed 5-role permission matrix — editable from the admin.
   Roles: manager / moderator / monitor / member / visitor.
   Actions per section: view / add / edit / delete / suspend (تعطيل).
   'suspend' also satisfies the legacy 'archive' gate on enforcement.
   ============================================================ */
export const MATRIX_ACTIONS: Action[] = ['view', 'add', 'edit', 'delete', 'suspend'];
export const MATRIX_ROLES: Role[] = ['manager', 'moderator', 'monitor', 'store_monitor', 'member', 'visitor'];
// staff may NEVER be granted the ability to edit a member's ad content (privacy)
export const MATRIX_LOCKED = new Set<string>(['ads:edit']);
export const ALL_MATRIX_KEYS: string[] = SERVICES
  .flatMap((s) => MATRIX_ACTIONS.map((a) => `${s.key}:${a}`))
  .filter((k) => !MATRIX_LOCKED.has(k));
const MATRIX_SET = new Set(ALL_MATRIX_KEYS);
const toSuspend = (k: string) => k.replace(/:archive$/, ':suspend');

export const DEFAULT_ROLE_PERMS: Record<Role, string[]> = {
  manager: ALL_MATRIX_KEYS,
  moderator: ROLE_PRESET.moderator.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  monitor: ROLE_PRESET.monitor.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  store_monitor: ROLE_PRESET.store_monitor.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  member: ['ads:view', 'ads:add', 'classified:view', 'classified:add', 'comments:view', 'comments:add', 'debates:view', 'debates:add'].filter((k) => MATRIX_SET.has(k)),
  visitor: ['ads:view', 'classified:view', 'categories:view', 'comments:view', 'debates:view'].filter((k) => MATRIX_SET.has(k)),
};

let rolePermsEnsured = false;
async function ensureRolePerms() {
  if (rolePermsEnsured) return;
  await ensureSchema(); // DDL consolidated in data/schema-sync
  // seed sensible defaults exactly once (so clearing a role later isn't reseeded)
  const seeded = await getSetting('role_perms_seeded', '0').catch(() => '0');
  if (seeded !== '1') {
    const seed = MATRIX_ROLES.flatMap((role) => DEFAULT_ROLE_PERMS[role].map((perm) => ({ role, perm })));
    await prisma.role_perms.createMany({ data: seed, skipDuplicates: true }).catch(() => {});
    await setSetting('role_perms_seeded', '1').catch(() => {});
  }
  // targeted one-time seed for the store-monitor role (added after initial seeding)
  const storesSeeded = await getSetting('role_perms_stores_seeded_v2', '0').catch(() => '0');
  if (storesSeeded !== '1') {
    await prisma.role_perms.createMany({
      data: DEFAULT_ROLE_PERMS.store_monitor.map((perm) => ({ role: 'store_monitor', perm })),
      skipDuplicates: true,
    }).catch(() => {});
    await setSetting('role_perms_stores_seeded_v2', '1').catch(() => {});
  }
  rolePermsEnsured = true;
}

let rolePermCache: { at: number; map: Map<string, Set<string>> } | null = null;
async function loadRolePerms(): Promise<Map<string, Set<string>>> {
  await ensureRolePerms();
  if (rolePermCache && Date.now() - rolePermCache.at < 30000) return rolePermCache.map;
  const rows = await prisma.role_perms.findMany().catch(() => []);
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.role)) map.set(r.role, new Set());
    if (MATRIX_SET.has(r.perm)) map.get(r.role)!.add(r.perm);
  }
  rolePermCache = { at: Date.now(), map };
  return map;
}

/** Enabled matrix keys for a role (e.g. "ads:add"). */
export async function getRolePermKeys(role: Role): Promise<Set<string>> {
  return (await loadRolePerms()).get(role) ?? new Set<string>();
}

/** Replace a role's matrix permissions with the given key list. */
export async function setRolePermKeys(role: Role, keys: string[]) {
  await ensureRolePerms();
  const valid = [...new Set(keys.filter((k) => MATRIX_SET.has(k)))];
  await prisma.role_perms.deleteMany({ where: { role } });
  if (valid.length) await prisma.role_perms.createMany({ data: valid.map((perm) => ({ role, perm })), skipDuplicates: true });
  rolePermCache = null;
}

/** Can a role perform an action on a section (matrix-based). */
export async function roleCan(role: Role, service: Service, action: Action): Promise<boolean> {
  return (await getRolePermKeys(role)).has(`${service}:${action}`);
}

/** Site-capability role of the current viewer (visitor if signed out, else member). */
export async function viewerRole(): Promise<Role> {
  const session = await getSession();
  return session ? 'member' : 'visitor';
}

const ensureTables = ensureSchema;

/** The full set of granular permission keys granted to a user. */
export async function getUserPermKeys(userId: number): Promise<Set<string>> {
  await ensureTables();
  // is_admin = 1 is a full manager (back-compat)
  const u = await prisma.users.findUnique({ where: { id: BigInt(userId) }, select: { is_admin: true } }).catch(() => null);
  if (u?.is_admin === 1) return new Set(ALL_KEYS);

  const out = new Set<string>();
  const perms = await prisma.admin_perms.findMany({ where: { user_id: BigInt(userId) }, select: { perm: true } }).catch(() => []);
  for (const p of perms) if (KEY_SET.has(p.perm)) out.add(p.perm);

  // expand any role assignment into keys using the editable matrix
  const roleRow = await prisma.admin_roles.findUnique({ where: { user_id: BigInt(userId) } }).catch(() => null);
  const role = roleRow?.role as Role | undefined;
  if (role) {
    const rk = await getRolePermKeys(role).catch(() => new Set<string>());
    for (const k of rk) {
      if (KEY_SET.has(k)) out.add(k);
      // 'suspend' in the matrix also satisfies the legacy 'archive' gate
      if (k.endsWith(':suspend')) {
        const arch = k.replace(/:suspend$/, ':archive');
        if (KEY_SET.has(arch)) out.add(arch);
      }
    }
    // safety net: if the matrix is somehow empty for a known admin role, use preset
    if (rk.size === 0 && ROLE_PRESET[role]?.length) for (const k of ROLE_PRESET[role]) out.add(k);
  }

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
  await prisma.admin_perms.deleteMany({ where: { user_id: BigInt(userId) } });
  await prisma.admin_roles.deleteMany({ where: { user_id: BigInt(userId) } }).catch(() => {});
  if (valid.length) {
    await prisma.admin_perms.createMany({ data: valid.map((perm) => ({ user_id: BigInt(userId), perm })), skipDuplicates: true });
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
  if (sameAs('store_monitor')) return 'store_monitor';
  return null; // custom set
}

/* ---- gates ---- */
export async function requireAction(service: Service, action: Action) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!(await hasAction(session.uid, service, action))) redirect('/');
  return session;
}

/** Ban/unban a member. Requires the distinct «حظر» permission (users:ban);
 *  full users:edit also satisfies it (backward-compat with existing admins). */
export async function requireUserBan() {
  const session = await getSession();
  if (!session) redirect('/login');
  const keys = await getUserPermKeys(session.uid);
  if (!keys.has('users:ban') && !keys.has('users:edit')) redirect('/');
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
