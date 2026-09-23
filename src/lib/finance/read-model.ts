import 'server-only';
import type { CommerceDb } from '@/lib/commerce/types';
import type { BudgetCategory, FinanceData, FinanceInvoice, FinanceOrder, ArchivedFiscalSnapshot as FiscalSnapshot,FinanceChangeRequest,FinanceTaxPolicy,FinanceSettlement } from './types';
import { financeSchemaAvailable } from './schema';

type Row = Record<string, unknown>;
export function financeNumber(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'bigint' && typeof value !== 'string') throw new Error('finance_amount_invalid');
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) throw new Error('finance_amount_invalid');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('finance_amount_invalid');
  return number;
}
const id = (value: unknown) => String(value);
const str = (value: unknown) => value == null ? '' : String(value);
function at(value: unknown): string { const d = value instanceof Date ? value : new Date(String(value)); if (!Number.isFinite(d.getTime())) throw new Error('finance_date_invalid'); return d.toISOString(); }
const optionalDate = (value: unknown) => value == null ? null : at(value);
export function financeJson<T>(value: unknown): T { return (typeof value === 'string' ? JSON.parse(value) : value) as T; }

/** A standalone client gets one coherent snapshot; callers already in a transaction keep theirs. */
export async function readFinanceData(db: Pick<CommerceDb, '$queryRaw'> & Partial<Pick<CommerceDb, '$transaction'>>): Promise<FinanceData> {
  if (typeof db.$transaction === 'function') {
    return db.$transaction(tx => readFinanceSnapshot(tx), {isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000});
  }
  return readFinanceSnapshot(db);
}

