import 'server-only';
import type { CommerceDb } from '@/lib/commerce/types';

const engine = ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin';
/** Additive only; importing a reader never performs DDL. */
export const FINANCE_DDL = [
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
] as const;

export const FINANCE_TABLES = FINANCE_DDL.map(sql => sql.match(/^CREATE TABLE IF NOT EXISTS (\w+)/)![1]);
export async function financeSchemaAvailable(db: Pick<CommerceDb, '$queryRaw'>): Promise<boolean> {
  const rows = await db.$queryRaw<{ name: string; engine: string }[]>`SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'finance\\_%'`;
  return FINANCE_TABLES.every(name => rows.some(row => row.name === name && row.engine === 'InnoDB'));
}
export async function assertFinanceSchemaReady(db: Pick<CommerceDb, '$queryRaw'>) {
  if (!(await financeSchemaAvailable(db))) throw new Error('finance_schema_not_ready');
  const keys = await db.$queryRaw<{ name: string; non_unique: bigint | number }[]>`SELECT DISTINCT INDEX_NAME AS name,NON_UNIQUE AS non_unique FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'finance\\_%'`;
  for (const name of ['finance_expense_request','finance_expense_reversal','finance_settlement_request','finance_settlement_reversal','finance_invoice_source','finance_invoice_number','finance_refund_provider_reference']) {
    if (!keys.some(row => row.name === name && Number(row.non_unique) === 0)) throw new Error('finance_schema_not_ready');
  }
}
