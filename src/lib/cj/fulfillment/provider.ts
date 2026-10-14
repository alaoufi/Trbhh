import 'server-only';
import {createHash} from 'node:crypto';
import {cjFulfillmentTransport,getCjBalance,getCjBillingHistory,getVariants,getCjWarehouseDetail} from '../client';
import type {Commitment,FulfillmentProvider,OrderProof} from './worker';
function str(v:unknown){return typeof v==='string'?v:'';}
/** CJ documents these timestamps as UTC. Reject rollover dates rather than guessing. */
export function cjUtcTimestamp(value:unknown):number {
 const raw=str(value);const normalized=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)?raw.replace(' ','T')+'Z':raw;
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(normalized))return NaN;
 const parsed=Date.parse(normalized);return Number.isFinite(parsed)&&new Date(parsed).toISOString().slice(0,19)===normalized.slice(0,19)?parsed:NaN;
}
export function parseCjParentPayment(parent:Record<string,unknown>,shipmentOrderId:string,code:string,now=Date.now()) {
 if(parent.submitSuccess!==true||!Array.isArray(parent.successOrders)||parent.successOrders.length!==1||parent.successOrders[0]!==code||['unMatchOrderCodes','unMatchProductCodes','interceptOrders'].some(k=>parent[k]!==undefined&&(!Array.isArray(parent[k])||(parent[k] as unknown[]).length)))throw Error('parent_membership_invalid');
 const payId=str(parent.payId);if(!/^[A-Za-z0-9_-]{1,200}$/.test(payId)||!/^[A-Za-z0-9_-]{1,200}$/.test(shipmentOrderId))throw Error('payment_identity_invalid');
 const expiresAt=cjUtcTimestamp(parent.payExpireTime);if(!Number.isFinite(expiresAt)||expiresAt<=now)throw Error('payment_expiry_invalid');
 const payment=parent.paymentInformation as Record<string,unknown>|undefined;
 const top=parent.orderMoney==null?null:exactUsdMinor(parent.orderMoney),nested=payment?.payableAmount==null?null:exactUsdMinor(payment.payableAmount);
 if((parent.orderMoney!=null&&top===null)||(payment?.payableAmount!=null&&nested===null)||(top===null&&nested===null))throw Error('payment_amount_invalid');
 if(top!==null&&nested!==null&&top!==nested)throw Error('payment_amount_conflict');
 return {shipmentOrderId,payId,expiresAt,payableUsdMinor:top??nested,paymentUrl:`https://www.cjdropshipping.com/mine/payment?pid=${encodeURIComponent(payId)}`};
}
/** Card receipt is independently queried from CJ, never inferred from return-to-site or wallet history. */
export function isCjCardPaymentConfirmed(detail:Record<string,unknown>,now=Date.now()):boolean {
 const paid=cjUtcTimestamp(detail.paymentDate);
 return detail.currency==='USD'&&Number.isFinite(paid)&&paid<=now&&['UNSHIPPED','PENDING','PROCESSING','SHIPPED','DELIVERED'].includes(str(detail.orderStatus));
}
export function exactUsdMinor(v:unknown):number|null {if(typeof v!=='number'&&!(typeof v==='string'&&/^\d+(?:\.\d{1,2})?$/.test(v)))return null;const n=Number(v);return Number.isFinite(n)&&n>=0&&Math.abs(n*100-Math.round(n*100))<0.000001&&Number.isSafeInteger(Math.round(n*100))?Math.round(n*100):null;}
async function request(path:string,body:unknown){const r=await cjFulfillmentTransport(path,body);if(!r.ok)throw Error(r.error);return r.data;}
export function shippingPayload(c:Commitment):Record<string,string> {
 const d=c.destination;
 return {shippingCountryCode:d.country,shippingCountry:d.countryName||'Saudi Arabia',shippingProvince:d.region,shippingCity:d.city,shippingPhone:d.phone,shippingCustomerName:d.name,shippingAddress:d.address1,shippingAddress2:d.address2||'',shippingZip:d.postalCode};
}
export function makeFulfillmentProvider(c:Commitment):FulfillmentProvider {
 return {
  async createUnpaid(){const payload={...shippingPayload(c),orderNumber:c.supplierReference,payType:3,orderFlow:1,shopLogisticsType:2,fromCountryCode:c.originCountry,logisticName:c.logisticName,products:c.lines.map(x=>({vid:x.vid,quantity:x.quantity}))};const d=await request('/shopping/order/createOrderV3',payload);const id=str(d.orderId);if(!id||str(d.orderNumber)!==c.supplierReference)throw Error('create_identity_missing');return {orderId:id,acknowledgement:{requestHash:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),requestPayload:payload,orderId:id,reference:c.supplierReference,response:d}};},
  async findByReference(reference){try{const d=await request('/shopping/order/getOrderDetail',{orderId:reference});return str(d.orderNum)===reference&&str(d.orderId)?[str(d.orderId)]:[];}catch{return []; }},
  async detail(id){const d=await request('/shopping/order/getOrderDetail',{orderId:id});const rows=Array.isArray(d.productList)?d.productList as Record<string,unknown>[]:[];
   // Query product variants to establish PID ownership instead of inventing PID from the quote.
   const ownership=new Map<string,string>();for(const pid of new Set(c.lines.map(x=>x.pid))){const variants=await getVariants(pid);if(!variants.ok)throw Error('variant_ownership_unavailable');for(const v of variants.data)ownership.set(v.vid,pid);}
   const address=str(d.shippingAddress),postalMatch=address.match(/، الرمز البريدي (\d{5})$/),extraMatch=address.match(/، العنوان الإضافي: (.*)، الرمز البريدي \d{5}$/);
   // Extract only text CJ actually echoed. No quote fallback for unreturned ZIP/address2.
   const destination={country:str(d.shippingCountryCode),region:str(d.shippingProvince),city:str(d.shippingCity),phone:str(d.shippingPhone),name:str(d.shippingCustomerName),address1:address,address2:str(d.shippingAddress2)||extraMatch?.[1]||'',postalCode:str(d.shippingZip)||postalMatch?.[1]||''};
   const physicalStorageId=str(d.storageId);let originAreaId='';
   if(physicalStorageId){const warehouse=await getCjWarehouseDetail(physicalStorageId);if(!warehouse.ok||str(warehouse.data.id)!==physicalStorageId||str(warehouse.data.areaCountryCode)!==str(d.fromCountryCode))throw Error('warehouse_identity_unverified');originAreaId=String(warehouse.data.areaId??'');}
   const proof:OrderProof & {orderStatus:string;currency:string}={orderStatus:str(d.orderStatus),currency:str(d.currency),orderId:str(d.orderId),reference:str(d.orderNum),cjOrderCode:str(d.cjOrderCode)||null,billingOrderId:str(d.cjOrderId)||null,payableUsdMinor:exactUsdMinor(d.orderAmount),paymentDate:str(d.paymentDate)||null,originAreaId,physicalStorageId:physicalStorageId||null,originCountry:str(d.fromCountryCode),logisticName:str(d.logisticName),destination,lines:rows.map(x=>({pid:ownership.get(str(x.vid))||'',vid:str(x.vid),quantity:Number(x.quantity)}))};return proof;
  },
  async preparePayment(id){const detail=await request('/shopping/order/getOrderDetail',{orderId:id});const code=str(detail.cjOrderCode);if(!code)throw Error('cj_order_code_missing');const cart=await request('/shopping/order/addCart',{cjOrderIdList:[code]});if(cart.successCount!==1||!Array.isArray(cart.addSuccessOrders)||cart.addSuccessOrders.length!==1||cart.addSuccessOrders[0]!==code||(Array.isArray(cart.interceptOrders)&&cart.interceptOrders.length))throw Error('cart_proof_invalid');
   const confirmed=await request('/shopping/order/addCartConfirm',{cjOrderIdList:[code]});if(confirmed.submitSuccess!==true||confirmed.successCount!==1||(Array.isArray(confirmed.interceptOrders)&&confirmed.interceptOrders.length))throw Error('parent_confirm_invalid');
   const shipmentOrderId=str(confirmed.shipmentsId);if(!shipmentOrderId)throw Error('shipment_id_missing');const parent=await request('/shopping/order/saveGenerateParentOrder',{shipmentOrderId});
   return parseCjParentPayment(parent,shipmentOrderId,code);
  },
  async balance(){const r=await getCjBalance();if(!r.ok)throw Error(r.error);const value=exactUsdMinor(r.data.amountUsd);if(value===null)throw Error('balance_invalid');return value;},
  async debit(p){await request('/shopping/pay/payBalanceV2',{shipmentOrderId:p.shipmentOrderId,payId:p.payId});},
  async billing(code){const out=[];for(let page=1;page<=10;page++){const r=await getCjBillingHistory(code,page);if(!r.ok)throw Error(r.error);const list=Array.isArray(r.data.list)?r.data.list as Record<string,unknown>[]:[];out.push(...list.map(x=>({id:str(x.id),cjOrderCode:str(x.cjOrderId)||null,amountUsdMinor:exactUsdMinor(x.copeMoney),status:str(x.status),type:str(x.typeDesc)})));if(page*100>=Number(r.data.total))return out;}throw Error('billing_history_incomplete');},
 };
}
