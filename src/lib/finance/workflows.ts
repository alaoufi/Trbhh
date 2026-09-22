import 'server-only';
import type {Prisma} from '@prisma/client';
import type {CommerceDb} from '@/lib/commerce/types';
import {requireFinancePermission,enforceFinanceChecker} from '@/lib/access-control/financial-authorization';
import type {FinanceChangeKind,FinanceChangeRequest,FinanceReturnPayload,FinanceTaxPayload,FinanceReopenPayload,FiscalSnapshot} from './types';
import {calculateFiscalLines,checkedFinanceBigInt,checkedFinanceInteger,sumFinanceMoney} from './calculations';
import {assertFinanceSchemaReady} from './schema';
import {financeJson,financeNumber} from './read-model';
import {auditFinance,financeMonth,fingerprint,parseFinanceId,parseFinanceMonth,requireOpenPeriod} from './service';
import {issueAdjustmentInTransaction,validateAdjustment} from './adjustments';
type Tx=Prisma.TransactionClient;
type Prior={kind:'credit_note'|'debit_note';snapshot:FiscalSnapshot};
export type FinanceChangeInput={kind:FinanceChangeKind;targetId:string;payload:unknown;reason:string;requestKey:string};
const options={maxWait:10000,timeout:30000,isolationLevel:'ReadCommitted' as const};
const grants={return:{request:'returns:create',approve:'returns:approve',cancel:'returns:delete'},tax_settings:{request:'tax:manage_settings',approve:'tax:approve',cancel:'tax:manage_settings'},reopen_period:{request:'periods:reopen_period',approve:'periods:approve',cancel:'periods:reopen_period'}} as const;
const reasonText=(value:string)=>{if(typeof value!=='string'||value.trim().length<3||value.length>1000)throw new Error('finance_reason_required');return value.trim();};
const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('finance_change_invalid');return value as Record<string,unknown>;};

export function validateFinanceChange(input:FinanceChangeInput,now=new Date()){
 if(!Object.hasOwn(grants,input.kind)||!/^[\w.:-]{8,80}$/.test(input.requestKey))throw new Error('finance_change_invalid');
 const reason=reasonText(input.reason),payload=object(input.payload);
 if(input.kind==='return'){
  parseFinanceId(input.targetId);
  if(!Array.isArray(payload.lines)||!payload.lines.length||payload.lines.length>200)throw new Error('finance_return_invalid');
  const lines=payload.lines.map(value=>{const line=object(value);if(typeof line.key!=='string'||!line.key||line.key.length>80||typeof line.quantity!=='number'||!Number.isSafeInteger(line.quantity)||line.quantity<1)throw new Error('finance_return_invalid');return {key:line.key,quantity:line.quantity};});
  if(new Set(lines.map(x=>x.key)).size!==lines.length)throw new Error('finance_return_invalid');
  return {...input,reason,payload:{lines} as FinanceReturnPayload};
 }
 if(input.kind==='reopen_period'){
  parseFinanceMonth(input.targetId);
  if(!Number.isSafeInteger(payload.expectedVersion)||Number(payload.expectedVersion)<0)throw new Error('finance_period_version_invalid');
  return {...input,reason,payload:{expectedVersion:Number(payload.expectedVersion)} as FinanceReopenPayload};
 }
 const issuer=object(payload.issuer),effectiveFrom=String(payload.effectiveFrom||''),rate=payload.vatBps,policy=String(payload.policyReference||'').trim();
 const date=new Date(`${effectiveFrom}T00:00:00+03:00`);
 if(input.targetId!=='tax'||!/^20\d{2}-\d{2}-\d{2}$/.test(effectiveFrom)||!Number.isFinite(date.getTime())||new Date(date.getTime()+10800000).toISOString().slice(0,10)!==effectiveFrom||date<=now||!Number.isSafeInteger(rate)||Number(rate)<0||Number(rate)>10000||!policy||policy.length>160||typeof issuer.name!=='string'||!issuer.name.trim()||issuer.name.length>200||typeof issuer.address!=='string'||!issuer.address.trim()||issuer.address.length>500||typeof issuer.taxNumber!=='string'||!/^3\d{13}3$/.test(issuer.taxNumber))throw new Error('finance_tax_policy_invalid');
 return {...input,reason,payload:{effectiveFrom,issuer:{name:issuer.name.trim(),address:issuer.address.trim(),taxNumber:issuer.taxNumber},vatBps:Number(rate),policyReference:policy} as FinanceTaxPayload};
}

