import 'server-only';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { CommerceDb } from '@/lib/commerce/types';
import {requireFinancePermission,enforceFinanceChecker} from '@/lib/access-control/financial-authorization';
import { assertFinanceSchemaReady } from './schema';
import { financeJson, financeNumber, readFinanceData } from './read-model';
import type { BudgetCategory, FiscalSnapshot } from './types';
import { buildFinanceReport } from './reports';
import { calculateFiscalLines, sumFinanceMoney } from './calculations';
import { FINANCE_SECTION_MODULE } from '@/lib/access-control/catalog';
import type {FinanceSection} from './types';
import {financeAuditContext} from './audit-context';

type Tx = Prisma.TransactionClient;
const options = {maxWait:10000,timeout:30000};
export const CLOSE_CHECKS = ['payment','refunds','suppliers','invoices','expenses','differences','review'] as const;
const expenseCategories = ['shipping','payment_fees','marketing','hosting','administration','tax','other'];
const categories = [...expenseCategories,'sales','trbhh_income','supplier_cost','refunds'];
export function parseFinanceId(value: string): bigint { if (!/^[1-9]\d{0,14}$/.test(value)) throw new Error('finance_id_invalid'); return BigInt(value); }
export function parseFinanceMonth(value: string): string { if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('finance_month_invalid'); return value; }
export function financeMonth(date = new Date()): string { return new Date(date.getTime()+3*3600000).toISOString().slice(0,7); }
function dateOnly(value:string): Date { if (!/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error('finance_date_invalid'); const d=new Date(`${value}T00:00:00+03:00`); if (!Number.isFinite(d.getTime()) || new Date(d.getTime()+3*3600000).toISOString().slice(0,10)!==value) throw new Error('finance_date_invalid'); return d; }
function money(value:number):number { if (!Number.isSafeInteger(value)||value<0) throw new Error('finance_amount_invalid'); return value; }
function text(value:string,max:number):string { if(typeof value!=='string'||!value.trim()||value.length>max) throw new Error('finance_input_invalid');return value.trim(); }
function request(value:string):string { if(!/^[\w.:-]{8,80}$/.test(value))throw new Error('finance_request_invalid');return value; }
function canonical(value:unknown):unknown { if (typeof value==='bigint')return String(value);if(value instanceof Date)return value.toISOString();if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));return value; }
export function fingerprint(value:unknown):string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
export async function auditFinance(tx:Tx,actor:bigint,action:string,entity:string,entityId:string,reason:string,payload:unknown={},now=new Date()) {
  const body=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload as Record<string,unknown>:{detail:payload};
  const complete={...body,before:body.before??null,after:body.after??body,...financeAuditContext()};
  await tx.$executeRaw`INSERT INTO finance_audit(created_at,actor_id,action,entity,entity_id,reason,payload) VALUES(${now},${actor},${action},${entity},${entityId},${reason},${JSON.stringify(canonical(complete))})`;
}
const audit=auditFinance;
export async function requireOpenPeriod(tx:Tx,month:string) {
  parseFinanceMonth(month);
  await tx.$executeRaw`INSERT INTO finance_periods(month,checks_json) VALUES(${month},'[]') ON DUPLICATE KEY UPDATE month=month`;
  const [period]=await tx.$queryRaw<{closed_at:Date|null;checks_json:unknown;reason:string;version:number}[]>`SELECT closed_at,checks_json,reason,version FROM finance_periods WHERE month=${month} FOR UPDATE`;
  if(!period||period.closed_at)throw new Error('finance_period_closed');
  return period;
}
async function lockedSupplier(tx:Tx,supplierId:bigint) { const rows=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_suppliers WHERE id=${supplierId} FOR UPDATE`;if(!rows.length)throw new Error('finance_supplier_missing'); }

export type ExpenseInput = {category:string;description:string;netMinor:number;vatMinor:number;paidMinor:number;occurredAt:string;dueAt:string;reference:string;requestKey:string};
export function validateExpense(input:ExpenseInput) {
  const netMinor=money(input.netMinor),vatMinor=money(input.vatMinor),totalMinor=money(netMinor+vatMinor),paidMinor=money(input.paidMinor);
  if(!expenseCategories.includes(input.category)||totalMinor<=0||paidMinor>totalMinor)throw new Error('finance_expense_invalid');
  return {...input,description:text(input.description,500),reference:text(input.reference,160),requestKey:request(input.requestKey),netMinor,vatMinor,totalMinor,paidMinor,occurredAt:dateOnly(input.occurredAt),dueAt:dateOnly(input.dueAt)};
}
export async function saveBudget(db:CommerceDb,actor:bigint,input:{month:string;category:string;plannedMinor:number;reason?:string}) {
  const month=parseFinanceMonth(input.month),amount=money(input.plannedMinor),reason=text(input.reason||'',1000);if(!categories.includes(input.category))throw new Error('finance_category_invalid');
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'budget:edit');
    await requireOpenPeriod(tx,month);
    const previous=await tx.$queryRaw<{planned_minor:bigint}[]>`SELECT planned_minor FROM finance_budgets WHERE month=${month} AND category=${input.category}`;
    await tx.$executeRaw`INSERT INTO finance_budgets(month,category,planned_minor) VALUES(${month},${input.category},${amount}) ON DUPLICATE KEY UPDATE planned_minor=${amount}`;
    await audit(tx,actor,'budget_saved','budget',`${month}:${input.category}`,reason,{before:previous[0]?.planned_minor??null,after:amount});
  },options);
}
export async function recordExpense(db:CommerceDb,actor:bigint,input:ExpenseInput) {
  const value=validateExpense(input),hash=fingerprint(value);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'expenses:create');
    await requireOpenPeriod(tx,financeMonth(value.occurredAt));
    const [prior]=await tx.$queryRaw<{id:bigint;fingerprint:string}[]>`SELECT id,fingerprint FROM finance_expenses WHERE request_key=${value.requestKey} FOR UPDATE`;
    if(prior){if(prior.fingerprint!==hash)throw new Error('finance_idempotency_conflict');return prior.id;}
    await tx.$executeRaw`INSERT INTO finance_expenses(request_key,fingerprint,category,description,net_minor,vat_minor,total_minor,paid_minor,occurred_at,due_at,reference,actor_id) VALUES(${value.requestKey},${hash},${value.category},${value.description},${value.netMinor},${value.vatMinor},${value.totalMinor},${value.paidMinor},${value.occurredAt},${value.dueAt},${value.reference},${actor})`;
    const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_expenses WHERE request_key=${value.requestKey}`;
    await audit(tx,actor,'expense_recorded','expense',String(row.id),value.description,{totalMinor:value.totalMinor,paidMinor:value.paidMinor,reference:value.reference});return row.id;
  },options);
}
export async function reverseExpense(db:CommerceDb,actor:bigint,expenseId:bigint,reason:string,now=new Date()) {
  reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'expenses:refund');
    await requireOpenPeriod(tx,financeMonth(now));
    const [original]=await tx.$queryRaw<{id:bigint;category:BudgetCategory;description:string;net_minor:bigint;vat_minor:bigint;total_minor:bigint;paid_minor:bigint;reversal_of:bigint|null}[]>`SELECT * FROM finance_expenses WHERE id=${expenseId} FOR UPDATE`;
    if(!original||original.reversal_of)throw new Error('finance_reversal_invalid');
    const [prior]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_expenses WHERE reversal_of=${expenseId}`;if(prior)return prior.id;
    const key=`expense-reversal:${expenseId}`,hash=fingerprint({expenseId,reason});
    await tx.$executeRaw`INSERT INTO finance_expenses(request_key,fingerprint,category,description,net_minor,vat_minor,total_minor,paid_minor,occurred_at,due_at,reference,reversal_of,actor_id) VALUES(${key},${hash},${original.category},${'عكس: '+original.description.slice(0,490)},${original.net_minor},${original.vat_minor},${original.total_minor},${original.paid_minor},${now},${now},${`REV-${expenseId}`},${expenseId},${actor})`;
    const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_expenses WHERE reversal_of=${expenseId}`;
    await audit(tx,actor,'expense_reversed','expense',String(row.id),reason,{originalId:expenseId},now);return row.id;
  },options);
}
export async function releaseAccrual(db:CommerceDb,actor:bigint,accrualId:bigint,dueDate:string,reason:string,now=new Date()) {
  const due=dateOnly(dueDate);reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'settlements:create');
    await requireOpenPeriod(tx,financeMonth(now));
    const [accrual]=await tx.$queryRaw<{id:bigint;created_at:Date;status:string}[]>`SELECT id,created_at,status FROM commerce_supplier_accruals WHERE id=${accrualId} FOR UPDATE`;
    if(!accrual||due.getTime()<accrual.created_at.getTime()-86400000)throw new Error('finance_accrual_invalid');
    const [prior]=await tx.$queryRaw<{eligible_at:Date|null;due_at:Date|null;hold_reason:string}[]>`SELECT eligible_at,due_at,hold_reason FROM finance_accrual_reviews WHERE accrual_id=${accrualId}`;
    if(prior?.eligible_at)throw new Error('finance_accrual_already_released');
    await tx.$executeRaw`INSERT INTO finance_accrual_reviews(accrual_id,eligible_at,due_at,hold_reason,actor_id) VALUES(${accrualId},${now},${due},'',${actor}) ON DUPLICATE KEY UPDATE eligible_at=${now},due_at=${due},hold_reason='',actor_id=${actor}`;
    await audit(tx,actor,'accrual_released','accrual',String(accrualId),reason,{before:prior??null,after:{eligible_at:now,due_at:due,hold_reason:''}},now);
  },options);
}
export async function accrualRemaining(tx:Tx,id:bigint,supplierId:bigint,now:Date,requireDue=true):Promise<number> {
  const [row]=await tx.$queryRaw<{amount_minor:bigint;order_id:bigint;product_id:bigint;eligible_at:Date|null;due_at:Date|null}[]>`SELECT a.amount_minor,a.order_id,a.product_id,r.eligible_at,r.due_at FROM commerce_supplier_accruals a LEFT JOIN finance_accrual_reviews r ON r.accrual_id=a.id WHERE a.id=${id} AND a.supplier_id=${supplierId} FOR UPDATE`;
  if(!row||requireDue&&(!row.eligible_at||!row.due_at||row.eligible_at>now||row.due_at>now))throw new Error('finance_accrual_not_due');
  const paid=await tx.$queryRaw<{amount_minor:bigint;reversal_of:bigint|null}[]>`SELECT l.amount_minor,s.reversal_of FROM finance_settlement_lines l INNER JOIN finance_settlements s ON s.id=l.settlement_id WHERE l.accrual_id=${id} AND s.status IN ('approved','reversed')`;
  const notes=await tx.$queryRaw<{kind:string;snapshot:unknown}[]>`SELECT kind,snapshot FROM finance_invoices WHERE order_id=${row.order_id} AND status='issued' AND kind IN ('credit_note','debit_note') AND issued_at<=${now}`;
  const adjustments:number[]=[];
  for(const note of notes)for(const line of financeJson<FiscalSnapshot>(note.snapshot).lines){
    if(line.key===String(row.product_id)&&line.supplierId===String(supplierId))adjustments.push((note.kind==='credit_note'?-1:1)*(line.supplierMinor??0));
  }
  return sumFinanceMoney([financeNumber(row.amount_minor),...adjustments,...paid.map(v=>(v.reversal_of?1:-1)*financeNumber(v.amount_minor))]);
}
async function requireNoSupplierRecovery(tx:Tx,supplierId:bigint,now:Date){
  const accruals=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_supplier_accruals WHERE supplier_id=${supplierId} ORDER BY id FOR UPDATE`;
  for(const accrual of accruals)if(await accrualRemaining(tx,accrual.id,supplierId,now,false)<0)throw new Error('finance_supplier_recovery_outstanding');
}
export async function prepareSettlement(db:CommerceDb,actor:bigint,input:{supplierId:bigint;accrualIds:bigint[];requestKey:string;reason:string},now=new Date()) {
  const key=request(input.requestKey),reason=text(input.reason,1000),ids=[...new Set(input.accrualIds.map(String))].map(parseFinanceId).sort((a,b)=>a<b?-1:1);
  if(!ids.length||ids.length>200)throw new Error('finance_selection_invalid');const hash=fingerprint({supplierId:input.supplierId,ids,reason});await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'settlements:create');
    await requireOpenPeriod(tx,financeMonth(now));await lockedSupplier(tx,input.supplierId);
    const [prior]=await tx.$queryRaw<{id:bigint;fingerprint:string}[]>`SELECT id,fingerprint FROM finance_settlements WHERE request_key=${key} FOR UPDATE`;
    if(prior){if(prior.fingerprint!==hash)throw new Error('finance_idempotency_conflict');return prior.id;}
    await requireNoSupplierRecovery(tx,input.supplierId,now);
    const lines=[];for(const id of ids){const amount=await accrualRemaining(tx,id,input.supplierId,now);if(amount<=0)throw new Error('finance_already_settled');lines.push({id,amount});}
    const total=money(lines.reduce((sum,line)=>money(sum+line.amount),0));
    await tx.$executeRaw`INSERT INTO finance_settlements(request_key,fingerprint,supplier_id,amount_minor,created_at,reason,actor_id) VALUES(${key},${hash},${input.supplierId},${total},${now},${reason},${actor})`;
    const [settlement]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_settlements WHERE request_key=${key}`;
    for(const line of lines)await tx.$executeRaw`INSERT INTO finance_settlement_lines(settlement_id,accrual_id,amount_minor) VALUES(${settlement.id},${line.id},${line.amount})`;
    await audit(tx,actor,'settlement_prepared','settlement',String(settlement.id),reason,{totalMinor:total,lines},now);return settlement.id;
  },options);
}
export async function approveSettlement(db:CommerceDb,actor:bigint,settlementId:bigint,reference:string,now=new Date()) {
  reference=text(reference,160);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'settlements:approve');
    await requireOpenPeriod(tx,financeMonth(now));
    const [row]=await tx.$queryRaw<{id:bigint;supplier_id:bigint;status:string;amount_minor:bigint;reference:string;reversal_of:bigint|null;actor_id:bigint}[]>`SELECT * FROM finance_settlements WHERE id=${settlementId} FOR UPDATE`;
    if(!row||row.reversal_of)throw new Error('finance_settlement_missing');
    if(row.status==='approved'){if(row.reference!==reference)throw new Error('finance_idempotency_conflict');return;}
    if(row.status!=='draft')throw new Error('finance_settlement_state');await lockedSupplier(tx,row.supplier_id);
    const checker=await enforceFinanceChecker(tx,actor,row.actor_id,'settlements:approve');
    await requireNoSupplierRecovery(tx,row.supplier_id,now);
    const lines=await tx.$queryRaw<{accrual_id:bigint;amount_minor:bigint}[]>`SELECT accrual_id,amount_minor FROM finance_settlement_lines WHERE settlement_id=${settlementId} ORDER BY accrual_id`;
    if(!lines.length||lines.reduce((sum,v)=>sum+financeNumber(v.amount_minor),0)!==financeNumber(row.amount_minor))throw new Error('finance_settlement_difference');
    for(const line of lines)if(await accrualRemaining(tx,line.accrual_id,row.supplier_id,now)<financeNumber(line.amount_minor))throw new Error('finance_already_settled');
    await tx.$executeRaw`UPDATE finance_settlements SET status='approved',approved_at=${now},reference=${reference} WHERE id=${settlementId} AND status='draft'`;
    await audit(tx,actor,'settlement_approved','settlement',String(settlementId),'إثبات تحويل منفذ خارج النظام',{before:row,after:{...row,status:'approved',approved_at:now,reference},...checker},now);
  },options);
}
export async function reverseSettlement(db:CommerceDb,actor:bigint,settlementId:bigint,reason:string,now=new Date()) {
  reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'settlements:refund');
    await requireOpenPeriod(tx,financeMonth(now));
    const [original]=await tx.$queryRaw<{id:bigint;supplier_id:bigint;status:string;amount_minor:bigint;reversal_of:bigint|null}[]>`SELECT * FROM finance_settlements WHERE id=${settlementId} FOR UPDATE`;
    if(!original||original.reversal_of||!['approved','reversed'].includes(original.status))throw new Error('finance_reversal_invalid');await lockedSupplier(tx,original.supplier_id);
    const [prior]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_settlements WHERE reversal_of=${settlementId}`;if(prior)return prior.id;
    const key=`settlement-reversal:${settlementId}`,hash=fingerprint({settlementId,reason});
    await tx.$executeRaw`INSERT INTO finance_settlements(request_key,fingerprint,supplier_id,amount_minor,created_at,approved_at,status,reference,reason,reversal_of,actor_id) VALUES(${key},${hash},${original.supplier_id},${original.amount_minor},${now},${now},'approved',${`REV-${settlementId}`},${reason},${settlementId},${actor})`;
    const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_settlements WHERE reversal_of=${settlementId}`;
    await tx.$executeRaw`INSERT INTO finance_settlement_lines(settlement_id,accrual_id,amount_minor) SELECT ${row.id},accrual_id,amount_minor FROM finance_settlement_lines WHERE settlement_id=${settlementId}`;
    await tx.$executeRaw`UPDATE finance_settlements SET status='reversed' WHERE id=${settlementId}`;
    await audit(tx,actor,'settlement_reversed','settlement',String(row.id),reason,{before:original,after:{original:{...original,status:'reversed'},reversal:{id:row.id,amountMinor:original.amount_minor,at:now}},originalId:settlementId},now);return row.id;
  },options);
}

