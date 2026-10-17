/** Durable single-attempt supplier workflow. Provider responses alone never prove debit. */
import {isCjCardPaymentConfirmed,cjUtcTimestamp} from './provider';
export type Commitment = {supplierReference:string;supplierUsdMinor:number;supplierFreightUsdMinor?:number;supplierTaxUsdMinor?:number;lines:{storefrontProductId?:string;sku?:string;pid:string;vid:string;quantity:number;supplierUnitUsdMinor?:number}[];destination:Record<string,string>;originAreaId:string;originCountry:string;logisticName:string};
export type OrderProof = Omit<Commitment,'supplierReference'|'supplierUsdMinor'> & {orderId:string;reference:string;payableUsdMinor:number|null;paymentDate:string|null;cjOrderCode:string|null;billingOrderId?:string|null;physicalStorageId?:string|null;orderStatus?:string;currency?:string};
export type CreateAcknowledgement={requestHash:string;requestPayload:Record<string,unknown>;orderId:string;reference:string;response:Record<string,unknown>};
export type BillingProof = {id:string;cjOrderCode:string|null;amountUsdMinor:number|null;status:string;type:string};
export type PaymentProof = {shipmentOrderId:string;payId:string;expiresAt:number;payableUsdMinor:number|null;paymentUrl?:string;method?:'card'|'wallet';batchId?:string;batchPayableUsdMinor?:number};
export type FulfillmentOptions={paymentMode?:'card'|'wallet';deferPayment?:boolean;reconcileOnly?:boolean;walletAuthorization?:{payId:string;shipmentOrderId:string;expectedUsdMinor:number}};
export type FulfillmentRecord = {id:string;version:number;status:'pending'|'creating'|'create_uncertain'|'created'|'parent_claimed'|'parent_uncertain'|'payment_ready'|'debit_claimed'|'debit_uncertain'|'supplier_paid'|'blocked';customerPaidVerified:boolean;actionRequired?:boolean;commitment:Commitment;cjOrderId?:string;createAcknowledgement?:CreateAcknowledgement;payment?:PaymentProof;lastError?:string;evidence?:unknown};
export type FulfillmentStore = {read(id:string):Promise<FulfillmentRecord|null>;cas(id:string,version:number,patch:Partial<FulfillmentRecord>):Promise<boolean>};
export type FulfillmentProvider = {createUnpaid(c:Commitment):Promise<string|{orderId:string;acknowledgement:CreateAcknowledgement}>;findByReference(reference:string):Promise<string[]>;detail(id:string):Promise<OrderProof>;preparePayment(id:string):Promise<PaymentProof>;balance():Promise<number>;debit(p:PaymentProof):Promise<void>;billing(orderCode:string):Promise<BillingProof[]>};
function sameLines(a:Commitment['lines'],b:Commitment['lines']) {return JSON.stringify(a.map(x=>`${x.pid}:${x.vid}:${x.quantity}`).sort())===JSON.stringify(b.map(x=>`${x.pid}:${x.vid}:${x.quantity}`).sort());}
export function matchesCommitment(c:Commitment,p:OrderProof) {
 return p.reference===c.supplierReference && p.originAreaId===c.originAreaId && p.originCountry===c.originCountry && p.logisticName===c.logisticName && sameLines(c.lines,p.lines) && Object.entries(c.destination).every(([k,v])=>p.destination[k]===v);
}
export async function runFulfillment(id:string,store:FulfillmentStore,provider:FulfillmentProvider,options:FulfillmentOptions={}):Promise<void> {
 let row=await store.read(id);if(!row||!row.customerPaidVerified||row.status==='supplier_paid'||row.status==='blocked'&&row.lastError!=='payment_expired_or_missing'&&!options.reconcileOnly)return;
 if(row.actionRequired&&!options.reconcileOnly)return;
 if(options.reconcileOnly&&!row.cjOrderId)return;
 const patch=async(values:Partial<FulfillmentRecord>)=>{const ok=await store.cas(id,row!.version,values);if(ok)row={...row!,...values,version:row!.version+1};return ok;};
 const block=async(reason:string)=>{await patch({status:'blocked',lastError:reason});};
 if(row.status==='parent_claimed'&&!options.reconcileOnly){await patch({status:'parent_uncertain',lastError:'parent_outcome_unknown'});return;}
 const c=row.commitment;
 if(!Number.isSafeInteger(c.supplierUsdMinor)||c.supplierUsdMinor<=0||!c.supplierReference||!c.originAreaId||!c.lines.length||c.lines.some(x=>!x.pid||!x.vid||!Number.isSafeInteger(x.quantity)||x.quantity<1))return block('invalid_commitment');
 if(row.status==='pending'&&!options.reconcileOnly){
  if(!await patch({status:'creating'}))return;
  try {const created=await provider.createUnpaid(c);const cjOrderId=typeof created==='string'?created:created.orderId;if(!cjOrderId)throw Error('missing_order_id');if(!await patch({status:'created',cjOrderId,...(typeof created==='object'?{createAcknowledgement:created.acknowledgement}:{})}))return;}
  catch {await patch({status:'create_uncertain',lastError:'create_outcome_unknown'});return;}
 }
 if(['creating','create_uncertain'].includes(row.status)){
  const ids=await provider.findByReference(c.supplierReference);
  if(ids.length!==1){if(ids.length>1)await block('ambiguous_reference');return;}
  if(!await patch({status:'created',cjOrderId:ids[0]}))return;
 }
 if(!row.cjOrderId)return;
 const order=await provider.detail(row.cjOrderId);
 if(order.orderId!==row.cjOrderId||!matchesCommitment(c,order))return block('order_commitment_mismatch');
 if(['debit_claimed','debit_uncertain'].includes(row.status)){
  // Cart/parent uses SD cjOrderCode; wallet billing identifies the separate CJ cjOrderId.
  const billingId=order.billingOrderId===undefined?order.cjOrderCode:order.billingOrderId;
  const bills=billingId?await provider.billing(billingId):[];
  const matching=bills.filter(b=>b.id&&b.cjOrderCode===billingId&&b.type==='Order Payment'&&b.status==='1'&&b.amountUsdMinor===c.supplierUsdMinor);
  const paymentTime=cjUtcTimestamp(order.paymentDate);
  if(Number.isFinite(paymentTime)&&paymentTime<=Date.now()&&order.payableUsdMinor===c.supplierUsdMinor&&matching.length===1)await patch({status:'supplier_paid',evidence:{order,bill:matching[0]},lastError:undefined});
  else await patch({status:'debit_uncertain',lastError:'payment_proof_incomplete'});
  return;
 }
 // External card receipts are proved by authenticated CJ order reads, not by
 // wallet history or an administrator's browser return. Identity is checked above.
 if(order.payableUsdMinor===c.supplierUsdMinor&&isCjCardPaymentConfirmed({paymentDate:order.paymentDate,orderStatus:order.orderStatus,currency:order.currency})){
  await patch({status:'supplier_paid',evidence:{method:'card',order,payment:row.payment},lastError:undefined});return;
 }
 if(order.paymentDate||order.orderStatus&& !['CREATED','IN_CART','UNPAID'].includes(order.orderStatus))return block('supplier_payment_or_status_requires_review');
 if(options.reconcileOnly)return;
 // An interrupted parent/cart request is never repeated automatically.
 if(['parent_claimed','parent_uncertain'].includes(row.status))return;
 if(row.status==='created'){
  if(options.deferPayment)return;
  if(order.paymentDate)return block('unexpected_existing_payment');
  if(!await patch({status:'parent_claimed'}))return;
  try {const payment=await provider.preparePayment(row.cjOrderId);if(!await patch({status:'payment_ready',payment}))return;}
  catch {await patch({status:'parent_uncertain',lastError:'parent_outcome_unknown'});return;}
 }
 const p=row.payment;
 if(!p||!p.payId||!p.shipmentOrderId||!Number.isFinite(p.expiresAt)||p.expiresAt<=Date.now())return block('payment_expired_or_missing');
 if(p.payableUsdMinor!==c.supplierUsdMinor||order.payableUsdMinor!==c.supplierUsdMinor)return block('payable_mismatch');
 // The scheduled dispatcher never authorizes a wallet charge. A staff action
 // must bind explicit approval to this exact payment identity and USD amount.
 const grant=options.walletAuthorization;
 // A shared card parent must never be charged once per member through a wallet.
 if(p.batchId)return;
 if(options.paymentMode!=='wallet'||!grant||grant.payId!==p.payId||grant.shipmentOrderId!==p.shipmentOrderId||grant.expectedUsdMinor!==c.supplierUsdMinor){
  if(row.lastError)await patch({lastError:undefined});return;
 }
 const balance=await provider.balance();if(!Number.isSafeInteger(balance))return block('balance_proof_invalid');
 if(balance<c.supplierUsdMinor){await patch({status:'payment_ready',lastError:'insufficient_balance'});return;}
 if(!await patch({status:'debit_claimed',payment:{...p,method:'wallet'}}))return;
 try {await provider.debit(p);}catch {/* Unknown result must be reconciled by reads. */}
 await patch({status:'debit_uncertain',lastError:'awaiting_payment_proof'});
}
