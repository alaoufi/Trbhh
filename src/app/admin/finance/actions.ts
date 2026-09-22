'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { accessActor, requireAccess } from '@/lib/access-control/guards';
import { withFinanceAuditContext } from '@/lib/finance/audit-context';
import type { AccessModule, AccessAction } from '@/lib/access-control/catalog';
import { financeSections } from '@/lib/finance/reports';
import { financeField as field, parseFinanceSar, publicFinanceError } from '@/lib/finance/input';
import { approveSettlement, cancelDraftInvoice, cancelSettlement, captureInvoices, closeMonth, financeMonth, parseFinanceId, parseFinanceMonth, prepareSettlement, recordExpense, releaseAccrual, restoreDraftInvoice, reverseExpense, reverseSettlement, saveBudget } from '@/lib/finance/service';
import { recordFinanceReconciliation } from '@/lib/finance/reconciliation';
import { approveFinanceChange, cancelFinanceChange, readFinanceChangeKind, requestFinanceChange } from '@/lib/finance/workflows';

async function run(form:FormData,module:AccessModule,permission:AccessAction,work:(actor:bigint)=>Promise<unknown>):Promise<never> {
  await requireAccess(module,'view');
  const session=await requireAccess(module,permission);
  const auditActor=await accessActor(session);
  const section=form.get('returnTo');
  const params=new URLSearchParams({section:typeof section==='string'&&financeSections.some(s=>s.key===section)?section:'overview'});
  let error:string|null=null;
  try{
    params.set('month',parseFinanceMonth(field(form,'month')));
    await withFinanceAuditContext({ip:auditActor.ip,sessionFingerprint:auditActor.sessionFingerprint},()=>work(BigInt(session.uid)));
  }catch(cause){error=publicFinanceError(cause);}
  if(error)params.set('error',error);
  else{params.set('saved','1');revalidatePath('/admin/finance');}
  redirect('/admin/finance?'+params.toString());
}
export async function saveFinanceBudget(form:FormData) {
  return run(form,'budget','edit',actor=>saveBudget(prisma,actor,{month:field(form,'month'),category:field(form,'category'),plannedMinor:parseFinanceSar(field(form,'planned')),reason:field(form,'reason')}));
}
export async function recordFinanceExpense(form:FormData) {
  return run(form,'expenses','create',actor=>{
    const occurredAt=field(form,'occurredAt');
    if(occurredAt.slice(0,7)!==field(form,'month')||occurredAt>new Date(Date.now()+3*3600000).toISOString().slice(0,10))throw new Error('finance_date_invalid');
    return recordExpense(prisma,actor,{category:field(form,'category'),description:field(form,'description'),netMinor:parseFinanceSar(field(form,'net')),vatMinor:parseFinanceSar(field(form,'vat')),paidMinor:parseFinanceSar(field(form,'paid')),occurredAt,dueAt:field(form,'dueAt'),reference:field(form,'reference'),requestKey:field(form,'requestKey')});
  });
}
function currentMonthOnly(form:FormData){if(field(form,'month')!==financeMonth())throw new Error('finance_current_period_required');}
export async function reverseFinanceExpense(form:FormData) {
  return run(form,'expenses','refund',actor=>{currentMonthOnly(form);return reverseExpense(prisma,actor,parseFinanceId(field(form,'expenseId')),field(form,'reason'));});
}
export async function releaseFinanceAccrual(form:FormData) {
  return run(form,'settlements','create',actor=>{currentMonthOnly(form);return releaseAccrual(prisma,actor,parseFinanceId(field(form,'accrualId')),field(form,'dueAt'),field(form,'reason'));});
}
export async function prepareFinanceSettlement(form:FormData) {
  return run(form,'settlements','create',actor=>{
    currentMonthOnly(form);
    const ids=form.getAll('accrualIds');
    if(ids.some(id=>typeof id!=='string'))throw new Error('finance_selection_invalid');
    return prepareSettlement(prisma,actor,{supplierId:parseFinanceId(field(form,'supplierId')),accrualIds:ids.map(id=>parseFinanceId(String(id))),requestKey:field(form,'requestKey'),reason:field(form,'reason')});
  });
}
export async function approveFinanceSettlement(form:FormData) {
  return run(form,'settlements','approve',actor=>{
    currentMonthOnly(form);
    if(field(form,'confirm')!=='1')throw new Error('finance_confirmation_required');
    return approveSettlement(prisma,actor,parseFinanceId(field(form,'settlementId')),field(form,'reference'));
  });
}
export async function reverseFinanceSettlement(form:FormData) {
  return run(form,'settlements','refund',actor=>{currentMonthOnly(form);return reverseSettlement(prisma,actor,parseFinanceId(field(form,'settlementId')),field(form,'reason'));});
}
export async function closeFinanceMonth(form:FormData) {
  return run(form,'periods','close_period',actor=>closeMonth(prisma,actor,field(form,'month'),form.getAll('checks').map(String),field(form,'reason')));
}
export async function captureFinanceInvoices(form:FormData) {
  return run(form,'invoices','create',actor=>captureInvoices(prisma,actor));
}
export async function cancelFinanceSettlement(form:FormData) {
  return run(form,'settlements','delete',actor=>cancelSettlement(prisma,actor,parseFinanceId(field(form,'settlementId')),field(form,'reason')));
}
export async function cancelFinanceDraftInvoice(form:FormData) {
  return run(form,'invoices','delete',actor=>cancelDraftInvoice(prisma,actor,parseFinanceId(field(form,'invoiceId')),field(form,'reason')));
}
export async function requestFinanceReturn(form:FormData) {
  return run(form,'returns','create',actor=>{
    const keys=form.getAll('lineKeys');
    if(keys.some(key=>typeof key!=='string')||keys.length>100)throw new Error('finance_selection_invalid');
    const lines=keys.map(key=>{
      const value=field(form,'quantity:'+key);
      if(!/^\d{1,8}$/.test(value))throw new Error('finance_quantity_invalid');
      return {key:String(key),quantity:Number(value)};
    }).filter(line=>line.quantity>0);
    if(!lines.length)throw new Error('finance_selection_invalid');
    return requestFinanceChange(prisma,actor,{kind:'return',targetId:String(parseFinanceId(field(form,'invoiceId'))),payload:{lines},reason:field(form,'reason'),requestKey:field(form,'requestKey')});
  });
}
export async function requestFinanceTaxSettings(form:FormData) {
  return run(form,'tax','manage_settings',actor=>requestFinanceChange(prisma,actor,{kind:'tax_settings',targetId:'tax',payload:{effectiveFrom:field(form,'effectiveFrom'),issuer:{name:field(form,'issuerName'),taxNumber:field(form,'issuerTaxNumber'),address:field(form,'issuerAddress')},vatBps:parseFinanceSar(field(form,'vatPercent')),policyReference:field(form,'policyReference')},reason:field(form,'reason'),requestKey:field(form,'requestKey')}));
}
export async function requestFinancePeriodReopen(form:FormData) {
  return run(form,'periods','reopen_period',actor=>{
    const version=field(form,'expectedVersion');
    if(!/^\d{1,9}$/.test(version))throw new Error('finance_input_invalid');
    return requestFinanceChange(prisma,actor,{kind:'reopen_period',targetId:parseFinanceMonth(field(form,'month')),payload:{expectedVersion:Number(version)},reason:field(form,'reason'),requestKey:field(form,'requestKey')});
  });
}
async function decideFinanceChange(form:FormData,approve:boolean) {
  const kind=field(form,'kind');
  if(!['return','tax_settings','reopen_period'].includes(kind))redirect('/admin/finance?error=finance_change_invalid');
  const accessModule:AccessModule=kind==='return'?'returns':kind==='tax_settings'?'tax':'periods';
  const permission:AccessAction=approve?'approve':kind==='return'?'delete':kind==='tax_settings'?'manage_settings':'reopen_period';
  return run(form,accessModule,permission,async actor=>{
    const id=parseFinanceId(field(form,'changeId'));
    const persistedKind=await readFinanceChangeKind(prisma,id);
    if(!persistedKind||persistedKind!==kind)throw new Error('finance_change_missing');
    return approve?approveFinanceChange(prisma,actor,id,field(form,'reason')):cancelFinanceChange(prisma,actor,id,field(form,'reason'));
  });
}
export async function approveFinanceRequest(form:FormData) { return decideFinanceChange(form,true); }
export async function cancelFinanceRequest(form:FormData) { return decideFinanceChange(form,false); }

export async function reviewFinanceReconciliation(form:FormData) {
  return run(form,'reconciliation','reconcile',actor=>recordFinanceReconciliation(prisma,actor,{month:field(form,'month'),reason:field(form,'reason'),requestKey:field(form,'requestKey')}));
}

export async function restoreFinanceDraftInvoice(form:FormData) {
  return run(form,'invoices','delete',async actor=>{
    await requireAccess('invoices','create');
    return restoreDraftInvoice(prisma,actor,parseFinanceId(field(form,'invoiceId')),field(form,'reason'));
  });
}
