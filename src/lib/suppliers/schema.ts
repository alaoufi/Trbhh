import 'server-only';
import type {PrismaClient} from '@prisma/client';

type TableSpec={name:string;columns:Record<string,string>;primary:string[];unique:Record<string,string[]>;indexes:Record<string,string[]>;foreign:{name:string;columns:string[];parent:string;refs:string[]}[]};
/** Static source-owned SQL identifiers, never user input. */
const TABLES:TableSpec[] = [
  {
    name: "supplier_integration_profiles",
    columns: {
      oauth_generation: "INT NOT NULL DEFAULT 0",
      supplier_id: "BIGINT UNSIGNED NOT NULL",
      provider: "VARCHAR(16) NOT NULL",
      maintenance: "TINYINT NOT NULL DEFAULT 0",
      sync_enabled: "TINYINT NOT NULL DEFAULT 0",
      auto_orders_enabled: "TINYINT NOT NULL DEFAULT 0",
      mode: "VARCHAR(16) NOT NULL DEFAULT 'development'",
      last_sync_at: "DATETIME(3) NULL",
      last_error: "VARCHAR(80) NOT NULL DEFAULT ''",
    },
    primary: ["supplier_id"],
    unique: {},
    indexes: {},
    foreign: [
      {"name":"supplier_profile_supplier_fk","columns":["supplier_id"],"parent":"commerce_suppliers","refs":["id"]},
    ],
  },
  {
    name: "supplier_connections",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      supplier_id: "BIGINT UNSIGNED NOT NULL",
      provider: "VARCHAR(16) NOT NULL",
      external_store_id: "VARCHAR(191) NOT NULL",
      status: "VARCHAR(24) NOT NULL DEFAULT 'disconnected'",
      encrypted_tokens: "TEXT NULL",
      expires_at: "DATETIME(3) NULL",
      refresh_claim: "CHAR(36) NULL",
      refresh_claimed_at: "DATETIME(3) NULL",
      sync_claim: "CHAR(36) NULL",
      sync_claimed_at: "DATETIME(3) NULL",
      version: "INT NOT NULL DEFAULT 0",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      updated_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {"supplier_connection_store":["provider","external_store_id"]},
    indexes: {"supplier_connection_supplier":["supplier_id","id"],"supplier_connection_refresh":["status","expires_at"],"supplier_connection_sync":["sync_claimed_at","id"]},
    foreign: [
      {"name":"supplier_connection_supplier_fk","columns":["supplier_id"],"parent":"commerce_suppliers","refs":["id"]},
    ],
  },
  {
    name: "supplier_oauth_states",
    columns: {
      state_hash: "CHAR(64) NOT NULL",
      browser_hash: "CHAR(64) NOT NULL",
      oauth_generation: "INT NOT NULL DEFAULT 0",
      admin_id: "BIGINT UNSIGNED NOT NULL",
      supplier_id: "BIGINT UNSIGNED NOT NULL",
      expires_at: "DATETIME(3) NOT NULL",
      consumed_at: "DATETIME(3) NULL",
    },
    primary: ["state_hash"],
    unique: {},
    indexes: {"supplier_oauth_expiry":["expires_at"]},
    foreign: [
      {"name":"supplier_oauth_supplier_fk","columns":["supplier_id"],"parent":"commerce_suppliers","refs":["id"]},
    ],
  },
  {
    name: "supplier_products",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      connection_id: "BIGINT UNSIGNED NOT NULL",
      supplier_id: "BIGINT UNSIGNED NOT NULL",
      external_id: "VARCHAR(191) NOT NULL",
      sku: "VARCHAR(191) NOT NULL DEFAULT ''",
      name: "VARCHAR(255) NOT NULL",
      description: "TEXT NOT NULL",
      images: "JSON NOT NULL",
      variants: "JSON NOT NULL",
      options: "JSON NOT NULL",
      categories: "JSON NOT NULL",
      brand: "VARCHAR(255) NOT NULL DEFAULT ''",
      public_price_minor: "INT NOT NULL",
      currency: "VARCHAR(3) NOT NULL DEFAULT 'SAR'",
      quantity: "INT NULL",
      available: "TINYINT NOT NULL DEFAULT 0",
      source_updated_at: "DATETIME(3) NULL",
      last_sync_at: "DATETIME(3) NULL",
      sync_error: "VARCHAR(80) NOT NULL DEFAULT ''",
      active: "TINYINT NOT NULL DEFAULT 0",
      visible: "TINYINT NOT NULL DEFAULT 0",
      featured: "TINYINT NOT NULL DEFAULT 0",
      unit_cost_minor: "INT NULL",
      selling_price_minor: "INT NULL",
      pricing_policy: "VARCHAR(24) NOT NULL DEFAULT 'manual'",
      discount_minor: "INT NOT NULL DEFAULT 0",
      discount_bps: "INT NOT NULL DEFAULT 0",
      minimum_price_minor: "INT NOT NULL DEFAULT 0",
      minimum_margin_minor: "INT NOT NULL DEFAULT 0",
      commerce_product_id: "BIGINT UNSIGNED NULL",
      revision: "INT NOT NULL DEFAULT 0",
    },
    primary: ["id"],
    unique: {"supplier_product_external":["connection_id","external_id"],"supplier_product_commerce":["commerce_product_id"]},
    indexes: {"supplier_product_catalog":["supplier_id","id"],"supplier_product_public":["active","visible","id"]},
    foreign: [
      {"name":"supplier_product_connection_fk","columns":["connection_id"],"parent":"supplier_connections","refs":["id"]},
      {"name":"supplier_product_supplier_fk","columns":["supplier_id"],"parent":"commerce_suppliers","refs":["id"]},
      {"name":"supplier_product_commerce_fk","columns":["commerce_product_id"],"parent":"commerce_products","refs":["id"]},
    ],
  },
  {
    name: "supplier_price_history",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      supplier_product_id: "BIGINT UNSIGNED NOT NULL",
      actor_id: "BIGINT UNSIGNED NULL",
      kind: "VARCHAR(16) NOT NULL",
      old_public_minor: "INT NULL",
      new_public_minor: "INT NULL",
      old_cost_minor: "INT NULL",
      new_cost_minor: "INT NULL",
      old_selling_minor: "INT NULL",
      new_selling_minor: "INT NULL",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {},
    indexes: {"supplier_price_history_product":["supplier_product_id","id"]},
    foreign: [
      {"name":"supplier_price_history_product_fk","columns":["supplier_product_id"],"parent":"supplier_products","refs":["id"]},
    ],
  },
  {
    name: "supplier_price_tiers",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      supplier_product_id: "BIGINT UNSIGNED NOT NULL",
      min_quantity: "INT NOT NULL",
      unit_cost_minor: "INT NOT NULL",
      active: "TINYINT NOT NULL DEFAULT 0",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {"supplier_tier_quantity":["supplier_product_id","min_quantity"]},
    indexes: {"supplier_tier_active":["supplier_product_id","active","min_quantity"]},
    foreign: [
      {"name":"supplier_tier_product_fk","columns":["supplier_product_id"],"parent":"supplier_products","refs":["id"]},
    ],
  },
  {
    name: "supplier_stock_reservations",
    columns: {
      submission_key: "CHAR(36) NOT NULL",
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      supplier_product_id: "BIGINT UNSIGNED NOT NULL",
      kind: "VARCHAR(16) NOT NULL",
      quantity: "INT NOT NULL",
      remaining_quantity: "INT NOT NULL",
      held_quantity: "INT NOT NULL DEFAULT 0",
      unit_cost_minor: "INT NOT NULL",
      active: "TINYINT NOT NULL DEFAULT 0",
      priority: "INT NOT NULL DEFAULT 0",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {"supplier_reservation_submission":["submission_key"]},
    indexes: {"supplier_reservation_available":["supplier_product_id","active","priority","id"]},
    foreign: [
      {"name":"supplier_reservation_product_fk","columns":["supplier_product_id"],"parent":"supplier_products","refs":["id"]},
    ],
  },
  {
    name: "supplier_reservation_allocations",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      reservation_id: "BIGINT UNSIGNED NOT NULL",
      order_id: "BIGINT UNSIGNED NOT NULL",
      commerce_product_id: "BIGINT UNSIGNED NOT NULL",
      quantity: "INT NOT NULL",
      status: "VARCHAR(16) NOT NULL DEFAULT 'held'",
    },
    primary: ["id"],
    unique: {"supplier_allocation_once":["reservation_id","order_id","commerce_product_id"]},
    indexes: {"supplier_allocation_order":["order_id","status","id"]},
    foreign: [
      {"name":"supplier_allocation_reservation_fk","columns":["reservation_id"],"parent":"supplier_stock_reservations","refs":["id"]},
      {"name":"supplier_allocation_order_fk","columns":["order_id"],"parent":"commerce_orders","refs":["id"]},
      {"name":"supplier_allocation_product_fk","columns":["commerce_product_id"],"parent":"commerce_products","refs":["id"]},
    ],
  },
  {
    name: "supplier_orders",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      order_id: "BIGINT UNSIGNED NOT NULL",
      connection_id: "BIGINT UNSIGNED NOT NULL",
      supplier_id: "BIGINT UNSIGNED NOT NULL",
      external_order_id: "VARCHAR(191) NULL",
      idempotency_key: "VARCHAR(191) NOT NULL",
      status: "VARCHAR(24) NOT NULL DEFAULT 'pending'",
      selling_minor: "INT NOT NULL",
      payable_minor: "INT NOT NULL",
      profit_minor: "INT NOT NULL",
      shipping_minor: "INT NOT NULL DEFAULT 0",
      currency: "VARCHAR(3) NOT NULL DEFAULT 'SAR'",
      payment_status: "VARCHAR(32) NOT NULL DEFAULT 'unknown'",
      request_snapshot: "JSON NOT NULL",
      claim_token: "CHAR(36) NULL",
      attempts: "INT NOT NULL DEFAULT 0",
      last_error: "VARCHAR(80) NOT NULL DEFAULT ''",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      updated_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {"supplier_order_idempotency":["idempotency_key"],"supplier_order_connection":["order_id","connection_id"],"supplier_order_external":["connection_id","external_order_id"]},
    indexes: {"supplier_order_jobs":["status","updated_at","id"],"supplier_order_supplier":["supplier_id","id"]},
    foreign: [
      {"name":"supplier_order_order_fk","columns":["order_id"],"parent":"commerce_orders","refs":["id"]},
      {"name":"supplier_order_connection_fk","columns":["connection_id"],"parent":"supplier_connections","refs":["id"]},
      {"name":"supplier_order_supplier_fk","columns":["supplier_id"],"parent":"commerce_suppliers","refs":["id"]},
    ],
  },
  {
    name: "supplier_shipments",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      supplier_order_id: "BIGINT UNSIGNED NOT NULL",
      external_id: "VARCHAR(191) NOT NULL",
      carrier: "VARCHAR(120) NOT NULL DEFAULT ''",
      tracking_number: "VARCHAR(191) NOT NULL DEFAULT ''",
      status: "VARCHAR(40) NOT NULL DEFAULT ''",
      fulfillment_status: "VARCHAR(40) NOT NULL DEFAULT ''",
      source_updated_at: "DATETIME(3) NULL",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      updated_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
    },
    primary: ["id"],
    unique: {"supplier_shipment_external":["supplier_order_id","external_id"]},
    indexes: {},
    foreign: [
      {"name":"supplier_shipment_order_fk","columns":["supplier_order_id"],"parent":"supplier_orders","refs":["id"]},
    ],
  },
  {
    name: "supplier_webhook_events",
    columns: {
      id: "BIGINT UNSIGNED NOT NULL AUTO_INCREMENT",
      connection_id: "BIGINT UNSIGNED NOT NULL",
      event_key: "VARCHAR(191) NOT NULL",
      event_type: "VARCHAR(80) NOT NULL",
      resource_id: "VARCHAR(191) NOT NULL DEFAULT ''",
      payload: "JSON NOT NULL",
      status: "VARCHAR(16) NOT NULL DEFAULT 'pending'",
      attempts: "INT NOT NULL DEFAULT 0",
      next_attempt_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      claim_token: "CHAR(36) NULL",
      claimed_at: "DATETIME(3) NULL",
      last_error: "VARCHAR(80) NOT NULL DEFAULT ''",
      created_at: "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)",
      processed_at: "DATETIME(3) NULL",
    },
    primary: ["id"],
    unique: {"supplier_webhook_event":["event_key"]},
    indexes: {"supplier_webhook_jobs":["status","next_attempt_at","id"],"supplier_webhook_claim":["status","claimed_at","id"],"supplier_webhook_connection":["connection_id","id"]},
    foreign: [
      {"name":"supplier_webhook_connection_fk","columns":["connection_id"],"parent":"supplier_connections","refs":["id"]},
    ],
  },
];
const quoted=(cols:readonly string[])=>cols.map(c=>'\`'+c+'\`').join(',');
/** Additive only; importing never runs DDL. Incompatible existing schemas fail
 * readiness and require a reviewed upgrade, not silent destructive repair. */
