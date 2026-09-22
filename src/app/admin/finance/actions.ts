'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireFinance, type FinanceAction } from '@/lib/finance/permissions';
import { financeSections } from '@/lib/finance/reports';
import { financeField as field, parseFinanceSar, publicFinanceError } from '@/lib/finance/input';
import { approveSettlement, captureInvoices, closeMonth, financeMonth, parseFinanceId, parseFinanceMonth, prepareSettlement, recordExpense, releaseAccrual, reverseExpense, reverseSettlement, saveBudget } from '@/lib/finance/service';

async function run(form:FormData,permission:FinanceAction,work:(actor:bigint)=>Promise<unknown>):Promise<never> {
  const session=await requireFinance(permission);
  const section=form.get('returnTo');
  const params=new URLSearchParams({section:typeof section==='string'&&financeSections.some(s=>s.key===section)?section:'overview'});
  let error:string|null=null;
  try{
    params.set('month',parseFinanceMonth(field(form,'month')));
    await work(BigInt(session.uid));
  }catch(cause){error=publicFinanceError(cause);}
  if(error)params.set('error',error);
  else{params.set('saved','1');revalidatePath('/admin/finance');}
  redirect('/admin/finance?'+params.toString());
}
export async function saveFinanceBudget(form:FormData) {
  return run(form,'edit',actor=>saveBudget(prisma,actor,{month:field(form,'month'),category:field(form,'category'),plannedMinor:parseFinanceSar(field(form,'planned'))}));
}
export async function recordFinanceExpense(form:FormData) {
  return run(form,'edit',actor=>{
    const occurredAt=field(form,'occurredAt');
    if(occurredAt.slice(0,7)!==field(form,'month')||occurredAt>new Date(Date.now()+3*3600000).toISOString().slice(0,10))throw new Error('finance_date_invalid');
    return recordExpense(prisma,actor,{category:field(form,'category'),description:field(form,'description'),netMinor:parseFinanceSar(field(form,'net')),vatMinor:parseFinanceSar(field(form,'vat')),paidMinor:parseFinanceSar(field(form,'paid')),occurredAt,dueAt:field(form,'dueAt'),reference:field(form,'reference'),requestKey:field(form,'requestKey')});
  });
}
function currentMonthOnly(form:FormData){if(field(form,'month')!==financeMonth())throw new Error('finance_current_period_required');}
export async function reverseFinanceExpense(form:FormData) {
  return run(form,'approve',actor=>{currentMonthOnly(form);return reverseExpense(prisma,actor,parseFinanceId(field(form,'expenseId')),field(form,'reason'));});
}
export async function releaseFinanceAccrual(form:FormData) {
  return run(form,'approve',actor=>{currentMonthOnly(form);return releaseAccrual(prisma,actor,parseFinanceId(field(form,'accrualId')),field(form,'dueAt'),field(form,'reason'));});
}
export async function prepareFinanceSettlement(form:FormData) {
  return run(form,'edit',actor=>{
    currentMonthOnly(form);
    const ids=form.getAll('accrualIds');
    if(ids.some(id=>typeof id!=='string'))throw new Error('finance_selection_invalid');
    return prepareSettlement(prisma,actor,{supplierId:parseFinanceId(field(form,'supplierId')),accrualIds:ids.map(id=>parseFinanceId(String(id))),requestKey:field(form,'requestKey'),reason:field(form,'reason')});
  });
}
export async function approveFinanceSettlement(form:FormData) {
  return run(form,'approve',actor=>{
    currentMonthOnly(form);
    if(field(form,'confirm')!=='1')throw new Error('finance_confirmation_required');
    return approveSettlement(prisma,actor,parseFinanceId(field(form,'settlementId')),field(form,'reference'));
  });
}
export async function reverseFinanceSettlement(form:FormData) {
  return run(form,'approve',actor=>{currentMonthOnly(form);return reverseSettlement(prisma,actor,parseFinanceId(field(form,'settlementId')),field(form,'reason'));});
}
export async function closeFinanceMonth(form:FormData) {
  return run(form,'close',actor=>closeMonth(prisma,actor,field(form,'month'),form.getAll('checks').map(String),field(form,'reason')));
}
export async function captureFinanceInvoices(form:FormData) {
  return run(form,'edit',actor=>captureInvoices(prisma,actor));
}
