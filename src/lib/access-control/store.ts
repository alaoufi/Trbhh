import 'server-only';
import {randomUUID} from 'node:crypto';
import {isIP} from 'node:net';
import type {Prisma,PrismaClient} from '@prisma/client';
import {lockAuthPolicy} from '@/lib/auth-policy-lock';
import {DEPARTMENTS,DEFAULT_ROLES,permissionKeySet,SENSITIVE_KEYS,legacyPermission} from './catalog';
import {ACCESS_CONTROL_DDL,assertAccessControlSchema} from './schema';

type Db=Pick<PrismaClient,'$queryRaw'|'$queryRawUnsafe'>;
type Tx=Prisma.TransactionClient;
export type AccessActor={userId:number;ip:string|null;sessionFingerprint:string|null};
export type Actor=AccessActor;
export type DepartmentInput={id?:string;name:string;active:boolean;reason:string};
export type RoleInput={id?:string;name:string;departmentId:string;active:boolean;permissions:string[];reason:string};
export type AssignmentInput={userId:number;roleIds:string[];reason:string};
export type Access={ready:boolean;keys:Set<string>;roles:{id:string;name:string;departmentId:string}[]};
export type Department={id:string;name:string;active:boolean};
export type Role={id:string;name:string;departmentId:string;active:boolean;permissions:string[];userCount:number};
export type AccessAdminData={ready:boolean;departments:Department[];roles:Role[];assignments:{userId:number;roleIds:string[]}[];users:{id:number;name:string;userName:string;phone:string;enabled:boolean}[];audit:{id:string;at:string;actorId:number|null;action:string;target:string;reason:string;before:unknown;after:unknown;ip:string|null;sessionFingerprint:string|null}[]};
const MANAGE='access_control:manage_settings';
const enabledSql="u.archived_at IS NULL AND COALESCE(u.merged_into,0)=0 AND (COALESCE(u.ban,'no') <> 'checked' OR (u.ban_until IS NOT NULL AND u.ban_until <= UTC_TIMESTAMP()))";
function validUser(id:number){if(!Number.isSafeInteger(id)||id<=0)throw new Error('access_input_invalid');return id;}
function validActor(actor:AccessActor){validUser(actor.userId);if(actor.ip!==null&&!isIP(actor.ip))throw new Error('access_input_invalid');if(actor.sessionFingerprint!==null&&!/^[a-f0-9]{64}$/.test(actor.sessionFingerprint))throw new Error('access_input_invalid');}
function text(value:string,max:number){if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new Error('access_input_invalid');return value.trim();}
function slug(value:string){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(value))throw new Error('access_input_invalid');return value;}
function active(value:boolean){if(typeof value!=='boolean')throw new Error('access_input_invalid');return value?1:0;}
function checkedKeys(values:string[]){if(!Array.isArray(values)||values.some(key=>typeof key!=='string'||!permissionKeySet.has(key)))throw new Error('access_unknown_permission');return [...new Set(values)].sort();}
function parseJson(value:unknown){return typeof value==='string'?JSON.parse(value):value;}
const empty=():Access=>({ready:false,keys:new Set(),roles:[]});
async function ready(db:Db){const rows=await db.$queryRaw<{initialized_at:Date|null}[]>`SELECT initialized_at FROM access_control_state WHERE id=1`;return !!rows[0]?.initialized_at;}
async function effective(db:Db,userId:number):Promise<Access>{
  const rows=await db.$queryRawUnsafe<{id:string;name:string;departmentId:string;permission:string|null}[]>(`SELECT r.id,r.name,r.department_id AS departmentId,p.permission FROM users u JOIN access_user_roles a ON a.user_id=u.id JOIN access_roles r ON r.id=a.role_id AND r.active=1 JOIN access_departments d ON d.id=r.department_id AND d.active=1 LEFT JOIN access_role_permissions p ON p.role_id=r.id WHERE u.id=? AND ${enabledSql} ORDER BY r.id,p.permission`,userId);
  const roles=new Map<string,Access['roles'][number]>(),keys=new Set<string>();
  for(const row of rows){roles.set(row.id,{id:row.id,name:row.name,departmentId:row.departmentId});if(row.permission&&permissionKeySet.has(row.permission))keys.add(row.permission);}
  return {ready:true,keys,roles:[...roles.values()]};
}
/** No fallback to is_admin, presets, legacy rows, or cached grants. */
export async function readAccess(db:Db,userId:number):Promise<Access>{
  try{validUser(userId);await assertAccessControlSchema(db);if(!await ready(db))return empty();return await effective(db,userId);}catch{return empty();}
}
/** Includes inactive assignments: disabling a role must not turn staff into an ordinary account. */
export async function hasStoredAssignments(db:Db,userId:number):Promise<boolean>{
  validUser(userId);await assertAccessControlSchema(db);
  const rows=await db.$queryRaw<{n:bigint}[]>`SELECT COUNT(*) AS n FROM access_user_roles WHERE user_id=${userId}`;
  return Number(rows[0].n)>0;
}
async function stateLock(tx:Tx){const rows=await tx.$queryRaw<{initialized_at:Date|null}[]>`SELECT initialized_at FROM access_control_state WHERE id=1 FOR UPDATE`;if(!rows[0]?.initialized_at)throw new Error('access_not_initialized');}
async function graph(tx:Db){
  const departments=await tx.$queryRaw<{id:string;name:string;active:number}[]>`SELECT id,name,active FROM access_departments ORDER BY id`;
  const roles=await tx.$queryRaw<{id:string;name:string;department_id:string;active:number;system_role:number}[]>`SELECT id,name,department_id,active,system_role FROM access_roles ORDER BY id`;
  const permissions=await tx.$queryRaw<{role_id:string;permission:string}[]>`SELECT role_id,permission FROM access_role_permissions ORDER BY role_id,permission`;
  const rows=await tx.$queryRaw<{user_id:bigint;role_id:string}[]>`SELECT user_id,role_id FROM access_user_roles ORDER BY user_id,role_id`;
  return {departments,roles,permissions,assignments:rows.map(row=>({userId:String(row.user_id),roleId:row.role_id}))};
}
async function audit(tx:Tx,actor:AccessActor|null,action:string,target:string,reason:string,before:unknown,after:unknown){
  await tx.$executeRaw`INSERT INTO access_audit(actor_id,action,target,reason,before_json,after_json,ip,session_fingerprint) VALUES(${actor?.userId??null},${action},${target},${reason},${JSON.stringify(before)},${JSON.stringify(after)},${actor?.ip??null},${actor?.sessionFingerprint??null})`;
  await tx.$executeRaw`UPDATE access_control_state SET revision=revision+1 WHERE id=1`;
}
async function managersRemain(tx:Tx){
  const rows=await tx.$queryRawUnsafe<{n:bigint}[]>(`SELECT COUNT(DISTINCT u.id) AS n FROM users u JOIN access_user_roles a ON a.user_id=u.id JOIN access_roles r ON r.id=a.role_id AND r.active=1 JOIN access_departments d ON d.id=r.department_id AND d.active=1 JOIN access_role_permissions p ON p.role_id=r.id AND BINARY p.permission=? WHERE ${enabledSql}`,MANAGE);
  if(Number(rows[0].n)<1)throw new Error('access_last_manager');
}
async function noSelfEscalation(tx:Tx,actor:AccessActor,before:Set<string>){for(const key of (await effective(tx,actor.userId)).keys)if(!before.has(key))throw new Error('access_self_escalation');}
async function requireMfa(tx:Tx,required:boolean){
  if(!required)return;
  // Lock actual credential rows too: the policy mutex alone cannot serialize a
  // concurrent credential rotation. No permission is committed on a stale read.
  const credentials=await tx.$queryRawUnsafe<{id:bigint;version:string|null}[]>(`SELECT u.id,m.version FROM users u LEFT JOIN auth_mfa m ON m.user_id=u.id WHERE ${enabledSql} AND EXISTS(SELECT 1 FROM access_user_roles a WHERE a.user_id=u.id) ORDER BY u.id FOR UPDATE`);
  if(credentials.some(row=>!row.version))throw new Error('access_mfa_required');
}
async function mutate<T>(db:PrismaClient,actor:AccessActor,action:string,target:string,reason:string,run:(tx:Tx)=>Promise<T>):Promise<T>{
  validActor(actor);reason=text(reason,1000);await assertAccessControlSchema(db);
  return db.$transaction(async tx=>{
    await stateLock(tx);
    const access=await effective(tx,actor.userId);if(!access.keys.has(MANAGE))throw new Error('access_forbidden');
    const mfa=await lockAuthPolicy(tx),before=await graph(tx);
    const result=await run(tx);
    await noSelfEscalation(tx,actor,access.keys);await managersRemain(tx);await requireMfa(tx,mfa);
    await audit(tx,actor,action,target,reason,before,await graph(tx));
    return result;
  },{isolationLevel:'ReadCommitted',maxWait:10000,timeout:30000});
}
/** Explicit operator migration. Only the first successful transaction imports legacy grants. */
export async function initializeAccessControl(db:PrismaClient,actor?:AccessActor,bootstrapManagerIds:readonly number[]=[]):Promise<void>{
  if(actor)validActor(actor);
  for(const ddl of ACCESS_CONTROL_DDL)await db.$executeRawUnsafe(ddl);
  await assertAccessControlSchema(db);
  await db.$transaction(async tx=>{
    await tx.$executeRaw`INSERT IGNORE INTO access_control_state(id) VALUES(1)`;
    const [state]=await tx.$queryRaw<{initialized_at:Date|null}[]>`SELECT initialized_at FROM access_control_state WHERE id=1 FOR UPDATE`;
    if(state.initialized_at)return;
    // Access management is sensitive too. No preset or legacy administrator
    // automatically receives it; the operator must name initial custodians.
    if(!actor||!bootstrapManagerIds.length||bootstrapManagerIds.length>20)throw new Error('access_bootstrap_manager_required');
    const managers=[...new Set(bootstrapManagerIds.map(validUser))];
    if(actor){const allowed=await tx.$queryRawUnsafe<{id:bigint}[]>(`SELECT u.id FROM users u WHERE u.id=? AND u.is_admin=1 AND ${enabledSql} FOR UPDATE`,actor.userId);if(!allowed.length)throw new Error('access_forbidden');}
    const before=await graph(tx);
    // Partial/pre-existing assignments need explicit investigation, never an overwrite.
    if(before.roles.length||before.departments.length||before.assignments.length||before.permissions.length)throw new Error('access_not_initialized');
    const mfa=await lockAuthPolicy(tx);
    for(const d of DEPARTMENTS)await tx.$executeRaw`INSERT INTO access_departments(id,name,active) VALUES(${d.id},${d.name},1)`;
    for(const role of DEFAULT_ROLES){
      await tx.$executeRaw`INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES(${role.id},${role.name},${role.departmentId},1,1)`;
      for(const key of checkedKeys(role.permissions).filter(k=>!SENSITIVE_KEYS.has(k)))await tx.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES(${role.id},${key})`;
    }
    const roots=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM users WHERE is_admin=1 ORDER BY id`;
    for(const root of roots)await tx.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(${root.id},'system_access_admin')`;
    const custodian='bootstrap_access_manager';
    await tx.$executeRaw`INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES(${custodian},'مسؤول صلاحيات معتمد صراحة','technical',1,1)`;
    for(const key of [...DEFAULT_ROLES[0].permissions,MANAGE])await tx.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES(${custodian},${key})`;
    for(const id of managers){
      const users=await tx.$queryRawUnsafe<{id:bigint}[]>(`SELECT u.id FROM users u WHERE u.id=? AND u.is_admin=1 AND ${enabledSql} FOR UPDATE`,id);
      if(!users.length)throw new Error('access_forbidden');
      await tx.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(${id},${custodian})`;
    }
    const legacy=await tx.$queryRaw<{user_id:bigint;perm:string}[]>`SELECT p.user_id,p.perm FROM admin_perms p JOIN users u ON u.id=p.user_id WHERE u.is_admin<>1 UNION SELECT a.user_id,p.perm FROM admin_roles a JOIN role_perms p ON p.role=a.role JOIN users u ON u.id=a.user_id WHERE u.is_admin<>1`;
    const grants=new Map<string,Set<string>>();
    for(const row of legacy){const key=legacyPermission(row.perm);if(!key||SENSITIVE_KEYS.has(key))continue;const id=String(row.user_id);if(!grants.has(id))grants.set(id,new Set());grants.get(id)!.add(key);}
    for(const [userId,keys] of grants){
      const id='legacy_user_'+userId;
      await tx.$executeRaw`INSERT INTO access_roles(id,name,department_id,active,system_role) VALUES(${id},${'صلاحيات سابقة — '+userId},'technical',1,1)`;
      for(const key of [...keys].sort())await tx.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES(${id},${key})`;
      await tx.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(${BigInt(userId)},${id})`;
    }
    await managersRemain(tx);await requireMfa(tx,mfa);
    await tx.$executeRaw`UPDATE access_control_state SET initialized_at=UTC_TIMESTAMP(3) WHERE id=1`;
    await audit(tx,actor,'initialize','access-control','Explicit migration; access-management custodians explicitly nominated: '+managers.join(','),before,await graph(tx));
  },{isolationLevel:'ReadCommitted',maxWait:10000,timeout:60000});
}
export async function saveDepartment(db:PrismaClient,actor:AccessActor,input:DepartmentInput):Promise<string>{
  const id=input.id?slug(input.id):'department_'+randomUUID(),name=text(input.name,120),enabled=active(input.active);
  return mutate(db,actor,'department.save',id,input.reason,async tx=>{
    if(input.id){const rows=await tx.$queryRaw<{id:string}[]>`SELECT id FROM access_departments WHERE id=${id}`;if(!rows.length)throw new Error('access_department_missing');await tx.$executeRaw`UPDATE access_departments SET name=${name},active=${enabled} WHERE id=${id}`;}
    else await tx.$executeRaw`INSERT INTO access_departments(id,name,active) VALUES(${id},${name},${enabled})`;
    return id;
  });
}
export async function saveRole(db:PrismaClient,actor:AccessActor,input:RoleInput):Promise<string>{
  const id=input.id?slug(input.id):'role_'+randomUUID(),name=text(input.name,120),department=slug(input.departmentId),enabled=active(input.active),keys=checkedKeys(input.permissions);
  return mutate(db,actor,'role.save',id,input.reason,async tx=>{
    const departments=await tx.$queryRaw<{id:string}[]>`SELECT id FROM access_departments WHERE id=${department}`;if(!departments.length)throw new Error('access_department_missing');
    if(input.id){const roles=await tx.$queryRaw<{id:string}[]>`SELECT id FROM access_roles WHERE id=${id}`;if(!roles.length)throw new Error('access_role_missing');await tx.$executeRaw`UPDATE access_roles SET name=${name},department_id=${department},active=${enabled} WHERE id=${id}`;}
    else await tx.$executeRaw`INSERT INTO access_roles(id,name,department_id,active) VALUES(${id},${name},${department},${enabled})`;
    await tx.$executeRaw`DELETE FROM access_role_permissions WHERE role_id=${id}`;
    for(const key of keys)await tx.$executeRaw`INSERT INTO access_role_permissions(role_id,permission) VALUES(${id},${key})`;
    return id;
  });
}
export async function assignUserRoles(db:PrismaClient,actor:AccessActor,input:AssignmentInput):Promise<void>{
  const userId=validUser(input.userId);
  if(!Array.isArray(input.roleIds)||input.roleIds.length>50)throw new Error('access_input_invalid');
  const roleIds=[...new Set(input.roleIds.map(slug))].sort();
  return mutate(db,actor,'user.roles',String(userId),input.reason,async tx=>{
    const users=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM users WHERE id=${userId} FOR UPDATE`;if(!users.length)throw new Error('access_user_missing');
    if(roleIds.length){const enabled=await tx.$queryRawUnsafe<{id:bigint}[]>(`SELECT u.id FROM users u WHERE u.id=? AND ${enabledSql}`,userId);if(!enabled.length)throw new Error('access_user_disabled');}
    for(const id of roleIds){const roles=await tx.$queryRaw<{id:string}[]>`SELECT id FROM access_roles WHERE id=${id}`;if(!roles.length)throw new Error('access_role_missing');}
    await tx.$executeRaw`DELETE FROM access_user_roles WHERE user_id=${userId}`;
    for(const id of roleIds)await tx.$executeRaw`INSERT INTO access_user_roles(user_id,role_id) VALUES(${userId},${id})`;
  });
}
async function accountState(tx:Db,userId:number){
  const rows=await tx.$queryRawUnsafe<{id:bigint;is_admin:number;ban:string;ban_until:Date|null;archived_at:Date|null;merged_into:bigint|null;enabled:number;legacy_staff:number}[]>(`SELECT u.id,u.is_admin,u.ban,u.ban_until,u.archived_at,u.merged_into,(${enabledSql}) AS enabled,(u.is_admin=1 OR EXISTS(SELECT 1 FROM admin_perms p WHERE p.user_id=u.id) OR EXISTS(SELECT 1 FROM admin_roles r WHERE r.user_id=u.id)) AS legacy_staff FROM users u WHERE u.id=?`,userId);
  const u=rows[0];if(!u)return null;
  const assignments=await tx.$queryRaw<{role_id:string}[]>`SELECT role_id FROM access_user_roles WHERE user_id=${userId} ORDER BY role_id`;
  return {id:String(u.id),isAdmin:Number(u.is_admin)===1,ban:u.ban,banUntil:u.ban_until?.toISOString()??null,archivedAt:u.archived_at?.toISOString()??null,mergedInto:u.merged_into===null?null:String(u.merged_into),enabled:!!Number(u.enabled),staff:!!Number(u.legacy_staff)||assignments.length>0,roleIds:assignments.map(r=>r.role_id)};
}
/** Lifecycle operations cannot delete, ban, merge or archive a staff account.
 * Role removal is a separate audited action which cannot remove the last manager.
 * The supplied callback must use this transaction; no cleanup may precede it. */
export async function withUnassignedAccountChange<T>(db:PrismaClient,targetUserId:number,run:(tx:Tx)=>Promise<T>):Promise<T>{
  validUser(targetUserId);await assertAccessControlSchema(db);
  return db.$transaction(async tx=>{
    await stateLock(tx);
    const rows=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM users WHERE id=${targetUserId} FOR UPDATE`;
    if(!rows.length)throw new Error('access_user_missing');
    const assignments=await tx.$queryRaw<{role_id:string}[]>`SELECT role_id FROM access_user_roles WHERE user_id=${targetUserId}`;
    if(assignments.length)throw new Error('rbac_remove_roles_first');
    return run(tx);
  },{isolationLevel:'ReadCommitted',maxWait:10000,timeout:30000});
}
/** Caller checks the operation-specific capability; this guard adds atomic staff/last-manager protection. */
export async function withAccountStateChange<T>(db:PrismaClient,actor:AccessActor,targetUserId:number,reason:string,run:(tx:Tx)=>Promise<T>):Promise<T>{
  validActor(actor);validUser(targetUserId);reason=text(reason,1000);await assertAccessControlSchema(db);
  return db.$transaction(async tx=>{
    await stateLock(tx);
    const access=await effective(tx,actor.userId),before=await accountState(tx,targetUserId);
    if(!before)throw new Error('access_user_missing');
    if(before.staff&&!access.keys.has(MANAGE))throw new Error('access_forbidden');
    const mfa=await lockAuthPolicy(tx),result=await run(tx);
    await managersRemain(tx);await noSelfEscalation(tx,actor,access.keys);await requireMfa(tx,mfa);
    await audit(tx,actor,'account.state',String(targetUserId),reason,before,await accountState(tx,targetUserId));
    return result;
  },{isolationLevel:'ReadCommitted',maxWait:10000,timeout:30000});
}
export async function readAccessAdmin(db:PrismaClient,options:{q?:string;userId?:number}={}):Promise<AccessAdminData>{
  await assertAccessControlSchema(db);
  return db.$transaction(async tx=>{
    if(!await ready(tx))return {ready:false,departments:[],roles:[],assignments:[],users:[],audit:[]};
    const data=await graph(tx),selected=options.userId===undefined?null:validUser(options.userId);
    const q=(options.q??'').trim().slice(0,120),pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
    const users=await tx.$queryRawUnsafe<{id:bigint;name:string|null;userName:string|null;phone:string|null;enabled:number}[]>(`SELECT u.id,u.name,u.userName,u.phoneNumber AS phone,(${enabledSql}) AS enabled FROM users u WHERE (? IS NOT NULL AND u.id=?) OR (? IS NULL AND (?='' OR u.name LIKE ? OR u.userName LIKE ? OR u.phoneNumber LIKE ?)) ORDER BY u.id DESC LIMIT 100`,selected,selected,selected,q,pattern,pattern,pattern);
    const rows=await tx.$queryRaw<{id:bigint;created_at:Date;actor_id:bigint|null;action:string;target:string;reason:string;before_json:unknown;after_json:unknown;ip:string|null;session_fingerprint:string|null}[]>`SELECT id,created_at,actor_id,action,target,reason,before_json,after_json,ip,session_fingerprint FROM access_audit ORDER BY id DESC LIMIT 100`;
    const assignments=new Map<number,string[]>();for(const row of data.assignments){const id=Number(row.userId);if(!assignments.has(id))assignments.set(id,[]);assignments.get(id)!.push(row.roleId);}
    return {ready:true,departments:data.departments.map(d=>({id:d.id,name:d.name,active:Number(d.active)===1})),roles:data.roles.map(r=>({id:r.id,name:r.name,departmentId:r.department_id,active:Number(r.active)===1,permissions:data.permissions.filter(p=>p.role_id===r.id).map(p=>p.permission),userCount:data.assignments.filter(a=>a.roleId===r.id).length})),assignments:[...assignments].map(([userId,roleIds])=>({userId,roleIds})),users:users.map(u=>({id:Number(u.id),name:u.name??'',userName:u.userName??'',phone:u.phone??'',enabled:!!Number(u.enabled)})),audit:rows.map(a=>({id:String(a.id),at:a.created_at.toISOString(),actorId:a.actor_id===null?null:Number(a.actor_id),action:a.action,target:a.target,reason:a.reason,before:parseJson(a.before_json),after:parseJson(a.after_json),ip:a.ip,sessionFingerprint:a.session_fingerprint}))};
  },{isolationLevel:'RepeatableRead',timeout:30000});
}
