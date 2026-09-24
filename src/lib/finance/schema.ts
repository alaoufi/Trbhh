import 'server-only';
import type { CommerceDb } from '@/lib/commerce/types';
import {financeTaxRevisionIndexesReady} from './tax-index-upgrade';

const engine = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
/** Additive only; importing a reader never performs DDL. */
export const FINANCE_DDL = [
  `CREATE TABLE IF NOT EXISTS finance_reconciliations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_key VARCHAR(80) NOT NULL, fingerprint CHAR(64) NOT NULL,
    month CHAR(7) NOT NULL, snapshot JSON NOT NULL, reason VARCHAR(1000) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL,
    UNIQUE KEY finance_reconciliation_request(request_key), KEY finance_reconciliation_month(month)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_periods (
    month CHAR(7) NOT NULL PRIMARY KEY, closed_at DATETIME(3) NULL,
    checks_json JSON NOT NULL, reason VARCHAR(1000) NOT NULL DEFAULT '', version INT NOT NULL DEFAULT 0
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_budgets (
    month CHAR(7) NOT NULL, category VARCHAR(32) NOT NULL, planned_minor BIGINT NOT NULL,
    PRIMARY KEY(month,category), CHECK(planned_minor>=0)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_expenses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_key VARCHAR(80) NOT NULL, fingerprint CHAR(64) NOT NULL,
    category VARCHAR(32) NOT NULL, description VARCHAR(500) NOT NULL,
    net_minor BIGINT NOT NULL, vat_minor BIGINT NOT NULL, total_minor BIGINT NOT NULL, paid_minor BIGINT NOT NULL,
    occurred_at DATETIME(3) NOT NULL, due_at DATETIME(3) NOT NULL,
    reference VARCHAR(160) NOT NULL, reversal_of BIGINT UNSIGNED NULL, actor_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY finance_expense_request(request_key), UNIQUE KEY finance_expense_reversal(reversal_of),
    CONSTRAINT finance_expense_reversal_fk FOREIGN KEY(reversal_of) REFERENCES finance_expenses(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(net_minor>=0 AND vat_minor>=0 AND total_minor=net_minor+vat_minor AND paid_minor>=0 AND paid_minor<=total_minor)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_accrual_reviews (
    accrual_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, eligible_at DATETIME(3) NULL, due_at DATETIME(3) NULL,
    hold_reason VARCHAR(1000) NOT NULL DEFAULT '', actor_id BIGINT UNSIGNED NOT NULL,
    CONSTRAINT finance_review_accrual_fk FOREIGN KEY(accrual_id) REFERENCES commerce_supplier_accruals(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_settlements (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    request_key VARCHAR(80) NOT NULL, fingerprint CHAR(64) NOT NULL, supplier_id BIGINT UNSIGNED NOT NULL,
    amount_minor BIGINT NOT NULL, created_at DATETIME(3) NOT NULL, approved_at DATETIME(3) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft', reference VARCHAR(160) NOT NULL DEFAULT '',
    reason VARCHAR(1000) NOT NULL, reversal_of BIGINT UNSIGNED NULL, actor_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY finance_settlement_request(request_key), UNIQUE KEY finance_settlement_reversal(reversal_of),
    CONSTRAINT finance_settlement_supplier_fk FOREIGN KEY(supplier_id) REFERENCES commerce_suppliers(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_settlement_reversal_fk FOREIGN KEY(reversal_of) REFERENCES finance_settlements(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(amount_minor>0)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_settlement_lines (
    settlement_id BIGINT UNSIGNED NOT NULL, accrual_id BIGINT UNSIGNED NOT NULL, amount_minor BIGINT NOT NULL,
    PRIMARY KEY(settlement_id,accrual_id),
    CONSTRAINT finance_line_settlement_fk FOREIGN KEY(settlement_id) REFERENCES finance_settlements(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_line_accrual_fk FOREIGN KEY(accrual_id) REFERENCES commerce_supplier_accruals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(amount_minor>0)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_invoices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, receipt_id BIGINT UNSIGNED NOT NULL,
    kind VARCHAR(16) NOT NULL DEFAULT 'invoice', source_key VARCHAR(191) NOT NULL, number VARCHAR(60) NULL,
    parent_id BIGINT UNSIGNED NULL, status VARCHAR(24) NOT NULL DEFAULT 'pending_policy',
    created_at DATETIME(3) NOT NULL, issued_at DATETIME(3) NULL,
    net_minor BIGINT NULL, vat_minor BIGINT NULL, total_minor BIGINT NOT NULL,
    snapshot JSON NULL, source_snapshot JSON NOT NULL, reason VARCHAR(1000) NOT NULL DEFAULT '',
    UNIQUE KEY finance_invoice_source (source_key), UNIQUE KEY finance_invoice_number (number),
    CONSTRAINT finance_invoice_order_fk FOREIGN KEY(order_id) REFERENCES commerce_orders(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_invoice_receipt_fk FOREIGN KEY(receipt_id) REFERENCES commerce_receipts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_invoice_parent_fk FOREIGN KEY(parent_id) REFERENCES finance_invoices(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(total_minor>=0), CHECK(net_minor IS NULL OR (net_minor>=0 AND vat_minor>=0 AND total_minor=net_minor+vat_minor))
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_sequences (
    name VARCHAR(40) NOT NULL PRIMARY KEY, next_value BIGINT NOT NULL, CHECK(next_value>0)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_refunds (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL, receipt_id BIGINT UNSIGNED NOT NULL,
    provider VARCHAR(40) NOT NULL, external_id VARCHAR(160) NOT NULL,
    amount_minor BIGINT NOT NULL, currency VARCHAR(3) NOT NULL DEFAULT 'SAR',
    refunded_at DATETIME(3) NOT NULL, evidence_ref VARCHAR(500) NOT NULL, actor_id BIGINT UNSIGNED NOT NULL,
    UNIQUE KEY finance_refund_provider_reference(provider,external_id),
    CONSTRAINT finance_refund_order_fk FOREIGN KEY(order_id) REFERENCES commerce_orders(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_refund_receipt_fk FOREIGN KEY(receipt_id) REFERENCES commerce_receipts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(amount_minor>0), CHECK(currency='SAR')
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_audit (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, created_at DATETIME(3) NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL, action VARCHAR(60) NOT NULL, entity VARCHAR(40) NOT NULL,
    entity_id VARCHAR(80) NOT NULL, reason VARCHAR(1000) NOT NULL, payload JSON NOT NULL,
    KEY finance_audit_entity(entity,entity_id)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_change_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, request_key VARCHAR(80) NOT NULL, fingerprint CHAR(64) NOT NULL,
    kind VARCHAR(24) NOT NULL, target_id VARCHAR(80) NOT NULL, payload JSON NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
    maker_id BIGINT UNSIGNED NOT NULL, checker_id BIGINT UNSIGNED NULL, reason VARCHAR(1000) NOT NULL, approval_reason VARCHAR(1000) NOT NULL DEFAULT '',
    result JSON NULL, created_at DATETIME(3) NOT NULL, decided_at DATETIME(3) NULL,
    UNIQUE KEY finance_change_request(request_key), KEY finance_change_target(kind,target_id),
    CHECK(kind IN ('return','tax_settings','reopen_period')), CHECK(status IN ('pending','approved','cancelled'))
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_tax_policies (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, request_id BIGINT UNSIGNED NOT NULL,
    effective_from DATE NOT NULL, issuer JSON NOT NULL, vat_bps INT NOT NULL, policy_reference VARCHAR(160) NOT NULL, created_at DATETIME(3) NOT NULL,
    calculation_policy JSON NULL,
    UNIQUE KEY finance_tax_request(request_id), KEY finance_tax_effective_lookup(effective_from), KEY finance_tax_reference_lookup(policy_reference),
    CONSTRAINT finance_tax_request_fk FOREIGN KEY(request_id) REFERENCES finance_change_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CHECK(vat_bps>=0 AND vat_bps<=10000)
  )${engine}`,
  `CREATE TABLE IF NOT EXISTS finance_order_fiscal_snapshots (
    order_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, policy_id BIGINT UNSIGNED NOT NULL, request_id BIGINT UNSIGNED NOT NULL,
    captured_at DATETIME(3) NOT NULL, fingerprint CHAR(64) NOT NULL, snapshot JSON NOT NULL,
    CONSTRAINT finance_order_fiscal_order_fk FOREIGN KEY(order_id) REFERENCES commerce_orders(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_order_fiscal_policy_fk FOREIGN KEY(policy_id) REFERENCES finance_tax_policies(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
    CONSTRAINT finance_order_fiscal_request_fk FOREIGN KEY(request_id) REFERENCES finance_change_requests(id) ON DELETE RESTRICT ON UPDATE RESTRICT
  )${engine}`,
] as const;