/** Receipts themselves are the durable pending work queue: missed workers can replay them. */
export async function captureInvoices(db:CommerceDb,actor:bigint) {
  await assertFinanceSchemaReady(db);await db.$transaction(tx=>requireFinancePermission(tx,actor,'invoices:create'),options);const data=await readFinanceData(db);let created=0;
  for(const receipt of data.receipts){
    const source=data.orders.find(order=>order.id===receipt.orderId);
    if(!source||source.status!=='paid'||source.totalMinor!==receipt.amountMinor||receipt.currency!=='SAR'||source.currency!=='SAR')continue;
    if(data.invoices.some(invoice=>invoice.kind==='invoice'&&invoice.receiptId===receipt.id))continue;
    created+=await db.$transaction(async tx=>{
      await requireFinancePermission(tx,actor,'invoices:create');
      await requireOpenPeriod(tx,financeMonth(new Date(receipt.at)));
      const key=`receipt:${receipt.id}`;
      const [prior]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_invoices WHERE source_key=${key} FOR UPDATE`;if(prior)return 0;
      await tx.$executeRaw`INSERT INTO finance_invoices(order_id,receipt_id,source_key,created_at,total_minor,source_snapshot,reason) VALUES(${BigInt(source.id)},${BigInt(receipt.id)},${key},${new Date(receipt.at)},${receipt.amountMinor},${JSON.stringify(source)},'بانتظار اعتماد بيانات جهة الإصدار والسياسة الضريبية وقت البيع')`;
      const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_invoices WHERE source_key=${key}`;
      await audit(tx,actor,'invoice_captured','invoice',String(row.id),'حفظ لقطة المقبوض الموثق دون افتراض ضريبة',{receiptId:receipt.id,orderId:source.id});return 1;
    },options);
  }
  return created;
}

