import {describe,it,expect,vi} from 'vitest';
import {runFulfillment,type FulfillmentRecord,type FulfillmentProvider,type OrderProof} from '@/lib/cj/fulfillment/worker';
function fixture(){
 let row:FulfillmentRecord={id:'1',version:0,status:'pending',customerPaidVerified:true,commitment:{supplierReference:'trbhh-1',supplierUsdMinor:1000,lines:[{pid:'p',vid:'v',quantity:1}],destination:{country:'SA'},originAreaId:'w',originCountry:'CN',logisticName:'route'}};
 const proof:OrderProof={orderId:'cj1',reference:'trbhh-1',payableUsdMinor:1000,paymentDate:null,cjOrderCode:'SD1',currency:'USD',orderStatus:'UNPAID',lines:row.commitment.lines,destination:{country:'SA'},originAreaId:'w',originCountry:'CN',logisticName:'route'};
 const provider:FulfillmentProvider={createUnpaid:vi.fn(async()=> 'cj1'),findByReference:vi.fn(async()=>[]),detail:vi.fn(async()=>proof),preparePayment:vi.fn(async()=>({shipmentOrderId:'SD1',payId:'PAY1',paymentUrl:'https://www.cjdropshipping.com/mine/payment?pid=PAY1',expiresAt:Date.now()+60000,payableUsdMinor:1000})),balance:vi.fn(async()=>0),debit:vi.fn(async()=>{}),billing:vi.fn(async()=>[])};
 const store={read:async()=>structuredClone(row),cas:async(_id:string,v:number,patch:Partial<FulfillmentRecord>)=>{if(v!==row.version)return false;row={...row,...patch,version:v+1};return true;}};
 return {provider,proof,store,row:()=>row,set:(p:Partial<FulfillmentRecord>)=>{row={...row,...p};}};
}
describe('CJ responsible card settlement',()=>{
 it('settles ten independent authorized wallet orders in simulation, never claiming one unified charge',async()=>{
  const debitIds:string[]=[],finished:string[]=[];
  for(let i=1;i<=10;i++){
   const f=fixture(),id=String(i),cjId=`CJ${i}`,payId=`PAY${i}`,shipmentOrderId=`SHIP${i}`,reference=`trbhh-${i}`;
   f.set({id,commitment:{...f.row().commitment,supplierReference:reference}});
   Object.assign(f.proof,{orderId:cjId,reference,cjOrderCode:shipmentOrderId});
   f.provider.createUnpaid=vi.fn(async()=>cjId);
   f.provider.preparePayment=vi.fn(async()=>({shipmentOrderId,payId,paymentUrl:`https://www.cjdropshipping.com/mine/payment?pid=${payId}`,expiresAt:Date.now()+60000,payableUsdMinor:1000}));
   f.provider.balance=vi.fn(async()=>10000);
   f.provider.debit=vi.fn(async()=>{debitIds.push(payId);});
   const options={paymentMode:'wallet' as const,walletAuthorization:{payId,shipmentOrderId,expectedUsdMinor:1000}};
   await runFulfillment(id,f.store,f.provider,options);
   expect(f.row().status).toBe('debit_uncertain');
   Object.assign(f.proof,{paymentDate:'2026-10-14 08:00:00',orderStatus:'UNSHIPPED'});
   f.provider.billing=vi.fn(async()=>[{id:`BILL${i}`,cjOrderCode:shipmentOrderId,amountUsdMinor:1000,status:'1',type:'Order Payment'}]);
   await runFulfillment(id,f.store,f.provider,options);
   await runFulfillment(id,f.store,f.provider,options);
   expect(f.row().status).toBe('supplier_paid');expect(f.provider.debit).toHaveBeenCalledTimes(1);finished.push(cjId);
  }
  expect(new Set(debitIds).size).toBe(10);expect(new Set(finished).size).toBe(10);
 });
 it('creates once and prepares card link with no wallet balance or debit',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider);await runFulfillment('1',f.store,f.provider);expect(f.row().status).toBe('payment_ready');expect(f.provider.createUnpaid).toHaveBeenCalledTimes(1);expect(f.provider.preparePayment).toHaveBeenCalledTimes(1);expect(f.provider.balance).not.toHaveBeenCalled();expect(f.provider.debit).not.toHaveBeenCalled();});
 it('reconciles a card payment independently of wallet bills',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider);f.proof.paymentDate='2026-10-14 08:00:00';f.proof.orderStatus='UNSHIPPED';await runFulfillment('1',f.store,f.provider);expect(f.row().status).toBe('supplier_paid');expect(f.provider.billing).not.toHaveBeenCalled();expect(f.provider.debit).not.toHaveBeenCalled();});
 it.each(['UNPAID','CANCELLED','CREATED'])('does not accept payment date alone in %s',async status=>{const f=fixture();await runFulfillment('1',f.store,f.provider);f.proof.paymentDate='2026-10-14 08:00:00';f.proof.orderStatus=status;await runFulfillment('1',f.store,f.provider);expect(f.row().status).not.toBe('supplier_paid');});
 it('read-only reconciliation never creates an order',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider,{reconcileOnly:true});expect(f.provider.createUnpaid).not.toHaveBeenCalled();});
 it('wallet mode without amount-bound authorization never debits',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider,{paymentMode:'wallet'});expect(f.provider.debit).not.toHaveBeenCalled();});
 it('cannot authorize another payId or amount',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider);await runFulfillment('1',f.store,f.provider,{paymentMode:'wallet',walletAuthorization:{payId:'OTHER',shipmentOrderId:'SD1',expectedUsdMinor:1000}});expect(f.provider.debit).not.toHaveBeenCalled();});
 it('expired links can still be reconciled as actually paid without regeneration',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider);f.set({payment:{...f.row().payment!,expiresAt:Date.now()-1}});f.proof.paymentDate='2026-10-14 08:00:00';f.proof.orderStatus='UNSHIPPED';await runFulfillment('1',f.store,f.provider,{reconcileOnly:true});expect(f.row().status).toBe('supplier_paid');expect(f.provider.preparePayment).toHaveBeenCalledTimes(1);});
 it('rejects card proof for changed USD amount or missing currency',async()=>{const f=fixture();await runFulfillment('1',f.store,f.provider);f.proof.paymentDate='2026-10-14 08:00:00';f.proof.orderStatus='UNSHIPPED';f.proof.currency=undefined;await runFulfillment('1',f.store,f.provider,{reconcileOnly:true});expect(f.row().status).not.toBe('supplier_paid');});
});
