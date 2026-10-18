'use server';
import {saveWalletReviewDecision,type WalletReviewDecision} from '@/lib/finance/wallet-review';
import {saveTaxDraft} from '@/lib/finance/tax-draft';
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
import { saveFinanceTaxPolicyDirect,validateFinanceChange,approveFinanceChange, cancelFinanceChange, readFinanceChangeKind, requestFinanceChange } from '@/lib/finance/workflows';
import { validateFiscalVatControl } from '@/lib/finance/fiscal-v2';
import { DEFAULT_REGISTRATION_THRESHOLD_MINOR } from '@/lib/finance/tax-registration';

async function run(form:FormData,module:AccessModule,permission:AccessAction,work:(actor:bigint)=>Promise<unknown>,successKey:string|((result:unknown)=>string)='saved'):Promise<never> {
  await requireAccess(module,'view');
  const session=await requireAccess(module,permission);
  const auditActor=await accessActor(session);
  const section=form.get('returnTo');
  const params=new URLSearchParams({section:typeof section==='string'&&financeSections.some(s=>s.key===section)?section:'overview'});
  let error:string|null=null;let result:unknown;
  try{
    params.set('month',parseFinanceMonth(field(form,'month')));
    result=await withFinanceAuditContext({ip:auditActor.ip,sessionFingerprint:auditActor.sessionFingerprint},()=>work(BigInt(session.uid)));
  }catch(cause){error=publicFinanceError(cause);}
  if(error)params.set('error',error);
  else{params.set('saved','1');const key=typeof successKey==='function'?successKey(result):successKey;if(key!=='saved')params.set(key,'1');revalidatePath('/admin/finance');}
  if(successKey==='walletReviewSaved'){const page=String(form.get('walletPage')||'1');if(/^\d{1,8}$/.test(page))params.set('walletPage',page);params.set('section','tax');}
  redirect('/admin/finance?'+params.toString()+(successKey==='walletReviewSaved'?'#wallet-review':''));
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
export async function requestFinanceReturnReversal(form:FormData) {
  return run(form,'returns','create',actor=>requestFinanceChange(prisma,actor,{kind:'return',targetId:String(parseFinanceId(field(form,'invoiceId'))),payload:{lines:[],reversalOf:String(parseFinanceId(field(form,'creditNoteId')))},reason:field(form,'reason'),requestKey:field(form,'requestKey')}));
}
function policySelection<T extends string>(form:FormData,name:string,choices:readonly T[]):T {
  const value=field(form,name);
  if(!choices.includes(value as T))throw new Error('finance_calculation_policy_invalid');
  return value as T;
}
export async function saveFinanceTaxDraft(form:FormData){
 return run(form,'tax','manage_settings',actor=>saveTaxDraft(actor,form),'draft');
}
export async function requestFinanceTaxSettings(form:FormData) {
  return run(form,'tax','manage_settings',async actor=>{
    await saveTaxDraft(actor,form);
    return requestFinanceChange(prisma,actor,taxSettingsInput(form));
  },'submitted');
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

function taxSettingsInput(form:FormData){
    const enabled=policySelection(form,'vatEnabled',['off','on'] as const)==='on';
    const vatBps=parseFinanceSar(field(form,'vatPercent')||(enabled?'':'0'));
    if(vatBps>10000)throw new Error('finance_calculation_policy_invalid');
    const optional=(name:string)=>form.has(name)?field(form,name):'';
    const confirmed=optional('registrationConfirmed'),threshold=optional('registrationThreshold');
    if(!['','1'].includes(confirmed))throw new Error('finance_tax_policy_invalid');
    const vatControl=validateFiscalVatControl({enabled,registrationConfirmed:confirmed==='1',registrationEffectiveFrom:optional('registrationEffectiveFrom')||null,registrationThresholdMinor:threshold?parseFinanceSar(threshold):DEFAULT_REGISTRATION_THRESHOLD_MINOR});
    const calculationPolicy={version:2 as const,
      priceBasis:policySelection(form,'priceBasis',['inclusive','exclusive'] as const),
      itemScope:policySelection(form,'itemScope',['uniform_catalog'] as const),
      shippingPriceBasis:policySelection(form,'shippingPriceBasis',['inclusive','exclusive'] as const),shippingVatBps:vatBps,
      discountTreatment:policySelection(form,'discountTreatment',['none','before_tax'] as const),
      rounding:policySelection(form,'rounding',['line_half_up'] as const),
      policyRollover:policySelection(form,'policyRollover',['hold_for_review'] as const),
      automationDelegateId:String(parseFinanceId(field(form,'automationDelegateId'))),
      vatControl,
    };
    return ({kind:'tax_settings' as const,targetId:'tax',payload:{effectiveFrom:field(form,'effectiveFrom'),issuer:{name:field(form,'issuerName'),taxNumber:field(form,'issuerTaxNumber'),address:field(form,'issuerAddress')},vatBps,policyReference:field(form,'policyReference'),calculationPolicy},reason:field(form,'reason'),requestKey:field(form,'requestKey')});
}

export async function saveFinanceTaxSettings(form:FormData){
 return run(form,'tax','manage_settings',async actor=>{
  await saveTaxDraft(actor,form);
  const normalized=new FormData();for(const [key,value] of form.entries())normalized.append(key,value);
  if(!String(normalized.get('reason')||'').trim())normalized.set('reason','حفظ إعدادات الجهة البائعة والفواتير');
  let input:ReturnType<typeof taxSettingsInput>;
  try{input=taxSettingsInput(normalized);validateFinanceChange(input);}catch{return false;}
  await saveFinanceTaxPolicyDirect(prisma,actor,input);
  return true;
 },result=>result===true?'settingsApplied':'settingsStored');
}

export async function saveFinanceWalletReview(form:FormData){
 await requireAccess('wallets','view');
 return run(form,'tax','approve',async actor=>{
  const sourceId=String(parseFinanceId(field(form,'sourceId'))),sourceFingerprint=field(form,'sourceFingerprint'),prior=field(form,'expectedLatestDecisionId');
  if(!/^[a-f0-9]{64}$/.test(sourceFingerprint))throw Error('finance_wallet_review_invalid');
  const expectedLatestDecisionId=prior?String(parseFinanceId(prior)):null;
  const status=policySelection(form,'status',['approved','needs_document'] as const);
  const input:WalletReviewDecision={version:1,sourceId,sourceFingerprint,expectedLatestDecisionId,requestKey:field(form,'requestKey'),status,sourceReference:field(form,'sourceReference'),note:field(form,'note')};
  if(!input.note||input.note.length>1000||!input.requestKey||input.requestKey.length>80)throw Error('finance_wallet_review_invalid');
  if(status==='approved'){
   if(field(form,'confirm')!=='1')throw Error('finance_wallet_review_confirmation');
   input.classification=policySelection(form,'classification',['standard','zero','exempt','out_of_scope','capital_asset'] as const);
   input.netMinor=parseFinanceSar(field(form,'net'));
   input.evidenceKind=policySelection(form,'evidenceKind',['service_invoice','service_contract'] as const);
   input.documentaryReference=field(form,'documentaryReference');input.documentLineIdentity=field(form,'documentLineIdentity');
   if(!input.netMinor||![input.sourceReference,input.documentaryReference,input.documentLineIdentity].every(v=>v.length>0&&v.length<=191))throw Error('finance_wallet_review_invalid');
  }
  try{return await saveWalletReviewDecision(prisma,actor,input);}catch(cause){
   const code=cause instanceof Error?cause.message:'';
   if(/^wallet_review_[a-z_]{1,60}$/.test(code))throw Error('finance_wallet_review_failed');throw cause;
  }
 },'walletReviewSaved');
}
