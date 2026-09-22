import {describe,it,expect} from 'vitest';
import {validateAdjustment,validateVerifiedRefund} from '@/lib/finance/adjustments';
import {calculateFiscalLines} from '@/lib/finance/calculations';
import type {FiscalSnapshot} from '@/lib/finance/types';
const snapshot=(quantity=2):FiscalSnapshot=>({version:1,issuer:{name:'شركة اختبار',taxNumber:'300000000000003',address:'الرياض'},customer:{name:'عميل اختبار',address:'الرياض'},currency:'SAR',...calculateFiscalLines([{key:'7',title:'منتج',quantity,unitNetMinor:10000,discountMinor:0,vatBps:1500,supplierId:'1',supplierMinor:quantity*6000}]),paidMinor:quantity*11500,sourceOrderId:'1',sourceReceiptId:'1',policyReference:'test-policy'});
describe('immutable credit/debit policy boundaries',()=>{
 it('allows partial credit with original identity and exact per-line math',()=>{
   expect(()=>validateAdjustment('credit_note',snapshot(),[],snapshot(1))).not.toThrow();
 });
 it('rejects overcredit quantities and tax, changed product and issuer',()=>{
   expect(()=>validateAdjustment('credit_note',snapshot(),[{kind:'credit_note',snapshot:snapshot(1)}],snapshot())).toThrow();
   expect(()=>validateAdjustment('credit_note',snapshot(),[],{...snapshot(1),issuer:{...snapshot().issuer,name:'other'}})).toThrow();
   const bad=snapshot(1);bad.lines[0].vatBps=0;
   expect(()=>validateAdjustment('credit_note',snapshot(),[],bad)).toThrow();
 });
 it('only allows debit restoration of a previously credited amount',()=>{
   expect(()=>validateAdjustment('debit_note',snapshot(),[],snapshot(1))).toThrow();
   expect(()=>validateAdjustment('debit_note',snapshot(),[{kind:'credit_note',snapshot:snapshot(1)}],snapshot(1))).not.toThrow();
 });
 it('rejects duplicate product keys and zero documents',()=>{
   const dup=snapshot(1);dup.lines=[...dup.lines,...dup.lines];
   expect(()=>validateAdjustment('credit_note',snapshot(),[],dup)).toThrow();
 });
 it('requires an authenticated successful refund result and bounds',()=>{
   const evidence={verified:true,status:'refunded',provider:'test',externalId:'ref-1',receiptId:'1',orderId:'1',amountMinor:10,currency:'SAR',refundedAt:'2026-09-22T08:00:00.000Z',evidenceRef:'verified-provider-query'};
   expect(()=>validateVerifiedRefund(evidence,true)).not.toThrow();
   expect(()=>validateVerifiedRefund({...evidence,verified:false},true)).toThrow();
   expect(()=>validateVerifiedRefund(evidence,false)).toThrow();
   expect(()=>validateVerifiedRefund({...evidence,amountMinor:0},true)).toThrow();
 });
});
