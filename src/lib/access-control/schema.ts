import 'server-only';
import type {PrismaClient} from '@prisma/client';

const engine=' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
/** Additive storage only. Importing or reading permissions never runs a migration. */
export const ACCESS_CONTROL_DDL=[
  `CREATE TABLE IF NOT EXISTS access_control_state (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
    initialized_at DATETIME(3) NULL,
    CHECK(id=1)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS access_departments (
    id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL,
    active TINYINT NOT NULL DEFAULT 1, CHECK(active IN (0,1))
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS access_roles (
    id VARCHAR(64) NOT NULL PRIMARY KEY, name VARCHAR(120) NOT NULL,
    department_id VARCHAR(64) NOT NULL, active TINYINT NOT NULL DEFAULT 1,
    system_role TINYINT NOT NULL DEFAULT 0,
    CONSTRAINT access_role_department_fk FOREIGN KEY(department_id) REFERENCES access_departments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(active IN (0,1))
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS access_role_permissions (
    role_id VARCHAR(64) NOT NULL, permission VARCHAR(120) NOT NULL,
    PRIMARY KEY(role_id,permission),
    CONSTRAINT access_permission_role_fk FOREIGN KEY(role_id) REFERENCES access_roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS access_user_roles (
    user_id BIGINT UNSIGNED NOT NULL, role_id VARCHAR(64) NOT NULL,
    PRIMARY KEY(user_id,role_id), KEY access_assignment_role(role_id),
    CONSTRAINT access_assignment_user_fk FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT access_assignment_role_fk FOREIGN KEY(role_id) REFERENCES access_roles(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS access_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    actor_id BIGINT UNSIGNED NULL, action VARCHAR(40) NOT NULL, target VARCHAR(128) NOT NULL,
    reason VARCHAR(1000) NOT NULL, before_json JSON NOT NULL, after_json JSON NOT NULL,
    ip VARCHAR(45) NULL, session_fingerprint CHAR(64) NULL,
    KEY access_audit_created(created_at,id), KEY access_audit_actor(actor_id,id)
  )${engine}`,
] as const;
export const ACCESS_CONTROL_TABLES=ACCESS_CONTROL_DDL.map(sql=>sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]);
const primaryKeys:Record<string,string[]>={access_control_state:['id'],access_departments:['id'],access_roles:['id'],access_role_permissions:['role_id','permission'],access_user_roles:['user_id','role_id'],access_audit:['id']};
const requiredColumns:Record<string,string[]>={access_control_state:['id','revision','initialized_at'],access_departments:['id','name','active'],access_roles:['id','name','department_id','active','system_role'],access_role_permissions:['role_id','permission'],access_user_roles:['user_id','role_id'],access_audit:['id','created_at','actor_id','action','target','reason','before_json','after_json','ip','session_fingerprint']};
const foreignKeys=[['access_roles','department_id','access_departments','id'],['access_role_permissions','role_id','access_roles','id'],['access_user_roles','user_id','users','id'],['access_user_roles','role_id','access_roles','id']] as const;
export async function assertAccessControlSchema(db:Pick<PrismaClient,'$queryRaw'>):Promise<void>{
  try{
    const tables=await db.$queryRaw<{name:string;engine:string}[]>`SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'access\\_%'`;
    for(const name of ACCESS_CONTROL_TABLES)if(!tables.some(row=>row.name===name&&row.engine==='InnoDB'))throw new Error();
    const columns=await db.$queryRaw<{t:string;c:string}[]>`SELECT TABLE_NAME AS t,COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'access\\_%'`;
    for(const [table,names] of Object.entries(requiredColumns))for(const name of names)if(!columns.some(row=>row.t===table&&row.c===name))throw new Error();
    const keys=await db.$queryRaw<{t:string;i:string;c:string;seq:number;non_unique:number;prefix:number|null}[]>`SELECT TABLE_NAME AS t,INDEX_NAME AS i,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,NON_UNIQUE AS non_unique,SUB_PART AS prefix FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'access\\_%'`;
    for(const [table,columns] of Object.entries(primaryKeys)){
      const actual=keys.filter(row=>row.t===table&&row.i==='PRIMARY').sort((a,b)=>Number(a.seq)-Number(b.seq));
      if(actual.length!==columns.length||actual.some((row,index)=>row.c!==columns[index]||Number(row.non_unique)!==0||row.prefix!==null))throw new Error();
    }
    const relations=await db.$queryRaw<{t:string;c:string;p:string;r:string;local_parent:number;deletion:string;updates:string}[]>`SELECT k.TABLE_NAME AS t,k.COLUMN_NAME AS c,k.REFERENCED_TABLE_NAME AS p,k.REFERENCED_COLUMN_NAME AS r,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) AS local_parent,f.DELETE_RULE AS deletion,f.UPDATE_RULE AS updates FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.TABLE_NAME=k.TABLE_NAME AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME LIKE 'access\\_%'`;
    for(const [table,column,parent,reference] of foreignKeys)if(!relations.some(row=>row.t===table&&row.c===column&&row.p===parent&&row.r===reference&&Number(row.local_parent)===1&&['RESTRICT','NO ACTION'].includes(row.deletion)&&['RESTRICT','NO ACTION'].includes(row.updates)))throw new Error();
  }catch{throw new Error('access_schema_not_ready');}
}
