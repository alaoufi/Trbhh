import 'server-only';
import type {CommerceDb} from './types';

/** Additive DDL only. Exported for schema-sync; importing this file never runs DDL. */
export const COMMERCE_DDL = [
  `CREATE TABLE IF NOT EXISTS commerce_products (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    ad_id BIGINT UNSIGNED NULL,
    title VARCHAR(200) NOT NULL,
    price_minor INT NOT NULL,
    currency VARCHAR(3) COLLATE utf8mb4_bin NOT NULL DEFAULT 'SAR',
    stock_available INT NOT NULL DEFAULT 0,
    stock_reserved INT NOT NULL DEFAULT 0,
    approved TINYINT NOT NULL DEFAULT 0,
    visible TINYINT NOT NULL DEFAULT 0,
    enabled TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY commerce_products_ad (ad_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_customer_addresses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    label VARCHAR(40) NOT NULL DEFAULT 'عنواني',
    snapshot JSON NOT NULL,
    is_default TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY commerce_customer_addresses_member (member_id,id),
    KEY commerce_customer_addresses_default (member_id,is_default,id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_customer_carts (
    member_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    items JSON NOT NULL,
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id BIGINT UNSIGNED NOT NULL,
    request_key VARCHAR(80) COLLATE utf8mb4_bin NOT NULL,
    request_fingerprint CHAR(64) COLLATE utf8mb4_bin NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'building',
    currency VARCHAR(3) COLLATE utf8mb4_bin NOT NULL DEFAULT 'SAR',
    subtotal_minor INT NOT NULL DEFAULT 0,
    shipping_fee_minor INT NOT NULL DEFAULT 0,
    total_minor INT NOT NULL DEFAULT 0,
    shipping JSON NOT NULL,
    fulfillment_status VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    paid_at DATETIME(3) NULL,
    UNIQUE KEY commerce_orders_request (member_id,request_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_order_items (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    title VARCHAR(200) NOT NULL,
    quantity INT NOT NULL,
    unit_price_minor INT NOT NULL,
    list_unit_price_minor INT NULL,
    discount_minor INT NOT NULL DEFAULT 0,
    total_minor INT NOT NULL,
    variant_key VARCHAR(191) COLLATE utf8mb4_bin NOT NULL DEFAULT '',
    variant_snapshot JSON NULL,
    UNIQUE KEY commerce_items_product (order_id,product_id),
    CONSTRAINT commerce_items_order_fk FOREIGN KEY (order_id) REFERENCES commerce_orders(id),
    CONSTRAINT commerce_items_product_fk FOREIGN KEY (product_id) REFERENCES commerce_products(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_payment_attempts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
    provider_ref VARCHAR(160) COLLATE utf8mb4_bin NULL,
    redirect_url TEXT NULL,
    merchant_order_id VARCHAR(100) COLLATE utf8mb4_bin NOT NULL,
    claim_token CHAR(36) COLLATE utf8mb4_bin NOT NULL,
    amount_minor INT NOT NULL,
    currency VARCHAR(3) COLLATE utf8mb4_bin NOT NULL DEFAULT 'SAR',
    status VARCHAR(24) NOT NULL DEFAULT 'creating',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    paid_at DATETIME(3) NULL,
    UNIQUE KEY commerce_attempt_order (order_id),
    UNIQUE KEY commerce_attempt_reference (provider,provider_ref),
    UNIQUE KEY commerce_attempt_merchant (merchant_order_id),
    CONSTRAINT commerce_attempt_order_fk FOREIGN KEY (order_id) REFERENCES commerce_orders(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    event VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
    channel VARCHAR(16) COLLATE utf8mb4_bin NOT NULL,
    recipient VARCHAR(191) COLLATE utf8mb4_bin NOT NULL,
    payload JSON NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    claim_token VARCHAR(36) COLLATE utf8mb4_bin NULL,
    last_error VARCHAR(300) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    claimed_at DATETIME(3) NULL,
    sent_at DATETIME(3) NULL,
    UNIQUE KEY commerce_notifications_delivery (order_id,event,channel,recipient),
    KEY commerce_notifications_status (status,id),
    CONSTRAINT commerce_notifications_order_fk FOREIGN KEY (order_id) REFERENCES commerce_orders(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
  `CREATE TABLE IF NOT EXISTS commerce_audit_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    event VARCHAR(40) COLLATE utf8mb4_bin NOT NULL,
    payload JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY commerce_audit_event (order_id,event),
    CONSTRAINT commerce_audit_order_fk FOREIGN KEY (order_id) REFERENCES commerce_orders(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS commerce_suppliers (
id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
name VARCHAR(200) NOT NULL,
contact_name VARCHAR(200) NOT NULL DEFAULT '',
phone VARCHAR(40) NOT NULL DEFAULT '',
store_coordinator_phone VARCHAR(20) NOT NULL DEFAULT '',
email VARCHAR(254) NOT NULL DEFAULT '',
address VARCHAR(500) NOT NULL DEFAULT '',
registration_number VARCHAR(100) NOT NULL DEFAULT '',
tax_number VARCHAR(100) NOT NULL DEFAULT '',
settlement_terms VARCHAR(2000) NOT NULL DEFAULT '',
notes VARCHAR(2000) NOT NULL DEFAULT '',
api_base_url VARCHAR(2048) NOT NULL DEFAULT '',
api_credential_ref VARCHAR(128) NOT NULL DEFAULT '',
active TINYINT NOT NULL DEFAULT 0, api_enabled TINYINT NOT NULL DEFAULT 0,
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS commerce_product_suppliers (
product_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, supplier_id BIGINT UNSIGNED NOT NULL,
supplier_sku VARCHAR(200) NOT NULL DEFAULT '', unit_cost_minor INT NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
CONSTRAINT commerce_product_supplier_product_fk FOREIGN KEY (product_id) REFERENCES commerce_products(id),
CONSTRAINT commerce_product_supplier_supplier_fk FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS commerce_order_suppliers (
order_id BIGINT UNSIGNED NOT NULL, product_id BIGINT UNSIGNED NOT NULL, supplier_id BIGINT UNSIGNED NOT NULL,
supplier_name VARCHAR(200) NOT NULL, supplier_sku VARCHAR(200) NOT NULL DEFAULT '',
quantity INT NOT NULL, unit_cost_minor INT NOT NULL, total_cost_minor INT NOT NULL,
PRIMARY KEY (order_id,product_id),
CONSTRAINT commerce_order_supplier_item_fk FOREIGN KEY (order_id,product_id) REFERENCES commerce_order_items(order_id,product_id),
CONSTRAINT commerce_order_supplier_supplier_fk FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS commerce_receipts (
id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
provider VARCHAR(40) NOT NULL, provider_ref VARCHAR(160) NOT NULL, amount_minor INT NOT NULL,
currency VARCHAR(3) NOT NULL DEFAULT 'SAR', recorded_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
UNIQUE KEY commerce_receipt_order (order_id), UNIQUE KEY commerce_receipt_reference (provider,provider_ref),
CONSTRAINT commerce_receipt_order_fk FOREIGN KEY (order_id) REFERENCES commerce_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
`CREATE TABLE IF NOT EXISTS commerce_supplier_accruals (
id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL,
product_id BIGINT UNSIGNED NOT NULL, supplier_id BIGINT UNSIGNED NOT NULL, amount_minor INT NOT NULL,
currency VARCHAR(3) NOT NULL DEFAULT 'SAR', status VARCHAR(32) NOT NULL DEFAULT 'offline_pending',
created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
UNIQUE KEY commerce_accrual_item (order_id,product_id),
CONSTRAINT commerce_accrual_snapshot_fk FOREIGN KEY (order_id,product_id) REFERENCES commerce_order_suppliers(order_id,product_id),
CONSTRAINT commerce_accrual_supplier_fk FOREIGN KEY (supplier_id) REFERENCES commerce_suppliers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
] as const;

const requiredIndexes: Record<string, Record<string, string[]>> = {
  commerce_suppliers:{PRIMARY:['id']},
  commerce_product_suppliers:{PRIMARY:['product_id']},
  commerce_order_suppliers:{PRIMARY:['order_id','product_id']},
  commerce_receipts:{PRIMARY:['id'],commerce_receipt_order:['order_id'],commerce_receipt_reference:['provider','provider_ref']},
  commerce_supplier_accruals:{PRIMARY:['id'],commerce_accrual_item:['order_id','product_id']},
  commerce_products:{PRIMARY:['id']},
  commerce_customer_addresses:{PRIMARY:['id']},
  commerce_orders:{PRIMARY:['id'],commerce_orders_request:['member_id','request_key']},
  commerce_order_items:{PRIMARY:['id'],commerce_items_product:['order_id','product_id']},
  commerce_payment_attempts:{PRIMARY:['id'],commerce_attempt_order:['order_id'],commerce_attempt_reference:['provider','provider_ref'],commerce_attempt_merchant:['merchant_order_id']},
  commerce_notifications:{PRIMARY:['id'],commerce_notifications_delivery:['order_id','event','channel','recipient']},
  commerce_audit_events:{PRIMARY:['id'],commerce_audit_event:['order_id','event']},
};
const requiredColumns: Record<string,string[]> = {
  commerce_suppliers:['id','name','contact_name','phone','store_coordinator_phone','email','address','registration_number','tax_number','settlement_terms','notes','api_base_url','api_credential_ref','active','api_enabled','created_at','updated_at'],
  commerce_product_suppliers:['product_id','supplier_id','supplier_sku','unit_cost_minor','currency'],
  commerce_order_suppliers:['order_id','product_id','supplier_id','supplier_name','supplier_sku','quantity','unit_cost_minor','total_cost_minor'],
  commerce_receipts:['id','order_id','provider','provider_ref','amount_minor','currency','recorded_at'],
  commerce_supplier_accruals:['id','order_id','product_id','supplier_id','amount_minor','currency','status','created_at'],
  commerce_products:['id','ad_id','title','price_minor','currency','stock_available','stock_reserved','approved','visible','enabled','created_at','updated_at'],
  commerce_customer_addresses:['id','member_id','label','snapshot','is_default','created_at','updated_at'],
  commerce_orders:['id','member_id','request_key','request_fingerprint','status','currency','subtotal_minor','shipping_fee_minor','total_minor','shipping','fulfillment_status','created_at','paid_at'],
  commerce_order_items:['id','order_id','product_id','title','quantity','unit_price_minor','list_unit_price_minor','discount_minor','total_minor','variant_key','variant_snapshot'],
  commerce_payment_attempts:['id','order_id','provider','provider_ref','redirect_url','merchant_order_id','claim_token','amount_minor','currency','status','created_at','paid_at'],
  commerce_notifications:['id','order_id','event','channel','recipient','payload','status','claim_token','last_error','created_at','claimed_at','sent_at'],
  commerce_audit_events:['id','order_id','event','payload','created_at'],
};
const requiredSupplierForeignKeys = [
  ['commerce_product_suppliers',['product_id'],'commerce_products',['id']],
  ['commerce_product_suppliers',['supplier_id'],'commerce_suppliers',['id']],
  ['commerce_order_suppliers',['order_id','product_id'],'commerce_order_items',['order_id','product_id']],
  ['commerce_order_suppliers',['supplier_id'],'commerce_suppliers',['id']],
  ['commerce_receipts',['order_id'],'commerce_orders',['id']],
  ['commerce_supplier_accruals',['order_id','product_id'],'commerce_order_suppliers',['order_id','product_id']],
  ['commerce_supplier_accruals',['supplier_id'],'commerce_suppliers',['id']],
] as const;
/** Fail closed on incomplete CREATE/ALTER deployments, not just table existence.
 * Readiness is not cached: removing an idempotency index must disable writes. */
export async function assertCommerceSchemaReady(db: Pick<CommerceDb,'$queryRaw'>): Promise<void> {
  try {
    const foreignKeys=await db.$queryRaw<{t:string;n:string;c:string;parent:string;ref:string;seq:number;local_parent:number;delete_rule:string;update_rule:string}[]>`SELECT k.TABLE_NAME AS t,k.CONSTRAINT_NAME AS n,k.COLUMN_NAME AS c,k.REFERENCED_TABLE_NAME AS parent,k.REFERENCED_COLUMN_NAME AS ref,k.ORDINAL_POSITION AS seq,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) AS local_parent,r.DELETE_RULE AS delete_rule,r.UPDATE_RULE AS update_rule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME LIKE 'commerce_%' AND k.REFERENCED_TABLE_NAME IS NOT NULL`;
    for(const [table,cols,parent,refs] of requiredSupplierForeignKeys) {
      const candidates=new Set(foreignKeys.filter(row=>row.t===table).map(row=>row.n));
      const valid=[...candidates].some(name=>{
        const rows=foreignKeys.filter(row=>row.t===table && row.n===name).sort((a,b)=>Number(a.seq)-Number(b.seq));
        return rows.length===cols.length && rows.every((row,i)=>row.c===cols[i] && row.parent===parent && row.ref===refs[i] && Number(row.local_parent)===1 && ['RESTRICT','NO ACTION'].includes(row.delete_rule) && ['RESTRICT','NO ACTION'].includes(row.update_rule));
      });
      if(!valid) throw new Error('supplier_foreign_key_missing');
    }
    const tables=await db.$queryRaw<{t:string;engine:string}[]>`SELECT TABLE_NAME AS t, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'commerce_%'`;
    const columns=await db.$queryRaw<{t:string;c:string;collation:string|null}[]>`SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLLATION_NAME AS collation FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'commerce_%'`;
    const indexes=await db.$queryRaw<{t:string;i:string;c:string;seq:number;non_unique:number;prefix:number|null}[]>`SELECT TABLE_NAME AS t,INDEX_NAME AS i,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,NON_UNIQUE AS non_unique,SUB_PART AS prefix FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'commerce_%'`;
    for(const [table,names] of Object.entries(requiredColumns)) {
      if(!tables.some(row=>row.t===table && row.engine==='InnoDB') || names.some(name=>!columns.some(row=>row.t===table && row.c===name))) throw new Error();
      for(const [name,expected] of Object.entries(requiredIndexes[table])) {
        const rows=indexes.filter(row=>row.t===table && row.i===name).sort((a,b)=>Number(a.seq)-Number(b.seq));
        if(rows.length!==expected.length || rows.some((row,i)=>Number(row.non_unique)!==0 || row.prefix!==null || row.c!==expected[i])) throw new Error();
      }
    }
    for(const [table,names] of Object.entries({commerce_orders:['request_key','request_fingerprint'],commerce_payment_attempts:['provider','provider_ref','merchant_order_id','claim_token'],commerce_receipts:['provider','provider_ref'],commerce_notifications:['event','channel','recipient']})) {
      if(names.some(name=>columns.find(row=>row.t===table && row.c===name)?.collation!=='utf8mb4_bin')) throw new Error();
    }
  } catch {throw new Error('commerce_schema_not_ready');}
}