/** Server integration seam only; no browser action accepts fiscal snapshots. Disabled by default. */
export async function issueInvoice(db:CommerceDb,actor:bigint,invoiceId:bigint,snapshot:FiscalSnapshot,gate:{enabled:boolean;approvedPolicyReference:string},now=new Date()) {
  if(!gate.enabled||!gate.approvedPolicyReference||snapshot.policyReference!==gate.approvedPolicyReference)throw new Error('finance_issuance_not_approved');
  if(snapshot.version!==1||snapshot.currency!=='SAR'||!snapshot.issuer.name||!snapshot.issuer.address||!/^3\d{13}3$/.test(snapshot.issuer.taxNumber)||!snapshot.customer.name)throw new Error('finance_fiscal_identity_invalid');
  const calculated=calculateFiscalLines(snapshot.lines);
  if(calculated.totalMinor!==snapshot.totalMinor||calculated.netMinor!==snapshot.netMinor||calculated.vatMinor!==snapshot.vatMinor||snapshot.paidMinor!==snapshot.totalMinor||fingerprint(calculated.lines)!==fingerprint(snapshot.lines))throw new Error('finance_invoice_difference');
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'invoices:create');
    const [header]=await tx.$queryRaw<{created_at:Date}[]>`SELECT created_at FROM finance_invoices WHERE id=${invoiceId}`;
    if(!header)throw new Error('finance_invoice_difference');
    // Lock source and issue periods in chronological order; a late issue cannot rewrite a closed sale month.
    for(const month of [...new Set([financeMonth(header.created_at),financeMonth(now)])].sort())await requireOpenPeriod(tx,month);
    const [row]=await tx.$queryRaw<{id:bigint;order_id:bigint;receipt_id:bigint;total_minor:bigint;status:string;number:string|null;snapshot:unknown;source_snapshot:unknown}[]>`SELECT * FROM finance_invoices WHERE id=${invoiceId} FOR UPDATE`;
    if(!row||snapshot.sourceOrderId!==String(row.order_id)||snapshot.sourceReceiptId!==String(row.receipt_id)||snapshot.totalMinor!==financeNumber(row.total_minor))throw new Error('finance_invoice_difference');
    if(row.status==='issued'){if(fingerprint(financeJson(row.snapshot))!==fingerprint(snapshot))throw new Error('finance_invoice_immutable');return row.number;}
    if(row.status!=='pending_policy')throw new Error('finance_invoice_state');
    const source=financeJson<{customerName:string;items:{productId:string;title:string;quantity:number;totalMinor:number}[];shippingMinor:number;suppliers:{productId:string;supplierId:string;amountMinor:number}[]}>(row.source_snapshot);
    if(snapshot.customer.name!==source.customerName)throw new Error('finance_invoice_identity_difference');
    if(new Set(snapshot.lines.map(line=>line.key)).size!==snapshot.lines.length)throw new Error('finance_invoice_difference');
    const productLines=snapshot.lines.filter(line=>line.key!=='shipping');
    if(source.items.length!==productLines.length||source.items.some(item=>!productLines.some(line=>line.key===item.productId&&line.title===item.title&&line.quantity===item.quantity&&line.grossMinor===item.totalMinor)))throw new Error('finance_invoice_difference');
    if(snapshot.lines.filter(line=>line.key==='shipping').reduce((sum,l)=>sum+l.grossMinor,0)!==source.shippingMinor)throw new Error('finance_invoice_difference');
    for(const line of snapshot.lines){
      const allocation=source.suppliers.find(supplier=>supplier.productId===line.key);
      if(allocation ? line.supplierId!==allocation.supplierId||line.supplierMinor!==allocation.amountMinor : line.supplierId!==undefined||line.supplierMinor!==undefined)throw new Error('finance_supplier_snapshot_difference');
    }
    const series=`INV-${financeMonth(now).slice(0,4)}`;
    await tx.$executeRaw`INSERT INTO finance_sequences(name,next_value) VALUES(${series},1) ON DUPLICATE KEY UPDATE name=name`;
    const [sequence]=await tx.$queryRaw<{next_value:bigint}[]>`SELECT next_value FROM finance_sequences WHERE name=${series} FOR UPDATE`;
    const number=`${series}-${String(sequence.next_value).padStart(8,'0')}`;
    await tx.$executeRaw`UPDATE finance_sequences SET next_value=next_value+1 WHERE name=${series}`;
    await tx.$executeRaw`UPDATE finance_invoices SET status='issued',number=${number},issued_at=${now},net_minor=${snapshot.netMinor},vat_minor=${snapshot.vatMinor},snapshot=${JSON.stringify(snapshot)},reason='' WHERE id=${invoiceId} AND status='pending_policy'`;
    await audit(tx,actor,'invoice_issued','invoice',String(invoiceId),'اعتماد اللقطة وفق سياسة جهة الإصدار',{before:row,after:{...row,status:'issued',number,issued_at:now,net_minor:snapshot.netMinor,vat_minor:snapshot.vatMinor,snapshot},policyReference:snapshot.policyReference},now);return number;
  },options);
}

