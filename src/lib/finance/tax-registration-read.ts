import 'server-only';
import {readAccess} from '@/lib/access-control/store';
import type {CommerceDb} from '@/lib/commerce/types';
import type {FinanceData,FinanceInvoice,FinanceTaxPolicy,FiscalSnapshotV2} from './types';
import {readFinanceData,financeNumber} from './read-model';
import {calculateFiscalLinesV2,validateCalculationPolicy,validateFiscalTaxPolicy,effectiveFiscalVatBps} from './fiscal-v2';
import {validateAdjustment} from './adjustments';
import {fingerprint} from './service';
import {sumFinanceMoney,checkedFinanceInteger} from './calculations';
import {calculateTaxRegistration,registrationThreshold,taxRegistrationWindow,DEFAULT_REGISTRATION_THRESHOLD_MINOR,type TaxRegistrationReport,type TaxRegistrationGap,type TaxSupplyEvent} from './tax-registration';
export type WalletTaxReview={reason:string;count:number;debitsMinor:number;creditsMinor:number};
const walletLabels:Record<string,string>={featured:'تمييز الإعلانات',classified:'الإعلانات المبوبة',duplicate:'باقات التكرار',subscription:'اشتراكات المتاجر',verify_fee:'رسوم التوثيق',store_show:'عرض المتاجر',ad_show:'عرض الإعلانات',urgent:'شارة عاجل',bump:'رفع الإعلانات',store_plus:'باقة المتجر',lead:'توصيل العملاء',auction:'رسوم المزاد',member_service:'الخدمات الخاصة',refund:'استردادات المحفظة',admin_debit:'الخصومات الإدارية غير المصنفة'};
const deposits=new Set(['topup','admin_credit','bonus','verify_gift','points_convert','referral','welcome']);
const explicitTest=(provider:string,reference:string)=>/(?:^|[-_:])(test|sandbox|fixture|mock)(?:$|[-_:])/i.test(provider)||/^(?:test|sandbox|fixture|mock)[-_:]/i.test(reference);
const time=(value:string|null|undefined)=>value?Date.parse(value):NaN;
function policyFields(policy:FinanceTaxPolicy){return {effectiveFrom:policy.effectiveFrom,issuer:policy.issuer,vatBps:policy.vatBps,policyReference:policy.policyReference,calculationPolicy:policy.calculationPolicy};}
function approvedPolicy(data:FinanceData,policy:FinanceTaxPolicy,at:string):boolean {
 if(!Number.isFinite(time(at)))return false;
 const request=data.requests?.find(row=>row.id===policy.requestId),date=new Date(time(at)+10800000).toISOString().slice(0,10);
 return !!request&&!!request.payload&&typeof request.payload==='object'&&!Array.isArray(request.payload)&&request.kind==='tax_settings'&&request.targetId==='tax'&&request.status==='approved'&&!!request.checkerId&&request.checkerId!==request.makerId&&!!request.decidedAt&&time(request.decidedAt)<=time(at)&&time(policy.at)<=time(at)&&policy.effectiveFrom<=date&&fingerprint(policyFields(policy))===fingerprint(policyFields(request.payload as FinanceTaxPolicy));
}
/** The existing approved commerce contract is a sale by the platform; raw GMV is never a fallback. */
function confirmedInvoice(data:FinanceData,invoice:FinanceInvoice,now:Date):FiscalSnapshotV2 {
 const s=invoice.snapshot,receipt=data.receipts.find(row=>row.id===invoice.receiptId),order=data.orders.find(row=>row.id===invoice.orderId);
 if(![invoice.issuedAt,invoice.at,receipt?.at,order?.createdAt,order?.paidAt].every(value=>Number.isFinite(time(value))))throw Error('unverified');
 if(invoice.status!=='issued'||!invoice.number||!invoice.issuedAt||time(invoice.issuedAt)>now.getTime()||!s||s.version!==2||s.derivation!=='sale'||s.currency!=='SAR'||!receipt||!order||order.currency!=='SAR'||receipt.currency!=='SAR'||order.status!=='paid'||!order.paidAt||time(receipt.at)>now.getTime()||time(invoice.issuedAt)<time(receipt.at)||time(invoice.at)!==time(receipt.at)||receipt.orderId!==invoice.orderId||s.sourceOrderId!==invoice.orderId||s.sourceReceiptId!==invoice.receiptId||fingerprint(invoice.source)!==fingerprint(order))throw Error('unverified');
 if(s.totalMinor!==receipt.amountMinor||s.totalMinor!==order.totalMinor||s.totalMinor!==invoice.totalMinor||s.paidMinor!==s.totalMinor||s.netMinor!==invoice.netMinor||s.vatMinor!==invoice.vatMinor)throw Error('unverified');
 const totals=calculateFiscalLinesV2(s.lines);
 if(fingerprint(totals)!==fingerprint({lines:s.lines,netMinor:s.netMinor,vatMinor:s.vatMinor,totalMinor:s.totalMinor}))throw Error('unverified');
 const saved=data.orderFiscalSnapshots?.find(row=>row.orderId===order.id),policy=data.taxPolicies?.find(row=>row.id===s.policyId);
 if(!saved||!policy||saved.currency!=='SAR'||saved.capturedAt!==order.createdAt||fingerprint(saved)!==s.orderSnapshotFingerprint||fingerprint(saved.lines)!==fingerprint(s.lines)||fingerprint(saved.customer)!==fingerprint(s.customer)||fingerprint(saved.policy)!==fingerprint(policy)||policy.requestId!==s.policyRequestId||policy.calculationPolicy?.version!==2||policy.calculationPolicy.itemScope!=='uniform_catalog'||fingerprint(policy.issuer)!==fingerprint(s.issuer)||policy.policyReference!==s.policyReference||!approvedPolicy(data,policy,receipt.at)||!approvedPolicy(data,policy,saved.capturedAt))throw Error('unverified');
 const calculation=validateCalculationPolicy(policy.calculationPolicy);validateFiscalTaxPolicy(policy,true);
 if(saved.version!==2||saved.netMinor!==s.netMinor||saved.vatMinor!==s.vatMinor||saved.totalMinor!==s.totalMinor||saved.customer.name!==order.customerName||time(order.createdAt)>time(receipt.at)||time(order.paidAt)>now.getTime())throw Error('unverified');
 if(s.lines.some(line=>line.priceBasis!==(line.component==='shipping'?calculation.shippingPriceBasis:calculation.priceBasis)||line.vatBps!==effectiveFiscalVatBps(policy,line.component)||(calculation.discountTreatment==='none'&&line.discountMinor!==0)))throw Error('unverified');
 const products=s.lines.filter(line=>line.component==='product'),shipping=s.lines.filter(line=>line.component==='shipping');
 if(products.length!==order.items.length||shipping.length!==1||shipping[0].grossMinor!==order.shippingMinor||order.items.some(item=>!products.some(line=>line.key===item.productId&&line.title===item.title&&line.quantity===item.quantity&&line.unitPriceMinor===item.unitMinor&&line.grossMinor===item.totalMinor)))throw Error('unverified');
 if(sumFinanceMoney(order.items.map(item=>item.totalMinor))!==order.subtotalMinor||sumFinanceMoney([order.subtotalMinor,order.shippingMinor])!==order.totalMinor)throw Error('unverified');
 for(const line of products){const supplier=order.suppliers.find(row=>row.productId===line.key);if(supplier?line.supplierId!==supplier.supplierId||line.supplierMinor!==supplier.amountMinor:line.supplierId!==undefined||line.supplierMinor!==undefined)throw Error('unverified');}
 return s;
}
/** Returns only monetary aggregates and fixed review labels; customer/provider references never leave this adapter. */
export function buildTaxRegistrationReport(data:FinanceData,wallet:WalletTaxReview[],now:Date):TaxRegistrationReport {
 const window=taxRegistrationWindow(now),start=Math.min(time(window.start),time(window.completedStart)),end=now.getTime(),events:TaxSupplyEvent[]=[],gaps=new Map<string,TaxRegistrationGap>();
 const relevant=(at:string|null|undefined)=>Number.isFinite(time(at))&&time(at)>=start&&time(at)<=end;
 function gap(code:string,label:string,amountMinor:number|null,count=1){
  const previous=gaps.get(code);gaps.set(code,{code,label,count:(previous?.count||0)+count,amountMinor:amountMinor===null||previous?.amountMinor===null?null:sumFinanceMoney([previous?.amountMinor||0,amountMinor])});
 }
 if(!data.ready)gap('finance_unavailable','مصادر الفواتير المالية غير جاهزة؛ لا يمكن تأكيد اكتمال الإجمالي.',null);
 let thresholdMinor=DEFAULT_REGISTRATION_THRESHOLD_MINOR;
 const currentDate=new Date(now.getTime()+10800000).toISOString().slice(0,10);
 const latest=[...(data.taxPolicies||[])].filter(p=>p.effectiveFrom<=currentDate&&time(p.at)<=end).sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.id.localeCompare(a.id,undefined,{numeric:true}))[0];
 if(latest){
  if(approvedPolicy(data,latest,now.toISOString())){
   try{thresholdMinor=registrationThreshold(latest.calculationPolicy?.vatControl?.registrationThresholdMinor);}catch{gap('threshold_unverified','تعذر التحقق من حد التسجيل المعتمد؛ عُرض الحد الافتراضي للمراجعة.',null);}
  }else gap('threshold_unverified','إعداد حد التسجيل غير مرتبط باعتماد صالح؛ عُرض الحد الافتراضي للمراجعة.',null);
 }
 const invoices=new Map<string,FinanceInvoice>(),conflicts=new Set<string>();
 for(const invoice of data.invoices){const prior=invoices.get(invoice.id);if(prior&&fingerprint(prior)!==fingerprint(invoice))conflicts.add(invoice.id);else invoices.set(invoice.id,invoice);}
 const originals=[...invoices.values()].filter(row=>row.kind==='invoice'),seenOrders=new Set<string>(),testOrders=new Set<string>();let excludedTestCount=0;
 const confirmed=new Map<string,{invoice:FinanceInvoice;snapshot:FiscalSnapshotV2}>();
 for(const invoice of originals){
  seenOrders.add(invoice.orderId);const receipt=data.receipts.find(row=>row.id===invoice.receiptId);
  if(receipt&&explicitTest(receipt.provider,receipt.reference)){testOrders.add(invoice.orderId);if(relevant(receipt.at))excludedTestCount++;continue;}
  try{
   if(conflicts.has(invoice.id)||originals.filter(row=>row.orderId===invoice.orderId).length!==1)throw Error('unverified');
   const snapshot=confirmedInvoice(data,invoice,now);confirmed.set(invoice.id,{invoice,snapshot});
   events.push({sourceKey:'order:'+invoice.orderId,origin:'invoice',kind:'supply',classification:'standard',netMinor:snapshot.netMinor,at:receipt!.at});
  }catch{
   if(relevant(receipt?.at||invoice.at)||[...invoices.values()].some(note=>note.parentId===invoice.id&&relevant(note.at)))gap('invoice_unverified','فواتير أو لقطات تاريخية تحتاج مراجعة هوية المصدر والسياسة والمقبوض (المبلغ الإجمالي للمستندات).',Number.isSafeInteger(invoice.totalMinor)?invoice.totalMinor:null);
  }
 }
 for(const {invoice,snapshot} of confirmed.values()){
  const notes=[...invoices.values()].filter(note=>note.parentId===invoice.id&&note.kind!=='invoice'&&note.status==='issued'&&time(note.at)<=end).sort((a,b)=>time(a.at)-time(b.at)||a.id.localeCompare(b.id,undefined,{numeric:true}));
  const prior:{id:string;kind:'credit_note'|'debit_note';snapshot:FiscalSnapshotV2}[]=[];
  for(const note of notes){
   try{
    if(conflicts.has(note.id)||!note.number||!note.snapshot||note.snapshot.version!==2||note.orderId!==invoice.orderId||note.receiptId!==invoice.receiptId||!Number.isFinite(time(note.issuedAt))||time(note.issuedAt)>end||time(note.issuedAt)<time(note.at)||time(note.at)<time(invoice.at)||fingerprint(note.source)!==fingerprint(invoice.source)||note.totalMinor!==note.snapshot.totalMinor||note.netMinor!==note.snapshot.netMinor||note.vatMinor!==note.snapshot.vatMinor)throw Error('unverified');
    const kind=note.kind as 'credit_note'|'debit_note';validateAdjustment(kind,snapshot,prior,note.snapshot);
    events.push({sourceKey:'invoice:'+note.id,origin:'invoice',kind:kind==='credit_note'?'credit':'reversal',classification:'standard',netMinor:note.snapshot.netMinor,at:note.at,originalSourceKey:'order:'+invoice.orderId,...(kind==='debit_note'?{reversesSourceKey:'invoice:'+note.snapshot.reversalOf}:{})});
    prior.push({id:note.id,kind,snapshot:note.snapshot});
   }catch{if(relevant(note.at))gap('adjustment_unverified','إشعارات دائنة أو عكسها تحتاج مراجعة الربط والمبالغ قبل تعديل التوريدات.',Number.isSafeInteger(note.totalMinor)?note.totalMinor:null);}
  }
  const refunds=data.refunds.filter(row=>row.receiptId===invoice.receiptId&&row.orderId===invoice.orderId&&time(row.at)<=end),refunded=sumFinanceMoney(refunds.map(row=>row.amountMinor));
  const credited=sumFinanceMoney(prior.map(note=>note.snapshot.totalMinor*(note.kind==='credit_note'?1:-1)));
  if(refunded>credited&&refunds.some(row=>relevant(row.at)))gap('refund_unmatched','مبالغ مستردة تحتاج إشعارًا دائنًا مطابقًا؛ لم تخصم مرة أخرى من الفاتورة.',refunded-credited,refunds.filter(row=>relevant(row.at)).length);
 }
 for(const note of invoices.values())if(note.kind!=='invoice'&&note.status==='issued'&&relevant(note.at)&&!confirmed.has(note.parentId||'')&&!testOrders.has(note.orderId))gap('adjustment_parent_missing','إشعارات بلا فاتورة أصلية مؤكدة تحتاج مراجعة.',Number.isSafeInteger(note.totalMinor)?note.totalMinor:null);
 for(const order of data.orders){
  if(seenOrders.has(order.id)||order.status!=='paid')continue;
  const receipts=data.receipts.filter(row=>row.orderId===order.id&&relevant(row.at));
  if(receipts.length&&receipts.every(row=>explicitTest(row.provider,row.reference))){excludedTestCount++;continue;}
  if(receipts.length||relevant(order.paidAt))gap('paid_unissued','طلبات مدفوعة لم تؤكد فاتورتها بعد؛ لا يشملها الإجمالي المؤكد (المبلغ المقبوض).',order.totalMinor);
 }
 for(const row of wallet){
  if(deposits.has(row.reason))continue;checkedFinanceInteger(row.count);checkedFinanceInteger(row.debitsMinor);checkedFinanceInteger(row.creditsMinor);
  if(row.count&&(row.debitsMinor||row.creditsMinor))gap('wallet_'+(walletLabels[row.reason]?row.reason:'unclassified'),'بحاجة لتصنيف ضريبي وربط الاستردادات: '+(walletLabels[row.reason]||'حركات خدمات أخرى'),sumFinanceMoney([row.debitsMinor,-row.creditsMinor]),row.count);
 }
 const result=calculateTaxRegistration({now,events,thresholdMinor,gaps:[...gaps.values()]});
 return {...result,excludedTestCount:result.excludedTestCount+excludedTestCount};
}
/** No schema ensure, capture, issuance, wallet mutation or audit write occurs on this read path. */
export async function readTaxRegistrationMonitor(db:CommerceDb,actorId:bigint,now=new Date()):Promise<TaxRegistrationReport>{
 if(actorId<=0n||actorId>BigInt(Number.MAX_SAFE_INTEGER))throw Error('access_forbidden');
 const window=taxRegistrationWindow(now),from=new Date(Math.min(time(window.start),time(window.completedStart)));
 return db.$transaction(async tx=>{
  const access=await readAccess(tx,Number(actorId));if(!access.ready||!access.keys.has('tax:view'))throw Error('access_forbidden');
  const [data,rows]=await Promise.all([readFinanceData(tx),tx.$queryRaw<{reason:string;count:bigint;debits_minor:bigint;credits_minor:bigint}[]>`
   SELECT reason,COUNT(*) AS count,
    SUM(CASE WHEN COALESCE(amount_halala,amount*100)<0 THEN -COALESCE(amount_halala,amount*100) ELSE 0 END) AS debits_minor,
    SUM(CASE WHEN COALESCE(amount_halala,amount*100)>0 THEN COALESCE(amount_halala,amount*100) ELSE 0 END) AS credits_minor
   FROM wallet_txns WHERE created_at>=${from} AND created_at<=${now}
    AND (COALESCE(amount_halala,amount*100)<0 OR reason='refund')
    AND reason NOT IN ('topup','admin_credit','bonus','verify_gift','points_convert','referral','welcome') GROUP BY reason`]);
  return buildTaxRegistrationReport(data,rows.map(row=>({reason:row.reason,count:financeNumber(row.count),debitsMinor:financeNumber(String(row.debits_minor)),creditsMinor:financeNumber(String(row.credits_minor))})),now);
 },{isolationLevel:'RepeatableRead',maxWait:10000,timeout:30000});
}