export const FINANCE_UPGRADE_DDL = ['ALTER TABLE finance_tax_policies ADD COLUMN calculation_policy JSON NULL'] as const;

export const FINANCE_TABLES = FINANCE_DDL.map(sql => sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]);
const fiscalSnapshotColumns:Record<string,string>={order_id:'bigint unsigned',policy_id:'bigint unsigned',request_id:'bigint unsigned',captured_at:'datetime(3)',fingerprint:'char(64)',snapshot:'json'};
export async function financeSchemaAvailable(db: Pick<CommerceDb, '$queryRaw'>): Promise<boolean> {
 try {
  const rows = await db.$queryRaw<{ name: string; engine: string }[]>`SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'finance\\_%'`;
  if(!FINANCE_TABLES.every(name => rows.some(row => row.name === name && row.engine === 'InnoDB')))return false;
  // An existing table does not prove its additive upgrade completed. Read views
  // also use this gate before selecting the new policy column.
  const columns=await db.$queryRaw<{t:string;c:string;type:string;nullable:string;def:string|null;extra:string}[]>`SELECT TABLE_NAME AS t,COLUMN_NAME AS c,COLUMN_TYPE AS type,IS_NULLABLE AS nullable,COLUMN_DEFAULT AS def,EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('finance_tax_policies','finance_order_fiscal_snapshots')`;
  if(!columns.some(row=>row.t==='finance_tax_policies'&&row.c==='calculation_policy'&&row.type==='json'&&row.nullable==='YES'&&row.def===null&&row.extra===''))return false;
  return Object.entries(fiscalSnapshotColumns).every(([name,type])=>columns.some(row=>row.t==='finance_order_fiscal_snapshots'&&row.c===name&&row.type===type&&row.nullable==='NO'&&row.def===null&&row.extra===''));
 }catch{return false;}
}
export async function assertFinanceSchemaReady(db: Pick<CommerceDb, '$queryRaw'>) {
 try {
  if (!(await financeSchemaAvailable(db))) throw new Error('finance_schema_not_ready');
  const keys = await db.$queryRaw<{ t:string;name: string;c:string;seq:number;non_unique: bigint | number;prefix:number|null }[]>`SELECT TABLE_NAME AS t,INDEX_NAME AS name,COLUMN_NAME AS c,SEQ_IN_INDEX AS seq,NON_UNIQUE AS non_unique,SUB_PART AS prefix FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'finance\\_%'`;
  for (const name of ['finance_expense_request','finance_expense_reversal','finance_settlement_request','finance_settlement_reversal','finance_invoice_source','finance_invoice_number','finance_refund_provider_reference','finance_reconciliation_request','finance_change_request','finance_tax_request']) {
    if (!keys.some(row => row.name === name && Number(row.non_unique) === 0)) throw new Error('finance_schema_not_ready');
  }
  if(!financeTaxRevisionIndexesReady(keys.filter(row=>row.t==='finance_tax_policies')))throw new Error('finance_schema_not_ready');
  const primary=keys.filter(row=>row.t==='finance_order_fiscal_snapshots'&&row.name==='PRIMARY');
  if(primary.length!==1||primary[0].c!=='order_id'||Number(primary[0].seq)!==1||Number(primary[0].non_unique)!==0||primary[0].prefix!==null)throw new Error('finance_schema_not_ready');
  const relations=await db.$queryRaw<{c:string;p:string;r:string;local_parent:number;deletion:string;updates:string}[]>`SELECT k.COLUMN_NAME AS c,k.REFERENCED_TABLE_NAME AS p,k.REFERENCED_COLUMN_NAME AS r,(k.REFERENCED_TABLE_SCHEMA=DATABASE()) AS local_parent,f.DELETE_RULE AS deletion,f.UPDATE_RULE AS updates FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS f ON f.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND f.TABLE_NAME=k.TABLE_NAME AND f.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.TABLE_NAME='finance_order_fiscal_snapshots'`;
  for(const [column,parent] of [['order_id','commerce_orders'],['policy_id','finance_tax_policies'],['request_id','finance_change_requests']])if(!relations.some(row=>row.c===column&&row.p===parent&&row.r==='id'&&Number(row.local_parent)===1&&['RESTRICT','NO ACTION'].includes(row.deletion)&&['RESTRICT','NO ACTION'].includes(row.updates)))throw new Error('finance_schema_not_ready');
 }catch{throw new Error('finance_schema_not_ready');}
}