/** Derive a note exclusively from immutable issued lines. Rounding that cannot reconcile requires review. */
export function buildReturnSnapshot(original:FiscalSnapshot,prior:Prior[],payload:FinanceReturnPayload):FiscalSnapshot {
 const clean=validateFinanceChange({kind:'return',targetId:original.sourceOrderId,payload,reason:'return snapshot',requestKey:'return-preview'}).payload as FinanceReturnPayload;
 const lines=clean.lines.map(selection=>{
  const source=original.lines.find(line=>line.key===selection.key);if(!source)throw new Error('finance_return_line_missing');
  const priorValue=(field:'quantity'|'netMinor'|'supplierMinor')=>sumFinanceMoney(prior.flatMap(note=>note.snapshot.lines.filter(line=>line.key===selection.key).map(line=>(note.kind==='credit_note'?1:-1)*(line[field]??0))));
  const already=priorValue('quantity'),left=source.quantity-already;
  if(selection.quantity>left||left<=0)throw new Error('finance_note_exceeds_original');
  const prorate=(amount:number)=>checkedFinanceBigInt((BigInt(amount)*BigInt(selection.quantity)*2n+BigInt(source.quantity))/(2n*BigInt(source.quantity)));
  const net=selection.quantity===left?source.netMinor-priorValue('netMinor'):prorate(source.netMinor);
  const discount=checkedFinanceBigInt(BigInt(selection.quantity)*BigInt(source.unitNetMinor)-BigInt(net));checkedFinanceInteger(discount);
  return {key:source.key,title:source.title,quantity:selection.quantity,unitNetMinor:source.unitNetMinor,discountMinor:discount,vatBps:source.vatBps,...(source.supplierId?{supplierId:source.supplierId,supplierMinor:selection.quantity===left?(source.supplierMinor??0)-priorValue('supplierMinor'):prorate(source.supplierMinor??0)}:{})};
 });
 const calculated=calculateFiscalLines(lines),snapshot={...original,...calculated,paidMinor:calculated.totalMinor};
 // Do not accept a partial return that strands a rounding remainder which a
 // later return cannot represent under the same immutable line calculation.
 for(const line of calculated.lines){
  const source=original.lines.find(value=>value.key===line.key)!;
  const credited=(field:'quantity'|'netMinor'|'vatMinor')=>sumFinanceMoney(prior.flatMap(note=>note.snapshot.lines.filter(value=>value.key===line.key).map(value=>(note.kind==='credit_note'?1:-1)*value[field])));
  const remainingQuantity=source.quantity-credited('quantity')-line.quantity;
  const remainingNet=source.netMinor-credited('netMinor')-line.netMinor;
  const remainingVat=source.vatMinor-credited('vatMinor')-line.vatMinor;
  if(remainingQuantity===0){if(remainingNet!==0||remainingVat!==0)throw new Error('finance_return_rounding_review');}
  else if(remainingQuantity>0){
   const remaining=calculateFiscalLines([{key:source.key,title:source.title,quantity:remainingQuantity,unitNetMinor:source.unitNetMinor,discountMinor:checkedFinanceBigInt(BigInt(remainingQuantity)*BigInt(source.unitNetMinor)-BigInt(remainingNet)),vatBps:source.vatBps}]);
   if(remaining.vatMinor!==remainingVat)throw new Error('finance_return_rounding_review');
  }
 }
 validateAdjustment('credit_note',original,prior,snapshot);return snapshot;
}
type RequestRow={id:bigint;kind:FinanceChangeKind;target_id:string;payload:unknown;status:string;maker_id:bigint;checker_id:bigint|null;fingerprint:string;reason:string;result:unknown};
export async function readFinanceChangeKind(db:Pick<CommerceDb,'$queryRaw'>,id:bigint):Promise<FinanceChangeKind|null>{
 const [row]=await db.$queryRaw<{kind:FinanceChangeKind}[]>`SELECT kind FROM finance_change_requests WHERE id=${id}`;return row&&Object.hasOwn(grants,row.kind)?row.kind:null;
}
async function returnSource(tx:Tx,id:string){
 const [invoice]=await tx.$queryRaw<{id:bigint;kind:string;status:string;snapshot:unknown}[]>`SELECT id,kind,status,snapshot FROM finance_invoices WHERE id=${parseFinanceId(id)} FOR UPDATE`;
 if(!invoice||invoice.kind!=='invoice'||invoice.status!=='issued'||!invoice.snapshot)throw new Error('finance_note_original_missing');
 const notes=await tx.$queryRaw<{kind:Prior['kind'];snapshot:unknown}[]>`SELECT kind,snapshot FROM finance_invoices WHERE parent_id=${invoice.id} AND status='issued'`;
 return {original:financeJson<FiscalSnapshot>(invoice.snapshot),prior:notes.map(note=>({kind:note.kind,snapshot:financeJson<FiscalSnapshot>(note.snapshot)}))};
}
const returnResult=(snapshot:FiscalSnapshot)=>({totalMinor:snapshot.totalMinor,vatMinor:snapshot.vatMinor,supplierMinor:sumFinanceMoney(snapshot.lines.map(line=>line.supplierMinor??0))});
export async function requestFinanceChange(db:CommerceDb,actor:bigint,input:FinanceChangeInput,now=new Date()):Promise<bigint>{
 const value=validateFinanceChange(input,now),hash=fingerprint({...value,actor});await assertFinanceSchemaReady(db);
 return db.$transaction(async tx=>{
  await requireFinancePermission(tx,actor,grants[value.kind].request);
  const [existing]=await tx.$queryRaw<{id:bigint;fingerprint:string}[]>`SELECT id,fingerprint FROM finance_change_requests WHERE request_key=${value.requestKey} FOR UPDATE`;
  if(existing){if(existing.fingerprint!==hash)throw new Error('finance_idempotency_conflict');return existing.id;}
  let result:FinanceChangeRequest['result']=null;
  if(value.kind==='return'){const source=await returnSource(tx,value.targetId);result=returnResult(buildReturnSnapshot(source.original,source.prior,value.payload as FinanceReturnPayload));}
  if(value.kind==='reopen_period'){
   const [period]=await tx.$queryRaw<{closed_at:Date|null;version:number}[]>`SELECT closed_at,version FROM finance_periods WHERE month=${value.targetId} FOR UPDATE`;
   if(!period?.closed_at||financeNumber(period.version)!==(value.payload as FinanceReopenPayload).expectedVersion)throw new Error('finance_period_version_conflict');
  }
  await tx.$executeRaw`INSERT INTO finance_change_requests(request_key,fingerprint,kind,target_id,payload,maker_id,reason,result,created_at) VALUES(${value.requestKey},${hash},${value.kind},${value.targetId},${JSON.stringify(value.payload)},${actor},${value.reason},${result?JSON.stringify(result):null},${now})`;
  const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_change_requests WHERE request_key=${value.requestKey}`;
  await auditFinance(tx,actor,'change_requested','change',String(row.id),value.reason,{before:null,after:{kind:value.kind,targetId:value.targetId,payload:value.payload,status:'pending',makerId:String(actor),result}},now);return row.id;
 },options);
}
export async function approveFinanceChange(db:CommerceDb,actor:bigint,id:bigint,reason:string,now=new Date()):Promise<FinanceChangeRequest['result']>{
 reason=reasonText(reason);await assertFinanceSchemaReady(db);
 return db.$transaction(async tx=>{
  const kind=await readFinanceChangeKind(tx,id);if(!kind)throw new Error('finance_change_missing');
  await requireFinancePermission(tx,actor,grants[kind].approve);
  const [row]=await tx.$queryRaw<RequestRow[]>`SELECT * FROM finance_change_requests WHERE id=${id} FOR UPDATE`;
  if(!row||row.kind!==kind)throw new Error('finance_change_missing');
  if(row.status==='approved')return financeJson<FinanceChangeRequest['result']>(row.result);
  if(row.status!=='pending')throw new Error('finance_change_state');
  const checker=await enforceFinanceChecker(tx,actor,row.maker_id,grants[kind].approve);
  const payload=financeJson<FinanceChangeRequest['payload']>(row.payload);let result:NonNullable<FinanceChangeRequest['result']>={mode:checker.mode};
  if(kind==='return'){
   await requireOpenPeriod(tx,financeMonth(now));
   const source=await returnSource(tx,row.target_id),snapshot=buildReturnSnapshot(source.original,source.prior,payload as FinanceReturnPayload),preview=returnResult(snapshot);
   if(fingerprint(preview)!==fingerprint(financeJson(row.result)))throw new Error('finance_return_changed');
   const number=await issueAdjustmentInTransaction(tx,actor,{originalId:parseFinanceId(row.target_id),kind:'credit_note',requestKey:`return-request:${id}`,reason:(row.reason+' / '+reason).slice(0,1000),snapshot},{enabled:true,approvedPolicyReference:source.original.policyReference},now);
   result={...result,...preview,number};
  }else if(kind==='tax_settings'){
   const validated=validateFinanceChange({kind,targetId:row.target_id,payload,reason:row.reason,requestKey:`tax-approval:${id}`},now).payload as FinanceTaxPayload;
   await tx.$executeRaw`INSERT INTO finance_tax_policies(request_id,effective_from,issuer,vat_bps,policy_reference,created_at) VALUES(${id},${validated.effectiveFrom},${JSON.stringify(validated.issuer)},${validated.vatBps},${validated.policyReference},${now})`;
   const [policy]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_tax_policies WHERE request_id=${id}`;result.policyId=String(policy.id);
  }else{
   const expected=(payload as FinanceReopenPayload).expectedVersion;
   const [period]=await tx.$queryRaw<{version:number;closed_at:Date|null;checks_json:unknown;reason:string}[]>`SELECT version,closed_at,checks_json,reason FROM finance_periods WHERE month=${row.target_id} FOR UPDATE`;
   if(!period?.closed_at||financeNumber(period.version)!==expected)throw new Error('finance_period_version_conflict');
   const changed=await tx.$executeRaw`UPDATE finance_periods SET closed_at=NULL,checks_json='[]',reason=${reason},version=version+1 WHERE month=${row.target_id} AND version=${expected} AND closed_at IS NOT NULL`;
   if(changed!==1)throw new Error('finance_period_version_conflict');result.version=expected+1;
   await auditFinance(tx,actor,'month_reopened','period',row.target_id,reason,{before:period,after:{closedAt:null,version:result.version},requestId:String(id),...checker},now);
  }
  await tx.$executeRaw`UPDATE finance_change_requests SET status='approved',checker_id=${actor},approval_reason=${reason},result=${JSON.stringify(result)},decided_at=${now} WHERE id=${id} AND status='pending'`;
  await auditFinance(tx,actor,'change_approved','change',String(id),reason,{before:{status:'pending',payload},after:{status:'approved',result},...checker},now);return result;
 },options);
}
export async function cancelFinanceChange(db:CommerceDb,actor:bigint,id:bigint,reason:string,now=new Date()){
 reason=reasonText(reason);await assertFinanceSchemaReady(db);
 return db.$transaction(async tx=>{
  const kind=await readFinanceChangeKind(tx,id);if(!kind)throw new Error('finance_change_missing');await requireFinancePermission(tx,actor,grants[kind].cancel);
  const [row]=await tx.$queryRaw<RequestRow[]>`SELECT * FROM finance_change_requests WHERE id=${id} FOR UPDATE`;
  if(!row||row.kind!==kind)throw new Error('finance_change_missing');if(row.status==='cancelled')return;if(row.status!=='pending')throw new Error('finance_change_state');
  await tx.$executeRaw`UPDATE finance_change_requests SET status='cancelled',checker_id=${actor},approval_reason=${reason},decided_at=${now} WHERE id=${id} AND status='pending'`;
  await auditFinance(tx,actor,'change_cancelled','change',String(id),reason,{before:{status:row.status,payload:financeJson(row.payload)},after:{status:'cancelled'}},now);
 },options);
}