export async function closeMonth(db:CommerceDb,actor:bigint,month:string,checks:string[],reason:string,now=new Date()) {
  parseFinanceMonth(month);reason=text(reason,1000);
  if(month>=financeMonth(now))throw new Error('finance_month_not_ended');
  if(CLOSE_CHECKS.some(check=>!checks.includes(check))||new Set(checks).size!==CLOSE_CHECKS.length)throw new Error('finance_checklist_incomplete');await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'periods:close_period');
    const before=await requireOpenPeriod(tx,month);
    const data=await readFinanceData(tx),report=buildFinanceReport(data,{month,section:'close',mode:'accountant'},now);
    if(!report.canClose||report.issues.some(issue=>issue.severity==='error'))throw new Error('finance_close_blocked');
    await tx.$executeRaw`UPDATE finance_periods SET closed_at=${now},checks_json=${JSON.stringify([...CLOSE_CHECKS])},reason=${reason},version=version+1 WHERE month=${month} AND closed_at IS NULL`;
    await audit(tx,actor,'month_closed','period',month,reason,{before,after:{closed_at:now,checks_json:[...CLOSE_CHECKS],reason,version:financeNumber(before.version)+1},checks,metrics:report.metrics},now);
  },options);
}
export async function recordFinanceExport(db:CommerceDb,actor:bigint,month:string,format:string,section:string) {
  const accessModule=/^invoice:[1-9]\d{0,14}$/.test(section)?'invoices':(Object.hasOwn(FINANCE_SECTION_MODULE,section)?FINANCE_SECTION_MODULE[section as FinanceSection]:undefined);if(!accessModule)throw new Error('access_forbidden');
  await assertFinanceSchemaReady(db);return db.$transaction(async tx=>{await requireFinancePermission(tx,actor,`${accessModule}:export`);await audit(tx,actor,'report_exported','report',parseFinanceMonth(month),'تصدير تقرير مالي',{format,section});},options);
}

