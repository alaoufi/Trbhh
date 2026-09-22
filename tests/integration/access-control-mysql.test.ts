import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {PrismaClient} from '@prisma/client';
import {ACCESS_CONTROL_DDL,ACCESS_CONTROL_TABLES,assertAccessControlSchema} from '@/lib/access-control/schema';
import {initializeAccessControl,readAccess,readAccessAdmin,saveDepartment,saveRole,assignUserRoles,hasStoredAssignments,withUnassignedAccountChange,withAccountStateChange,type AccessActor} from '@/lib/access-control/store';
import {SENSITIVE_KEYS,DEFAULT_ROLES} from '@/lib/access-control/catalog';
import {lockAuthPolicy} from '@/lib/auth-policy-lock';
import {isolatedAccessUrl} from '../../vitest.access-control.config';

describe('isolated RBAC fixture contract',()=>{
  it.each([undefined,'mysql://root:test@remote:33309/trbhh_rbac_test','mysql://root:test@127.0.0.1:3306/trbhh_rbac_test','mysql://root:test@127.0.0.1:33309/production','mysql://root:test@127.0.0.1:33309/trbhh_rbac_test?schema=other','mysql://root:test@127.0.0.1:33309/trbhh_rbac_test#other','postgres://root:test@127.0.0.1:33309/trbhh_rbac_test','mysql://root@127.0.0.1:33309/trbhh_rbac_test','mysql://app:test@127.0.0.1:33309/trbhh_rbac_test'])('refuses unsafe DB URL %s',raw=>expect(()=>isolatedAccessUrl(raw)).toThrow('Refusing non-isolated RBAC DB'));
  it('accepts only root credentials injected for the exact loopback fixture',()=>expect(isolatedAccessUrl('mysql://root:test@127.0.0.1:33309/trbhh_rbac_test').pathname).toBe('/trbhh_rbac_test'));
  it('Prisma models emit every additive table and restrictive relation offline',()=>{
    const sql=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{encoding:'utf8',timeout:20000,env:{...process.env,DATABASE_URL:'mysql://fixture:fixture@127.0.0.1:33309/trbhh_rbac_test'}});
    for(const name of ACCESS_CONTROL_TABLES)expect(sql).toContain('CREATE TABLE `'+name+'`');
    for(const name of ['access_role_department_fk','access_permission_role_fk','access_assignment_user_fk','access_assignment_role_fk'])expect(sql).toMatch(new RegExp('CONSTRAINT `'+name+'`[^;]+ON DELETE RESTRICT ON UPDATE RESTRICT'));
  });
  it('no default role contains exceptional financial permissions',()=>{for(const role of DEFAULT_ROLES)for(const key of role.permissions)expect(SENSITIVE_KEYS.has(key)).toBe(false);});
});
const enabled=process.env.RBAC_DB_TESTS==='1';
let db:PrismaClient,peer:PrismaClient,admin:PrismaClient,created=false;
const actor:AccessActor={userId:1,ip:'127.0.0.1',sessionFingerprint:'a'.repeat(64)};
const actor2:AccessActor={userId:2,ip:'::1',sessionFingerprint:'b'.repeat(64)};
const why='Synthetic authorization reviewed';
const manager='system_access_admin';
const tables=['access_audit','access_user_roles','access_role_permissions','access_roles','access_departments','access_control_state','auth_mfa','site_settings','admin_perms','admin_roles','role_perms','users'];
const fixtureDdl=[
  "CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,name VARCHAR(255) NULL,userName VARCHAR(255) NULL,phoneNumber VARCHAR(255) NULL,is_admin TINYINT NOT NULL DEFAULT 0,ban ENUM('checked','no') NULL DEFAULT 'no',ban_until DATETIME NULL,archived_at DATETIME NULL,merged_into BIGINT NULL,auth_session_version VARCHAR(64) NOT NULL DEFAULT '0') ENGINE=InnoDB",
  'CREATE TABLE admin_perms(user_id BIGINT UNSIGNED NOT NULL,perm VARCHAR(40) NOT NULL,PRIMARY KEY(user_id,perm)) ENGINE=InnoDB',
  'CREATE TABLE admin_roles(user_id BIGINT UNSIGNED PRIMARY KEY,role VARCHAR(20) NOT NULL) ENGINE=InnoDB',
  'CREATE TABLE role_perms(role VARCHAR(20) NOT NULL,perm VARCHAR(40) NOT NULL,PRIMARY KEY(role,perm)) ENGINE=InnoDB',
  'CREATE TABLE site_settings(k VARCHAR(100) PRIMARY KEY,v TEXT NOT NULL) ENGINE=InnoDB',
  'CREATE TABLE auth_mfa(user_id BIGINT UNSIGNED PRIMARY KEY,version VARCHAR(64) NOT NULL) ENGINE=InnoDB',
];
async function total(table:string){if(!tables.includes(table))throw new Error('Unknown fixture table');return Number((await db.$queryRawUnsafe<{n:bigint}[]>('SELECT COUNT(*) AS n FROM '+table))[0].n);}
async function setup(){await initializeAccessControl(db,actor);}
async function role(keys=['ads:view'],departmentId='support',active=true){return saveRole(db,actor,{name:'Synthetic role',departmentId,active,permissions:keys,reason:why});}
async function assign(userId:number,roleIds:string[],by=actor){await assignUserRoles(db,by,{userId,roleIds,reason:why});}
async function enroll(ids=[1,2]){for(const id of ids)await db.$executeRaw`INSERT INTO auth_mfa(user_id,version) VALUES(${id},'fixture-mfa-v1') ON DUPLICATE KEY UPDATE version=VALUES(version)`;}
async function policy(){await db.$executeRaw`INSERT INTO site_settings(k,v) VALUES('auth_require_admin_mfa','1') ON DUPLICATE KEY UPDATE v='1'`;}
async function failAudit(run:()=>Promise<unknown>){
  await db.$executeRawUnsafe('ALTER TABLE access_audit ADD COLUMN fixture_required INT NOT NULL');
  try{await expect(run()).rejects.toMatchObject({code:'P2010',meta:{code:'1364',message:expect.stringContaining('fixture_required')}});}
  finally{await db.$executeRawUnsafe('ALTER TABLE access_audit DROP COLUMN fixture_required');}
}
describe.runIf(enabled)('RBAC real isolated MySQL transactions',()=>{
  beforeAll(async()=>{
    const url=isolatedAccessUrl(process.env.RBAC_TEST_DATABASE_URL),adminUrl=new URL(url);adminUrl.pathname='/mysql';
    db=new PrismaClient({datasources:{db:{url:url.href}}});peer=new PrismaClient({datasources:{db:{url:url.href}}});admin=new PrismaClient({datasources:{db:{url:adminUrl.href}}});
    await admin.$executeRawUnsafe('CREATE DATABASE trbhh_rbac_test CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');created=true;
    expect((await db.$queryRaw<{db:string}[]>`SELECT DATABASE() AS db`)[0].db).toBe('trbhh_rbac_test');
    const [modes]=await db.$queryRaw<{g:string;s:string}[]>`SELECT @@GLOBAL.sql_mode AS g,@@SESSION.sql_mode AS s`;
    for(const mode of [modes.g,modes.s])expect(mode).toMatch(/\bSTRICT_(?:TRANS|ALL)_TABLES\b/);
    for(const ddl of [...fixtureDdl,...ACCESS_CONTROL_DDL])await db.$executeRawUnsafe(ddl);
    await assertAccessControlSchema(db);
  });
  afterAll(async()=>{
    await Promise.all([db?.$disconnect(),peer?.$disconnect()]);
    try{if(created)await admin.$executeRawUnsafe('DROP DATABASE trbhh_rbac_test');}finally{await admin?.$disconnect();}
  });
  beforeEach(async()=>{
    for(const table of tables)await db.$executeRawUnsafe('DELETE FROM '+table);
    await db.$executeRaw`INSERT INTO users(id,name,userName,is_admin) VALUES(1,'First operator','operator_one',1),(2,'Second operator','operator_two',1),(3,'Legacy staff','legacy',0),(4,'Empty legacy matrix','empty_legacy',0),(5,'Ordinary user','ordinary',0),(6,'Other user','other',0)`;
  });
  it('refuses replacement of an existing fixture database',async()=>{await expect(admin.$executeRawUnsafe('CREATE DATABASE trbhh_rbac_test')).rejects.toThrow();expect(await total('users')).toBe(6);});
  it('reads fail closed without creating state or importing old is_admin grants',async()=>{
    expect(await readAccess(db,1)).toEqual({ready:false,keys:new Set(),roles:[]});expect(await total('access_control_state')).toBe(0);expect(await total('access_user_roles')).toBe(0);
  });
  it('imports exact legacy union once, excluding sensitive keys and empty preset fallback, preserving legacy rows',async()=>{
    await db.$executeRaw`INSERT INTO admin_perms(user_id,perm) VALUES(3,'classified:edit'),(3,'finance:approve'),(3,'finance:export'),(3,'unknown:view')`;
    await db.$executeRaw`INSERT INTO admin_roles(user_id,role) VALUES(3,'fixture_editor'),(4,'moderator')`;
    await db.$executeRaw`INSERT INTO role_perms(role,perm) VALUES('fixture_editor','ads:view'),('fixture_editor','users:add')`;
    const old=await db.$queryRaw`SELECT * FROM admin_perms ORDER BY user_id,perm`;
    await setup();
    expect((await readAccess(db,3)).keys).toEqual(new Set(['classified:edit','ads:view','users:create']));
    expect((await readAccess(db,4)).keys.size).toBe(0);
    for(const key of (await readAccess(db,1)).keys)expect(SENSITIVE_KEYS.has(key)).toBe(false);
    expect((await readAccess(db,1)).keys.has('access_control:manage_settings')).toBe(true);
    expect(await db.$queryRaw`SELECT * FROM admin_perms ORDER BY user_id,perm`).toEqual(old);
    const before=await db.$queryRaw`SELECT * FROM access_audit`;
    await initializeAccessControl(peer,actor2);expect(await db.$queryRaw`SELECT * FROM access_audit`).toEqual(before);
    await assign(3,[]);await db.$executeRaw`INSERT INTO admin_perms(user_id,perm) VALUES(3,'users:edit')`;
    await setup();expect((await readAccess(db,3)).keys.size).toBe(0);
  });
  it('legacy null ban and merged_into zero remain enabled',async()=>{
    await db.$executeRaw`UPDATE users SET ban=NULL,merged_into=0 WHERE id=1`;await setup();
    expect((await readAccess(db,1)).keys.has('access_control:manage_settings')).toBe(true);
  });
  it('rejects a nonadministrator migration operator before importing anything',async()=>{
    await expect(initializeAccessControl(db,{...actor,userId:5})).rejects.toThrow('access_forbidden');expect(await total('access_roles')).toBe(0);expect(await total('access_audit')).toBe(0);
  });
  it('migration without an enabled access manager rolls back every grant',async()=>{
    await db.$executeRaw`UPDATE users SET ban='checked' WHERE is_admin=1`;
    await expect(initializeAccessControl(db)).rejects.toThrow('access_last_manager');expect(await total('access_roles')).toBe(0);expect(await total('access_control_state')).toBe(0);
  });
  it('unions multiple roles and fresh reads immediately reflect role and department disable',async()=>{
    await setup();const first=await role(['ads:view']),second=await role(['users:view'],'sales');await assign(5,[first,second]);
    expect((await readAccess(db,5)).keys).toEqual(new Set(['ads:view','users:view']));
    await saveRole(db,actor,{id:first,name:'Synthetic role',departmentId:'support',active:false,permissions:['ads:view'],reason:why});
    expect((await readAccess(peer,5)).keys).toEqual(new Set(['users:view']));
    await saveDepartment(db,actor,{id:'sales',name:'Synthetic department',active:false,reason:why});expect((await readAccess(peer,5)).keys.size).toBe(0);
    expect(await hasStoredAssignments(db,5)).toBe(true);
  });
  it('disabled accounts get no effective permissions and cannot receive new roles',async()=>{
    await setup();await db.$executeRaw`UPDATE users SET archived_at=UTC_TIMESTAMP() WHERE id=5`;
    await expect(assign(5,[manager])).rejects.toThrow('access_user_disabled');
    await db.$executeRaw`UPDATE users SET ban='checked' WHERE id=1`;expect((await readAccess(db,1)).keys.size).toBe(0);
  });
  it('unknown keys and duplicate forged IDs never create partial roles or grants',async()=>{
    await setup();const before=await total('access_audit');
    await expect(role(['ads:view','finance:superuser'])).rejects.toThrow('access_unknown_permission');
    await expect(assign(5,[manager,'nonexistent'])).rejects.toThrow('access_role_missing');
    expect(await hasStoredAssignments(db,5)).toBe(false);expect(await total('access_audit')).toBe(before);
  });
  it('own assignment cannot gain sensitive permissions even for an access manager',async()=>{
    await setup();const elevated=await role(['settlements:approve'],'finance');
    await expect(assign(1,[manager,elevated])).rejects.toThrow('access_self_escalation');
    expect((await readAccess(db,1)).keys.has('settlements:approve')).toBe(false);
    await assign(1,[manager,elevated],actor2);expect((await readAccess(db,1)).keys.has('settlements:approve')).toBe(true);
  });
  it('editing an assigned role cannot increase the actor own effective keys',async()=>{
    await setup();const item=await role([]);await assign(1,[manager,item]);
    await expect(saveRole(db,actor,{id:item,name:'Synthetic role',departmentId:'support',active:true,permissions:['settlements:approve'],reason:why})).rejects.toThrow('access_self_escalation');
    expect((await readAccess(db,1)).keys.has('settlements:approve')).toBe(false);
  });
  it('role and department activation cannot be used for own escalation',async()=>{
    await setup();const item=await role(['settlements:approve'],'finance',false);await assign(1,[manager,item]);
    await expect(saveRole(db,actor,{id:item,name:'Synthetic role',departmentId:'finance',active:true,permissions:['settlements:approve'],reason:why})).rejects.toThrow('access_self_escalation');
    await saveDepartment(db,actor,{id:'finance',name:'Finance',active:false,reason:why});
    await saveRole(db,actor,{id:item,name:'Synthetic role',departmentId:'finance',active:true,permissions:['settlements:approve'],reason:why});
    await expect(saveDepartment(db,actor,{id:'finance',name:'Finance',active:true,reason:why})).rejects.toThrow('access_self_escalation');
  });
  it('only one simultaneous self demotion can succeed, preserving the final manager',async()=>{
    await setup();
    const results=await Promise.allSettled([assignUserRoles(db,actor,{userId:1,roleIds:[],reason:why}),assignUserRoles(peer,actor2,{userId:2,roleIds:[],reason:why})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect([await readAccess(db,1),await readAccess(db,2)].filter(r=>r.keys.has('access_control:manage_settings'))).toHaveLength(1);
    const rejected=results.find(r=>r.status==='rejected');expect(rejected&&rejected.status==='rejected'?rejected.reason.message:'').toBe('access_last_manager');
  });
  it('last manager cannot be removed through role or department disable',async()=>{
    await setup();await assign(2,[]);
    await expect(saveRole(db,actor,{id:manager,name:'Manager',departmentId:'technical',active:false,permissions:['access_control:manage_settings'],reason:why})).rejects.toThrow('access_last_manager');
    await expect(saveDepartment(db,actor,{id:'technical',name:'Technical',active:false,reason:why})).rejects.toThrow('access_last_manager');
  });
  it('a revoked actor cannot mutate after an earlier successful outer permission read',async()=>{
    await setup();expect((await readAccess(db,1)).keys.has('access_control:manage_settings')).toBe(true);
    await assign(1,[],actor2);await expect(role()).rejects.toThrow('access_forbidden');
  });
  it('MFA policy blocks assigning an unenrolled staff user and allows an enrolled one',async()=>{
    await setup();await enroll();await policy();const item=await role();
    await expect(assign(5,[item])).rejects.toThrow('access_mfa_required');expect(await hasStoredAssignments(db,5)).toBe(false);
    await enroll([5]);await assign(5,[item]);expect((await readAccess(db,5)).keys.has('ads:view')).toBe(true);
  });
  it('MFA policy prevents empty-role edits and department reactivation for unenrolled assignees',async()=>{
    await setup();const item=await role([]);await assign(5,[item]);await enroll();await policy();
    await expect(saveRole(db,actor,{id:item,name:'Edited role',departmentId:'support',active:true,permissions:['ads:view'],reason:why})).rejects.toThrow('access_mfa_required');
    await db.$executeRaw`UPDATE access_departments SET active=0 WHERE id='support'`;
    await expect(saveDepartment(db,actor,{id:'support',name:'Support',active:true,reason:why})).rejects.toThrow('access_mfa_required');
    expect((await readAccess(db,5)).keys.size).toBe(0);
  });
  it('waits for a concurrent policy transaction, then rejects its unenrolled grant',async()=>{
    await setup();await enroll();const item=await role();
    let locked!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{locked=r;}),resume=new Promise<void>(r=>{release=r;});
    const setting=peer.$transaction(async tx=>{await lockAuthPolicy(tx);locked();await resume;await tx.$executeRaw`UPDATE site_settings SET v='1' WHERE k='auth_require_admin_mfa'`;});
    await ready;
    const granting=expect(assign(5,[item])).rejects.toThrow('access_mfa_required');release();await setting;
    await granting;expect(await hasStoredAssignments(db,5)).toBe(false);
  });
  it('audit metadata includes exact old/new state, IP and fingerprint, without a raw session token',async()=>{
    await setup();const item=await role();await assign(5,[item]);
    const data=await readAccessAdmin(db,{userId:5}),entry=data.audit[0];
    expect(entry).toMatchObject({actorId:1,action:'user.roles',target:'5',reason:why,ip:actor.ip,sessionFingerprint:actor.sessionFingerprint});
    expect((entry.before as {assignments:unknown[]}).assignments).not.toContainEqual({userId:'5',roleId:item});
    expect((entry.after as {assignments:unknown[]}).assignments).toContainEqual({userId:'5',roleId:item});
    expect(data.users.map(u=>u.id)).toEqual([5]);expect(data.assignments).toContainEqual({userId:5,roleIds:[item]});
    expect(JSON.stringify(entry)).not.toContain('trbhh_session');
  });
  it('audit storage failure rolls role, grants and revision back atomically',async()=>{
    await setup();const before=await db.$queryRaw`SELECT * FROM access_control_state`,count=await total('access_roles');
    await failAudit(()=>role(['ads:view']));expect(await total('access_roles')).toBe(count);expect(await db.$queryRaw`SELECT * FROM access_control_state`).toEqual(before);
  });
  it('audit storage failure rolls assignment replacement back atomically',async()=>{
    await setup();const item=await role();await assign(5,[item]);const before=(await readAccess(db,5)).keys;
    await failAudit(()=>assign(5,[manager]));expect((await readAccess(db,5)).keys).toEqual(before);
  });
  it('audit storage failure rolls migration back with no partially initialized state',async()=>{
    await failAudit(()=>setup());expect(await total('access_roles')).toBe(0);expect(await total('access_user_roles')).toBe(0);expect(await total('access_control_state')).toBe(0);expect(await total('users')).toBe(6);
  });
  it('missing audit storage causes fail-closed reads and no mutation',async()=>{
    await setup();await db.$executeRawUnsafe('RENAME TABLE access_audit TO fixture_saved_audit');
    try{expect((await readAccess(db,1)).ready).toBe(false);await expect(role()).rejects.toThrow('access_schema_not_ready');}
    finally{await db.$executeRawUnsafe('RENAME TABLE fixture_saved_audit TO access_audit');}
  });
  it('lifecycle helper blocks even inactive staff before its callback executes',async()=>{
    await setup();const item=await role([], 'support',false);await assign(5,[item]);
    let ran=false;await expect(withUnassignedAccountChange(db,5,async tx=>{ran=true;await tx.$executeRaw`UPDATE users SET archived_at=UTC_TIMESTAMP() WHERE id=5`;})).rejects.toThrow('rbac_remove_roles_first');expect(ran).toBe(false);
  });
  it('simultaneous archive and assignment cannot both succeed',async()=>{
    await setup();const item=await role();
    const results=await Promise.allSettled([withUnassignedAccountChange(db,5,async tx=>{await tx.$executeRaw`UPDATE users SET archived_at=UTC_TIMESTAMP() WHERE id=5`;}),assignUserRoles(peer,actor,{userId:5,roleIds:[item],reason:why})]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    const [row]=await db.$queryRaw<{archived_at:Date|null}[]>`SELECT archived_at FROM users WHERE id=5`;
    expect(row.archived_at!==null&&await hasStoredAssignments(db,5)).toBe(false);
  });
  it('audited account-state helper prevents final manager disable and rolls back its account write',async()=>{
    await setup();await assign(2,[]);
    await expect(withAccountStateChange(db,actor,1,why,async tx=>{await tx.$executeRaw`UPDATE users SET ban='checked' WHERE id=1`;})).rejects.toThrow('access_last_manager');
    expect((await readAccess(db,1)).keys.has('access_control:manage_settings')).toBe(true);
  });
});
