import 'server-only';
import type {CommerceDb} from '@/lib/commerce/types';
import type {FiscalSnapshot} from './types';
import {calculateFiscalLines,checkedFinanceInteger,sumFinanceMoney} from './calculations';
import {assertFinanceSchemaReady} from './schema';
import {financeJson,financeNumber} from './read-model';
import {accrualRemaining,auditFinance,financeMonth,fingerprint,parseFinanceId,requireOpenPeriod} from './service';
type NoteKind='credit_note'|'debit_note';
type PriorNote={kind:NoteKind;snapshot:FiscalSnapshot};
const options={maxWait:10000,timeout:30000};

/** Debit notes restore prior credits only; new charges require their own verified sale. */
export function validateAdjustment(kind:NoteKind,original:FiscalSnapshot,prior:PriorNote[],proposed:FiscalSnapshot){
  if(!['credit_note','debit_note'].includes(kind)||!proposed.lines.length||new Set(proposed.lines.map(x=>x.key)).size!==proposed.lines.length)throw new Error('finance_note_invalid');
  for(const key of ['issuer','customer','currency','policyReference','sourceOrderId','sourceReceiptId','version'] as const){
    if(fingerprint(original[key])!==fingerprint(proposed[key]))throw new Error('finance_note_identity_invalid');
  }
  const calc=calculateFiscalLines(proposed.lines);
  if(calc.totalMinor<=0||fingerprint(calc.lines)!==fingerprint(proposed.lines)||calc.netMinor!==proposed.netMinor||calc.vatMinor!==proposed.vatMinor||calc.totalMinor!==proposed.totalMinor||proposed.paidMinor!==proposed.totalMinor)throw new Error('finance_note_difference');
  for(const line of proposed.lines){
    const source=original.lines.find(x=>x.key===line.key);
    if(!source||source.vatBps!==line.vatBps||source.unitNetMinor!==line.unitNetMinor||source.title!==line.title||source.supplierId!==line.supplierId||(source.supplierMinor===undefined)!==(line.supplierMinor===undefined))throw new Error('finance_note_line_invalid');
    for(const field of ['quantity','netMinor','vatMinor','grossMinor','supplierMinor'] as const){
      const credited=sumFinanceMoney(prior.map(note=>sumFinanceMoney(note.snapshot.lines.filter(x=>x.key===line.key).map(x=>(note.kind==='credit_note'?1:-1)*(x[field]??0)))));
      const next=credited+(kind==='credit_note'?1:-1)*(line[field]??0);
      if(next<0||next>(source[field]??0))throw new Error('finance_note_exceeds_original');
    }
  }
  const credited=sumFinanceMoney(prior.map(x=>(x.kind==='credit_note'?1:-1)*x.snapshot.totalMinor))+(kind==='credit_note'?1:-1)*proposed.totalMinor;
  if(credited<0||credited>original.paidMinor)throw new Error('finance_note_exceeds_paid');
}