export async function cancelSettlement(db:CommerceDb,actor:bigint,id:bigint,reason:string,now=new Date()){
  reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'settlements:delete');await requireOpenPeriod(tx,financeMonth(now));
    const [row]=await tx.$queryRaw<{status:string;amount_minor:bigint;supplier_id:bigint}[]>`SELECT status,amount_minor,supplier_id FROM finance_settlements WHERE id=${id} FOR UPDATE`;
    if(!row)throw new Error('finance_settlement_missing');if(row.status==='cancelled')return;if(row.status!=='draft')throw new Error('finance_settlement_state');
    await tx.$executeRaw`UPDATE finance_settlements SET status='cancelled' WHERE id=${id} AND status='draft'`;
    await audit(tx,actor,'settlement_cancelled','settlement',String(id),reason,{before:row,after:{...row,status:'cancelled'}},now);
  },options);
}
export async function cancelDraftInvoice(db:CommerceDb,actor:bigint,id:bigint,reason:string,now=new Date()){
  reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'invoices:delete');
    const [header]=await tx.$queryRaw<{created_at:Date}[]>`SELECT created_at FROM finance_invoices WHERE id=${id}`;
    if(!header)throw new Error('finance_invoice_missing');
    for(const month of [...new Set([financeMonth(header.created_at),financeMonth(now)])].sort())await requireOpenPeriod(tx,month);
    const [row]=await tx.$queryRaw<{status:string;kind:string;total_minor:bigint;number:string|null}[]>`SELECT status,kind,total_minor,number FROM finance_invoices WHERE id=${id} FOR UPDATE`;
    if(row?.status==='cancelled')return;if(!row||row.status!=='pending_policy'||row.kind!=='invoice'||row.number)throw new Error('finance_invoice_state');
    await tx.$executeRaw`UPDATE finance_invoices SET status='cancelled',reason=${reason} WHERE id=${id} AND status='pending_policy'`;
    await audit(tx,actor,'invoice_cancelled','invoice',String(id),reason,{before:row,after:{...row,status:'cancelled',reason}},now);
  },options);
}

