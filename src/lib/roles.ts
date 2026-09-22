import 'server-only';
import { redirect } from 'next/navigation';
import { prisma } from './prisma';
import { getSession } from './auth';
import { getSetting, setSetting } from './settings';
import { ensureSchema } from '@/data/schema-sync';
import { hasAccess, readActorAccess, requireAccess } from './access-control/guards';
import { legacyPermission, SENSITIVE_KEYS } from './access-control/catalog';

export type Service =
  | 'users' | 'ads' | 'duplicates' | 'classified'
  | 'words' | 'reports' | 'verifications' | 'comments' | 'packages' | 'promos' | 'backup' | 'messages' | 'stores' | 'commerce' | 'categories' | 'suppliers' | 'finance';
export type Action = 'view' | 'add' | 'edit' | 'delete' | 'archive' | 'suspend' | 'ban' | 'approve' | 'close' | 'export';

/** Backward-compat alias: a "Perm" is a service (page-level access). */
export type Perm = Service;

/**
 * Each service and the actions that can be granted on it.
 * NOTE: the "ads" service deliberately has NO "edit" — staff may archive or
 * delete an ad but must never edit a member's ad content (privacy).
 */
export const SERVICES: { key: Service; label: string; actions: Action[] }[] = [
  { key: 'users',         label: 'الأعضاء',         actions: ['view', 'edit', 'ban', 'delete'] },
  { key: 'ads',           label: 'الإعلانات',          actions: ['view', 'archive', 'delete'] },
  { key: 'duplicates',    label: 'الإعلانات المكررة',   actions: ['view', 'delete'] },
  { key: 'classified',    label: 'الإعلانات المبوّبة',   actions: ['view', 'edit', 'suspend', 'delete'] },
  { key: 'words',         label: 'الكلمات المرفوضة',    actions: ['view', 'add', 'delete'] },
  { key: 'reports',       label: 'البلاغات',           actions: ['view', 'delete'] },
  { key: 'messages',      label: 'مراقبة المراسلات',    actions: ['view', 'delete'] },
  { key: 'verifications', label: 'طلبات التوثيق',       actions: ['view', 'edit'] },
  { key: 'comments',      label: 'التعليقات',          actions: ['view', 'delete'] },
  { key: 'packages',      label: 'الباقات',            actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'promos',        label: 'الإعلانات الترويجية',  actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'backup',        label: 'النسخ الاحتياطي',      actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'stores',        label: 'المتاجر',            actions: ['view', 'edit', 'suspend', 'delete'] },
  { key: 'commerce',      label: 'السلع والطلبات',      actions: ['view', 'add', 'edit', 'suspend'] },
  { key: 'finance',       label: 'المتابعة المالية والفواتير', actions: ['view', 'edit', 'approve', 'close', 'export'] },
  { key: 'suppliers',     label: 'الموردون وربط السلع', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'categories',    label: 'الأقسام وحقولها',      actions: ['view', 'add', 'edit', 'delete', 'suspend'] },
];

export const ACTION_LABELS: Record<Action, string> = {
  view: 'عرض', add: 'إضافة', edit: 'تعديل', delete: 'حذف', archive: 'أرشفة', suspend: 'تعطيل', ban: 'حظر',
  approve: 'اعتماد مالي', close: 'إقفال الشهر', export: 'تصدير',
};

export const ALL_KEYS: string[] = SERVICES.flatMap((s) => s.actions.map((a) => `${s.key}:${a}`));
export const key = (s: Service, a: Action) => `${s}:${a}`;

/* ---- role presets (quick-apply bundles of granular permissions) ---- */
export type Role = 'manager' | 'moderator' | 'monitor' | 'store_monitor' | 'member' | 'visitor';
export const ROLE_LABELS: Record<Role, string> = {
  manager: 'مدير عام', moderator: 'مشرف', monitor: 'مراقب', store_monitor: 'مراقب متاجر تربّح', member: 'عضو', visitor: 'زائر',
};

