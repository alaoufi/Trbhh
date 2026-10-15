export function settlementIds(ids:string[]):bigint[]{
 if(!ids.length||ids.length>20||ids.some(id=>!/^\d{1,20}$/.test(id)))throw Error('cj_batch_selection_invalid');
 const values=ids.map(BigInt);if(values.some(v=>v<1n||v>18446744073709551615n)||new Set(values.map(String)).size!==values.length)throw Error('cj_batch_selection_invalid');
 return values.sort((a,b)=>a<b?-1:1);
}
export function supplierAmounts(value:unknown){
 const q=(typeof value==='string'?JSON.parse(value):value) as {lines:{quantity:number;supplierUnitUsdMinor:number}[];supplierFreightUsdMinor:number;supplierTaxUsdMinor:number;supplierUsdMinor:number};
 if(!q||!Array.isArray(q.lines)||!q.lines.length)throw Error('cj_batch_quote_invalid');
 const valid=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(q.lines.some(l=>!Number.isSafeInteger(l.quantity)||l.quantity<1||!valid(l.supplierUnitUsdMinor)))throw Error('cj_batch_quote_invalid');
 const productUsdMinor=q.lines.reduce((n,l)=>n+l.quantity*l.supplierUnitUsdMinor,0);
 const shippingUsdMinor=q.supplierFreightUsdMinor,taxUsdMinor=q.supplierTaxUsdMinor,totalUsdMinor=q.supplierUsdMinor;
 if(![productUsdMinor,shippingUsdMinor,taxUsdMinor,totalUsdMinor].every(valid)||totalUsdMinor<1||productUsdMinor+shippingUsdMinor+taxUsdMinor!==totalUsdMinor)throw Error('cj_batch_quote_invalid');
 return {productUsdMinor,shippingUsdMinor,taxUsdMinor,totalUsdMinor};
}
export const selectableStatuses=['created','payment_ready'] as const;
/** Mutation boundary: a forged form must obey the same supplier hold and payment proof. */
export function settlementPaymentReady(row:{status:string;last_error?:string|null;pay_id?:string|null;shipment_order_id?:string|null;pay_expires_at?:Date|null;evidence_json?:unknown},expectedUsdMinor:number,now=Date.now()){
 if(row.last_error)return false;
 try{const meta=(typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json) as {exception?:{actionRequired?:boolean}}|undefined;if(meta?.exception?.actionRequired)return false;}catch{return false;}
 if(row.status==='created')return true;
 if(row.status!=='payment_ready'||!row.pay_id||!row.shipment_order_id||!/^[A-Za-z0-9_-]{1,100}$/.test(row.pay_id)||!/^[A-Za-z0-9_-]{1,100}$/.test(row.shipment_order_id)||!row.pay_expires_at||!(new Date(row.pay_expires_at).getTime()>now))return false;
 try{const evidence=(typeof row.evidence_json==='string'?JSON.parse(row.evidence_json):row.evidence_json) as {payment?:{payId?:string;shipmentOrderId?:string;payableUsdMinor?:number}}|null;return evidence?.payment?.payId===row.pay_id&&evidence.payment.shipmentOrderId===row.shipment_order_id&&evidence.payment.payableUsdMinor===expectedUsdMinor;}catch{return false;}
}