/** Corrective review only: keep the original receipt/source identity and issue no document. */
export async function restoreDraftInvoice(db:CommerceDb,actor:bigint,id:bigint,reason:string,now=new Date()){
  reason=text(reason,1000);await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireFinancePermission(tx,actor,'invoices:create');
    await requireFinancePermission(tx,actor,'invoices:delete');
    const [header]=await tx.$queryRaw<{created_at:Date}[]>`SELECT created_at FROM finance_invoices WHERE id=${id}`;
    if(!header)throw new Error('finance_invoice_missing');
    for(const month of [...new Set([financeMonth(header.created_at),financeMonth(now)])].sort())await requireOpenPeriod(tx,month);
    const [row]=await tx.$queryRaw<{status:string;kind:string;number:string|null;snapshot:unknown;reason:string}[]>`SELECT status,kind,number,snapshot,reason FROM finance_invoices WHERE id=${id} FOR UPDATE`;
    if(!row||row.kind!=='invoice'||row.status!=='cancelled'||row.number||row.snapshot!==null)throw new Error('finance_invoice_state');
    await tx.$executeRaw`UPDATE finance_invoices SET status='pending_policy',reason=${reason} WHERE id=${id} AND status='cancelled' AND number IS NULL AND snapshot IS NULL`;
    await audit(tx,actor,'invoice_restored','invoice',String(id),reason,{before:row,after:{...row,status:'pending_policy',reason}},now);
  },options);
}
