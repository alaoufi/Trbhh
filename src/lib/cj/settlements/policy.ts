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