/** Admin-granular presets (applied to a single admin user's admin_perms). */
export const ROLE_PRESET: Record<Role, string[]> = {
  manager: ALL_KEYS.filter(k=>{const mapped=legacyPermission(k);return mapped!==null&&!SENSITIVE_KEYS.has(mapped);}),
  moderator: [
    'ads:view', 'ads:archive', 'ads:delete',
    'classified:view', 'classified:delete',
    'comments:view', 'comments:delete',
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
  moderator: ['ads', 'classified', 'comments', 'reports', 'duplicates', 'messages'],
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
  .flatMap((s) => (s.key === 'finance' ? s.actions : MATRIX_ACTIONS).map((a) => `${s.key}:${a}`))
  .filter((k) => !MATRIX_LOCKED.has(k));
const MATRIX_SET = new Set(ALL_MATRIX_KEYS);
const toSuspend = (k: string) => k.replace(/:archive$/, ':suspend');

export const DEFAULT_ROLE_PERMS: Record<Role, string[]> = {
  manager: [],
  moderator: ROLE_PRESET.moderator.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  monitor: ROLE_PRESET.monitor.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  store_monitor: ROLE_PRESET.store_monitor.map(toSuspend).filter((k) => MATRIX_SET.has(k)),
  member: ['ads:view', 'ads:add', 'classified:view', 'classified:add', 'comments:view', 'comments:add'].filter((k) => MATRIX_SET.has(k)),
  visitor: ['ads:view', 'classified:view', 'comments:view'].filter((k) => MATRIX_SET.has(k)),
};

let rolePermsEnsured = false;
async function ensureRolePerms() {
  if (rolePermsEnsured) return;
  await ensureSchema(); // DDL consolidated in data/schema-sync
  // seed sensible defaults exactly once (so clearing a role later isn't reseeded)
  const seeded = await getSetting('role_perms_seeded', '0').catch(() => '0');
  if (seeded !== '1') {
    const seed = (['member','visitor'] as const).flatMap((role) => DEFAULT_ROLE_PERMS[role].map((perm) => ({ role, perm })));
    await prisma.role_perms.createMany({ data: seed, skipDuplicates: true }).catch(() => {});
    await setSetting('role_perms_seeded', '1').catch(() => {});
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
  if(role!=='member'&&role!=='visitor')return new Set();
  return (await loadRolePerms()).get(role) ?? new Set<string>();
}

/** Replace a role's matrix permissions with the given key list. */
export async function setRolePermKeys(role: Role, keys: string[]) {
  void role;void keys;
  throw new Error('rbac_legacy_grants_disabled');
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

/** Compatibility facade: staff authorization is exclusively the new RBAC registry. */
export async function getUserPermKeys(userId:number):Promise<Set<string>>{
  const access=await readActorAccess(userId);
  if(!access.ready)return new Set();
  const keys=new Set(access.keys);
  // Aliases are derived from explicit canonical grants, never from legacy rows.
  for(const old of ALL_KEYS){const mapped=legacyPermission(old);if(mapped&&access.keys.has(mapped))keys.add(old);}
  return keys;
}
export async function hasAction(userId:number,service:Service,action:Action){
  const mapped=legacyPermission(`${service}:${action}`);if(!mapped)return false;
  const [module,verb]=mapped.split(':');return hasAccess(userId,module,verb);
}
export async function getUserPerms(userId:number):Promise<Set<Perm>>{
  const keys=await getUserPermKeys(userId);
  return new Set(SERVICES.filter(s=>keys.has(`${s.key}:view`)).map(s=>s.key));
}
export async function hasPerm(userId:number,service:Service){return hasAction(userId,service,'view');}
export async function hasAnyAdmin(userId:number){const access=await readActorAccess(userId);return access.ready&&access.keys.size>0;}
/** Legacy name retained for callers; it checks a permission, never a role label/count. */
export async function isManager(userId:number){return hasAccess(userId,'access_control','manage_settings');}
export class AdminMfaEnrollmentRequired extends Error {
  constructor(){super('يجب ربط تطبيق التحقق قبل منح صلاحيات الإدارة.');}
}
/** Old entrypoints cannot write unaudited grants or resurrect legacy permissions. */
export async function setUserPerms(userId:number,keys:string[]){void userId;void keys;throw new Error('rbac_legacy_grants_disabled');}
export async function applyRolePreset(userId:number,role:Role|'none'){void userId;void role;throw new Error('rbac_legacy_grants_disabled');}
export async function getUserRole(userId:number):Promise<Role|null>{
  const {roles}=await readActorAccess(userId);
  return roles.some(r=>r.id==='system_access_admin')?'manager':null;
}
export async function getUserRolesMap(ids:number[]):Promise<Map<number,Role|null>>{
  const map=new Map<number,Role|null>(ids.map(id=>[id,null]));
  if(!ids.length)return map;
  try{
    await ensureSchema();
    const valid=ids.filter(id=>Number.isSafeInteger(id)&&id>0);if(!valid.length)return map;
    const rows=await prisma.$queryRawUnsafe<{user_id:bigint}[]>(`SELECT ur.user_id FROM access_user_roles ur JOIN access_roles r ON r.id=ur.role_id JOIN access_departments d ON d.id=r.department_id JOIN access_control_state s ON s.id=1 WHERE s.initialized_at IS NOT NULL AND r.active=1 AND d.active=1 AND r.id='system_access_admin' AND ur.user_id IN (${valid.map(()=>'?').join(',')})`,...valid);
    for(const r of rows)map.set(Number(r.user_id),'manager');
  }catch{/* Labels reveal no permissions and grant nothing on read failure. */}
  return map;
}
export async function requireAction(service:Service,action:Action){
  const mapped=legacyPermission(`${service}:${action}`);if(!mapped)redirect('/account?access=denied');
  const [module,verb]=mapped.split(':');return requireAccess(module,verb);
}
export async function requireUserBan(){return requireAccess('users','ban');}
export async function requirePerm(service:Service){return requireAction(service,'view');}
export async function requireManager(){return requireAccess('access_control','manage_settings');}
export async function requireAnyAdmin(){
  const session=await getSession();if(!session)redirect('/login');
  if(!(await hasAnyAdmin(session.uid)))redirect('/account?access=denied');return session;
}