/** Only a trusted fiscal adapter can call this; there is no browser-issued tax snapshot. */
export async function issueAdjustment(db:CommerceDb,actor:bigint,input:{originalId:bigint;kind:NoteKind;requestKey:string;reason:string;snapshot:FiscalSnapshot},gate:{enabled:boolean;approvedPolicyReference:string},now=new Date()){
  if(!gate.enabled||!gate.approvedPolicyReference||input.snapshot.policyReference!==gate.approvedPolicyReference)throw new Error('finance_issuance_not_approved');
  if(!/^[\w.:-]{8,80}$/.test(input.requestKey)||!input.reason.trim()||input.reason.length>1000)throw new Error('finance_note_invalid');
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireOpenPeriod(tx,financeMonth(now));
    const [original]=await tx.$queryRaw<{id:bigint;order_id:bigint;receipt_id:bigint;kind:string;status:string;snapshot:unknown;source_snapshot:unknown}[]>`SELECT * FROM finance_invoices WHERE id=${input.originalId} FOR UPDATE`;
    if(!original||original.kind!=='invoice'||original.status!=='issued'||!original.snapshot)throw new Error('finance_note_original_missing');
    const key='note:'+input.requestKey;
    const notes=await tx.$queryRaw<{id:bigint;source_key:string;number:string;kind:NoteKind;snapshot:unknown;reason:string}[]>`SELECT id,source_key,number,kind,snapshot,reason FROM finance_invoices WHERE parent_id=${original.id} AND status='issued'`;
    const existing=notes.find(x=>x.source_key===key);
    if(existing){
      if(existing.kind!==input.kind||existing.reason!==input.reason.trim()||fingerprint(financeJson(existing.snapshot))!==fingerprint(input.snapshot))throw new Error('finance_idempotency_conflict');
      return existing.number;
    }
    validateAdjustment(input.kind,financeJson<FiscalSnapshot>(original.snapshot),notes.map(x=>({kind:x.kind,snapshot:financeJson<FiscalSnapshot>(x.snapshot)})),input.snapshot);
    if(input.kind==='credit_note'){
      for(const line of [...input.snapshot.lines].sort((a,b)=>(a.supplierId||'').localeCompare(b.supplierId||''))){
        if(!line.supplierId||!line.supplierMinor)continue;
        const supplierId=parseFinanceId(line.supplierId);
        await tx.$queryRaw`SELECT id FROM commerce_suppliers WHERE id=${supplierId} FOR UPDATE`;
        const [accrual]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM commerce_supplier_accruals WHERE order_id=${original.order_id} AND product_id=${parseFinanceId(line.key)} AND supplier_id=${supplierId} FOR UPDATE`;
        if(!accrual||await accrualRemaining(tx,accrual.id,supplierId,now,false)<line.supplierMinor)throw new Error('finance_note_supplier_already_paid');
      }
    }
    const series=(input.kind==='credit_note'?'CRN-':'DBN-')+financeMonth(now).slice(0,4);
    await tx.$executeRaw`INSERT INTO finance_sequences(name,next_value) VALUES(${series},1) ON DUPLICATE KEY UPDATE name=name`;
    const [seq]=await tx.$queryRaw<{next_value:bigint}[]>`SELECT next_value FROM finance_sequences WHERE name=${series} FOR UPDATE`;
    const number=series+'-'+String(seq.next_value).padStart(8,'0');
    await tx.$executeRaw`UPDATE finance_sequences SET next_value=next_value+1 WHERE name=${series}`;
    await tx.$executeRaw`INSERT INTO finance_invoices(order_id,receipt_id,kind,source_key,number,parent_id,status,created_at,issued_at,net_minor,vat_minor,total_minor,snapshot,source_snapshot,reason) VALUES(${original.order_id},${original.receipt_id},${input.kind},${key},${number},${original.id},'issued',${now},${now},${input.snapshot.netMinor},${input.snapshot.vatMinor},${input.snapshot.totalMinor},${JSON.stringify(input.snapshot)},${JSON.stringify(financeJson(original.source_snapshot))},${input.reason.trim()})`;
    await auditFinance(tx,actor,'note_issued','invoice',String(original.id),input.reason.trim(),{number,kind:input.kind,sourceKey:key},now);
    return number;
  },options);
}
export type VerifiedFinanceRefund={verified:boolean;status:string;provider:string;externalId:string;receiptId:string;orderId:string;amountMinor:number;currency:string;refundedAt:string;evidenceRef:string};
export function validateVerifiedRefund(input:VerifiedFinanceRefund,enabled:boolean){
  if(!enabled||input.verified!==true||input.status!=='refunded')throw new Error('finance_refund_unverified');
  parseFinanceId(input.orderId);parseFinanceId(input.receiptId);checkedFinanceInteger(input.amountMinor);
  if(input.amountMinor<=0||input.currency!=='SAR'||!input.provider.trim()||input.provider.length>40||!input.externalId.trim()||input.externalId.length>160||!input.evidenceRef.trim()||input.evidenceRef.length>500||!Number.isFinite(Date.parse(input.refundedAt)))throw new Error('finance_refund_invalid');
}
/** Persist already-confirmed gateway evidence; NEVER initiates a refund or a bank transfer. */
export async function recordVerifiedFinanceRefund(db:CommerceDb,actor:bigint,input:VerifiedFinanceRefund,gate:{enabled:boolean},now=new Date()){
  validateVerifiedRefund(input,gate.enabled);
  const at=new Date(input.refundedAt);
  if(at>now)throw new Error('finance_refund_date_invalid');
  await assertFinanceSchemaReady(db);
  return db.$transaction(async tx=>{
    await requireOpenPeriod(tx,financeMonth(at));
    const [receipt]=await tx.$queryRaw<{id:bigint;order_id:bigint;amount_minor:bigint;provider:string;currency:string;recorded_at:Date}[]>`SELECT * FROM commerce_receipts WHERE id=${parseFinanceId(input.receiptId)} FOR UPDATE`;
    if(!receipt||String(receipt.order_id)!==input.orderId||receipt.provider!==input.provider||receipt.currency!==input.currency||at<receipt.recorded_at)throw new Error('finance_refund_receipt_invalid');
    const prior=await tx.$queryRaw<{id:bigint;receipt_id:bigint;order_id:bigint;amount_minor:bigint;refunded_at:Date;external_id:string;provider:string}[]>`SELECT id,receipt_id,order_id,amount_minor,refunded_at,external_id,provider FROM finance_refunds WHERE receipt_id=${receipt.id} OR (provider=${input.provider} AND external_id=${input.externalId}) FOR UPDATE`;
    const duplicate=prior.find(x=>x.provider===input.provider&&x.external_id===input.externalId);
    if(duplicate){
      if(String(duplicate.receipt_id)!==input.receiptId||String(duplicate.order_id)!==input.orderId||financeNumber(duplicate.amount_minor)!==input.amountMinor||duplicate.refunded_at.getTime()!==at.getTime())throw new Error('finance_idempotency_conflict');
      return duplicate.id;
    }
    if(sumFinanceMoney(prior.map(x=>financeNumber(x.amount_minor)))+input.amountMinor>financeNumber(receipt.amount_minor))throw new Error('finance_refund_exceeds_paid');
    await tx.$executeRaw`INSERT INTO finance_refunds(order_id,receipt_id,provider,external_id,amount_minor,currency,refunded_at,evidence_ref,actor_id) VALUES(${receipt.order_id},${receipt.id},${input.provider},${input.externalId},${input.amountMinor},${input.currency},${at},${input.evidenceRef},${actor})`;
    const [row]=await tx.$queryRaw<{id:bigint}[]>`SELECT id FROM finance_refunds WHERE provider=${input.provider} AND external_id=${input.externalId}`;
    await auditFinance(tx,actor,'refund_recorded','refund',String(row.id),'استرداد مؤكد من مزود الدفع',{receiptId:input.receiptId,amountMinor:input.amountMinor,externalId:input.externalId},now);
    return row.id;
  },options);
}