export const SUPPLIER_DDL:readonly string[]=TABLES.map(t=>{
  const parts=Object.entries(t.columns).map(([n,s])=>'\`'+n+'\` '+s);
  parts.push('PRIMARY KEY ('+quoted(t.primary)+')');
  for(const [n,c] of Object.entries(t.unique))parts.push('UNIQUE KEY '+n+' ('+quoted(c)+')');
  for(const [n,c] of Object.entries(t.indexes))parts.push('KEY '+n+' ('+quoted(c)+')');
  for(const f of t.foreign)parts.push('CONSTRAINT '+f.name+' FOREIGN KEY ('+quoted(f.columns)+') REFERENCES '+f.parent+' ('+quoted(f.refs)+') ON DELETE RESTRICT ON UPDATE RESTRICT');
  return 'CREATE TABLE IF NOT EXISTS '+t.name+' (\n  '+parts.join(',\n  ')+'\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
});
type ColumnRow={t:string;c:string;data_type:string;column_type:string;nullable:string;def:string|null;length:bigint|number|null;collation:string|null;extra:string};
type IndexRow={t:string;n:string;c:string;seq:number;non_unique:number;prefix:number|null};
type ForeignRow={t:string;n:string;c:string;parent:string;ref:string;seq:number;local_parent:number;delete_rule:string;update_rule:string};
export async function assertSupplierSchemaReady(db:Pick<PrismaClient,'$queryRaw'>):Promise<void>{
  try{
    const tables=await db.$queryRaw<{t:string;engine:string}[]>`SELECT TABLE_NAME AS t,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'supplier_%'`;
    const columns=await db.$queryRaw<ColumnRow[]>`SELECT TABLE_NAME AS t,COLUMN_NAME AS c,DATA_TYPE AS data_type,COLUMN_TYPE AS column_type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def,CHARACTER_MAXIMUM_LENGTH AS length,COLLATION_NAME AS collation,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'supplier_%'`;
    const indexes=await db.$queryRaw<IndexRow[]>`SELECT TABLE_NAME AS t,INDEX_NAME AS n,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,NON_UNIQUE AS non_unique,SUB_PART AS prefix FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'supplier_%'`;
    const foreign=await db.$queryRaw<ForeignRow[]>`SELECT k.TABLE_NAME AS t,k.CONSTRAINT_NAME AS n,k.COLUMN_NAME AS c,k.REFERENCED_TABLE_NAME AS parent,k.REFERENCED_COLUMN_NAME AS ref,k.ORDINAL_POSITION AS seq,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) AS local_parent,r.DELETE_RULE AS delete_rule,r.UPDATE_RULE AS update_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME LIKE 'supplier_%' AND k.REFERENCED_TABLE_NAME IS NOT NULL`;
    for(const t of TABLES){
      if(!tables.some(row=>row.t===t.name && row.engine==='InnoDB'))throw new Error();
      for(const [n,sql] of Object.entries(t.columns)){
        const c=columns.find(row=>row.t===t.name && row.c===n),type=sql.match(/^[A-Z]+/)![0].toLowerCase();
        const len=sql.match(/^(?:VAR)?CHAR\((\d+)\)/)?.[1],def=sql.match(/ DEFAULT (.+)$/)?.[1]?.replace(/^'|'$/g,'')??null;
        if(!c || c.data_type!==type || sql.includes('UNSIGNED')!==c.column_type.toLowerCase().includes('unsigned')
          || c.nullable!==(sql.includes('NOT NULL')?'NO':'YES')
          || (def===null?c.def!==null:def.startsWith('CURRENT_TIMESTAMP')?String(c.def).toUpperCase()!==def:String(c.def)!==def)
          || (len!==undefined && Number(c.length)!==Number(len))
          || (['char','varchar','text'].includes(type) && c.collation!=='utf8mb4_bin')
          || (sql.includes('AUTO_INCREMENT') && !c.extra.includes('auto_increment')))throw new Error();
      }
      const required=[{cols:t.primary,unique:true,primary:true},...Object.values(t.unique).map(cols=>({cols,unique:true,primary:false})),...Object.values(t.indexes).map(cols=>({cols,unique:false,primary:false}))];
      for(const wanted of required){
        const names=new Set(indexes.filter(row=>row.t===t.name).map(row=>row.n));
        if(![...names].some(name=>{
          if(wanted.primary && name!=='PRIMARY')return false;
          const rows=indexes.filter(row=>row.t===t.name && row.n===name).sort((a,b)=>Number(a.seq)-Number(b.seq));
          return rows.length===wanted.cols.length && rows.every((row,i)=>row.c===wanted.cols[i] && row.prefix===null && (!wanted.unique || Number(row.non_unique)===0));
        }))throw new Error();
      }
      for(const wanted of t.foreign){
        const names=new Set(foreign.filter(row=>row.t===t.name).map(row=>row.n));
        if(![...names].some(name=>{
          const rows=foreign.filter(row=>row.t===t.name && row.n===name).sort((a,b)=>Number(a.seq)-Number(b.seq));
          return rows.length===wanted.columns.length && rows.every((row,i)=>row.c===wanted.columns[i] && row.parent===wanted.parent && row.ref===wanted.refs[i] && Number(row.local_parent)===1 && ['RESTRICT','NO ACTION'].includes(row.delete_rule) && ['RESTRICT','NO ACTION'].includes(row.update_rule));
        }))throw new Error();
      }
    }
  }catch{throw new Error('supplier_schema_not_ready');}
}