/** Complete source arrays, without LIMIT on monetary records. Never performs a migration or a write. */
async function readFinanceSnapshot(db: Pick<CommerceDb, '$queryRaw'>): Promise<FinanceData> {
  const [orderRows, items, costs, receipts, suppliers, accruals, ready] = await Promise.all([
    db.$queryRaw<Row[]>`SELECT id,member_id,status,created_at,paid_at,subtotal_minor,shipping_fee_minor,total_minor,currency,shipping FROM commerce_orders ORDER BY id`,
    db.$queryRaw<Row[]>`SELECT order_id,product_id,title,quantity,unit_price_minor,total_minor FROM commerce_order_items ORDER BY order_id,product_id`,
    db.$queryRaw<Row[]>`SELECT order_id,product_id,supplier_id,supplier_name,total_cost_minor FROM commerce_order_suppliers ORDER BY order_id,product_id`,
    db.$queryRaw<Row[]>`SELECT id,order_id,provider,amount_minor,currency,provider_ref,recorded_at FROM commerce_receipts ORDER BY id`,
    db.$queryRaw<Row[]>`SELECT id,name FROM commerce_suppliers ORDER BY name,id`,
    db.$queryRaw<Row[]>`SELECT id,order_id,product_id,supplier_id,amount_minor,created_at FROM commerce_supplier_accruals ORDER BY id`,
    financeSchemaAvailable(db),
  ]);
  const orderItems = new Map<string, FinanceOrder['items']>();
  for (const row of items) {
    const list = orderItems.get(id(row.order_id)) || [];
    list.push({productId:id(row.product_id),title:str(row.title),quantity:financeNumber(row.quantity),unitMinor:financeNumber(row.unit_price_minor),totalMinor:financeNumber(row.total_minor)});
    orderItems.set(id(row.order_id),list);
  }
  const orderSuppliers = new Map<string, FinanceOrder['suppliers']>();
  for (const row of costs) {
    const list = orderSuppliers.get(id(row.order_id)) || [];
    list.push({supplierId:id(row.supplier_id),supplierName:str(row.supplier_name),productId:id(row.product_id),amountMinor:financeNumber(row.total_cost_minor)});
    orderSuppliers.set(id(row.order_id),list);
  }
  const data: FinanceData = {
    ready,
    orders:orderRows.map(row => ({id:id(row.id),memberId:id(row.member_id),customerName:str(financeJson<{name?:string}>(row.shipping)?.name),status:str(row.status),createdAt:at(row.created_at),paidAt:optionalDate(row.paid_at),subtotalMinor:financeNumber(row.subtotal_minor),shippingMinor:financeNumber(row.shipping_fee_minor),totalMinor:financeNumber(row.total_minor),currency:str(row.currency),items:orderItems.get(id(row.id)) || [],suppliers:orderSuppliers.get(id(row.id)) || []})),
    receipts:receipts.map(row => ({id:id(row.id),orderId:id(row.order_id),provider:str(row.provider),amountMinor:financeNumber(row.amount_minor),currency:str(row.currency),reference:str(row.provider_ref),at:at(row.recorded_at)})),
    suppliers:suppliers.map(row => ({id:id(row.id),name:str(row.name)})),
    accruals:accruals.map(row => ({id:id(row.id),orderId:id(row.order_id),productId:id(row.product_id),supplierId:id(row.supplier_id),amountMinor:financeNumber(row.amount_minor),at:at(row.created_at),eligibleAt:null,dueAt:null,holdReason:'لم تعتمد شروط الاستحقاق بعد'})),
    refunds:[],expenses:[],settlements:[],invoices:[],budgets:[],periods:[],audit:[],requests:[],taxPolicies:[],reconciliations:[],
  };
  if (!ready) return data;
  const [reviews, expenses, settlements, lines, invoices, budgets, periods, audit, refunds,requests,taxPolicies,reconciliations,checkers,fiscalOrders] = await Promise.all([
    db.$queryRaw<Row[]>`SELECT * FROM finance_accrual_reviews`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_expenses ORDER BY occurred_at,id`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_settlements ORDER BY created_at,id`,
    db.$queryRaw<Row[]>`SELECT settlement_id,accrual_id,amount_minor FROM finance_settlement_lines ORDER BY settlement_id,accrual_id`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_invoices ORDER BY id`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_budgets`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_periods`,
    db.$queryRaw<Row[]>`SELECT id,created_at,actor_id,action,entity,entity_id,reason,payload FROM finance_audit ORDER BY id DESC LIMIT 500`,
    db.$queryRaw<Row[]>`SELECT id,order_id,receipt_id,provider,external_id,amount_minor,currency,refunded_at,evidence_ref,actor_id FROM finance_refunds ORDER BY refunded_at,id`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_change_requests ORDER BY id DESC`,
    db.$queryRaw<Row[]>`SELECT * FROM finance_tax_policies ORDER BY effective_from,id`,
    db.$queryRaw<Row[]>`SELECT id,month,fingerprint,reason,actor_id,created_at FROM finance_reconciliations ORDER BY id DESC`,
    db.$queryRaw<Row[]>`SELECT entity_id,actor_id FROM finance_audit WHERE action='settlement_approved' AND entity='settlement' ORDER BY id`,
    db.$queryRaw<Row[]>`SELECT snapshot FROM finance_order_fiscal_snapshots ORDER BY order_id`,
  ]);
  const reviewById = new Map(reviews.map(row => [id(row.accrual_id),row]));
  data.accruals = data.accruals.map(accrual => { const review = reviewById.get(accrual.id); return review ? {...accrual,eligibleAt:optionalDate(review.eligible_at),dueAt:optionalDate(review.due_at),holdReason:str(review.hold_reason)} : accrual; });
  data.expenses = expenses.map(row => ({id:id(row.id),category:str(row.category) as BudgetCategory,description:str(row.description),netMinor:financeNumber(row.net_minor),vatMinor:financeNumber(row.vat_minor),totalMinor:financeNumber(row.total_minor),paidMinor:financeNumber(row.paid_minor),at:at(row.occurred_at),dueAt:at(row.due_at),reference:str(row.reference),reversalOf:row.reversal_of == null ? null : id(row.reversal_of)}));
  const checkerById=new Map(checkers.map(row=>[id(row.entity_id),id(row.actor_id)]));
  data.settlements = settlements.map(row => ({id:id(row.id),supplierId:id(row.supplier_id),amountMinor:financeNumber(row.amount_minor),at:at(row.approved_at || row.created_at),status:str(row.status) as FinanceSettlement['status'],reference:str(row.reference),reason:str(row.reason),makerId:id(row.actor_id),checkerId:checkerById.get(id(row.id))??null,reversalOf:row.reversal_of == null ? null : id(row.reversal_of),lines:lines.filter(line=>id(line.settlement_id)===id(row.id)).map(line=>({accrualId:id(line.accrual_id),amountMinor:financeNumber(line.amount_minor)}))}));
  data.invoices = invoices.map(row => ({id:id(row.id),orderId:id(row.order_id),receiptId:id(row.receipt_id),number:row.number == null ? null : str(row.number),kind:str(row.kind) as FinanceInvoice['kind'],parentId:row.parent_id == null ? null : id(row.parent_id),status:str(row.status) as FinanceInvoice['status'],at:at(row.created_at),issuedAt:optionalDate(row.issued_at),totalMinor:financeNumber(row.total_minor),netMinor:row.net_minor == null ? null : financeNumber(row.net_minor),vatMinor:row.vat_minor == null ? null : financeNumber(row.vat_minor),snapshot:row.snapshot == null ? null : financeJson<FiscalSnapshot>(row.snapshot),source:financeJson<FinanceOrder>(row.source_snapshot),reason:str(row.reason)}));
  data.budgets = budgets.map(row => ({month:str(row.month),category:str(row.category) as BudgetCategory,plannedMinor:financeNumber(row.planned_minor)}));
  data.periods = periods.map(row => ({month:str(row.month),closedAt:optionalDate(row.closed_at),checks:financeJson<string[]>(row.checks_json),reason:str(row.reason),version:financeNumber(row.version??0)}));
  data.audit = audit.map(row => {const payload=financeJson<Record<string,unknown>>(row.payload)??{};return {id:id(row.id),at:at(row.created_at),actorId:id(row.actor_id),action:str(row.action),entity:str(row.entity),entityId:str(row.entity_id),reason:str(row.reason),before:payload.before??null,after:payload.after??null,ip:payload.ip==null?null:str(payload.ip),sessionFingerprint:payload.sessionFingerprint==null?null:str(payload.sessionFingerprint),payload};});
  data.requests=requests.map(row=>({id:id(row.id),kind:str(row.kind) as FinanceChangeRequest['kind'],targetId:str(row.target_id),payload:financeJson<FinanceChangeRequest['payload']>(row.payload),status:str(row.status) as FinanceChangeRequest['status'],makerId:id(row.maker_id),checkerId:row.checker_id==null?null:id(row.checker_id),reason:str(row.reason),approvalReason:str(row.approval_reason),at:at(row.created_at),decidedAt:optionalDate(row.decided_at),result:row.result==null?null:financeJson<FinanceChangeRequest['result']>(row.result)}));
  data.taxPolicies=taxPolicies.map(taxPolicy);
  data.orderFiscalSnapshots=fiscalOrders.map(row=>financeJson<NonNullable<FinanceData['orderFiscalSnapshots']>[number]>(row.snapshot));
  data.reconciliations=reconciliations.map(row=>({id:id(row.id),month:str(row.month),fingerprint:str(row.fingerprint),reason:str(row.reason),actorId:id(row.actor_id),at:at(row.created_at)}));
  data.refunds = refunds.map(row => ({id:id(row.id),orderId:id(row.order_id),receiptId:id(row.receipt_id),provider:str(row.provider),externalId:str(row.external_id),amountMinor:financeNumber(row.amount_minor),currency:str(row.currency),at:at(row.refunded_at),evidenceRef:str(row.evidence_ref),actorId:id(row.actor_id)}));
  return data;
}
function taxPolicy(row:Row):FinanceTaxPolicy{return {id:id(row.id),requestId:id(row.request_id),effectiveFrom:row.effective_from instanceof Date?row.effective_from.toISOString().slice(0,10):str(row.effective_from).slice(0,10),issuer:financeJson<FinanceTaxPolicy['issuer']>(row.issuer),vatBps:financeNumber(row.vat_bps),policyReference:str(row.policy_reference),at:at(row.created_at),calculationPolicy:row.calculation_policy==null?null:financeJson<FinanceTaxPolicy['calculationPolicy']>(row.calculation_policy)};}
/** Read-only adapter input: future approvals never rewrite historical invoices or enable issuance. */
export async function readEffectiveFinanceTaxPolicy(db:Pick<CommerceDb,'$queryRaw'>,date=new Date()):Promise<FinanceTaxPolicy|null>{
  if(!Number.isFinite(date.getTime()))throw new Error('finance_date_invalid');
  const localDate=new Date(date.getTime()+10800000).toISOString().slice(0,10);
  const [row]=await db.$queryRaw<Row[]>`SELECT * FROM finance_tax_policies WHERE effective_from<=${localDate} ORDER BY effective_from DESC,id DESC LIMIT 1`;
  return row?taxPolicy(row):null;
}
