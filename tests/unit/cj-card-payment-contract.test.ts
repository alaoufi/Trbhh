import {describe,it,expect,vi} from 'vitest';
vi.mock('@/lib/cj/client',()=>({cjFulfillmentTransport:vi.fn(),getCjBalance:vi.fn(),getCjBillingHistory:vi.fn(),getVariants:vi.fn()}));
import {parseCjParentPayment,isCjCardPaymentConfirmed} from '@/lib/cj/fulfillment/provider';
const now=Date.UTC(2026,9,14);
const parent={submitSuccess:true,successOrders:['SD1'],payId:'PAY1',payExpireTime:'2026-10-15 12:00:00',orderMoney:'50.00'};
describe('official single CJ card parent proof',()=>{
 it('accepts documented top-level amount and official exact-host card URL',()=>expect(parseCjParentPayment(parent,'SHIP1','SD1',now)).toMatchObject({payableUsdMinor:5000,paymentUrl:'https://www.cjdropshipping.com/mine/payment?pid=PAY1',expiresAt:Date.UTC(2026,9,15,12)}));
 it('supports old nested amount but rejects contradictory amounts and fractional cents',()=>{expect(parseCjParentPayment({...parent,orderMoney:undefined,paymentInformation:{payableAmount:50}},'SHIP1','SD1',now).payableUsdMinor).toBe(5000);expect(()=>parseCjParentPayment({...parent,paymentInformation:{payableAmount:49}},'SHIP1','SD1',now)).toThrow('payment_amount_conflict');expect(()=>parseCjParentPayment({...parent,orderMoney:'50.001'},'SHIP1','SD1',now)).toThrow('payment_amount_invalid');});
 it.each([{payId:'https://evil.test'},{payId:''},{payExpireTime:'2026-02-30 12:00:00'},{payExpireTime:'2026-10-13 12:00:00'},{successOrders:['SD1','SD2']},{unMatchOrderCodes:['SD2']}])('rejects unsafe, expired or mixed parent %j',patch=>expect(()=>parseCjParentPayment({...parent,...patch},'SHIP1','SD1',now)).toThrow());
 it('card settlement needs supplier paid timestamp and paid state, not a wallet debit',()=>{expect(isCjCardPaymentConfirmed({currency:'USD',paymentDate:'2026-10-14 12:00:00',orderStatus:'UNSHIPPED'},now+86400000)).toBe(true);expect(isCjCardPaymentConfirmed({currency:'USD',paymentDate:'2026-10-14 12:00:00',orderStatus:'UNPAID'},now+86400000)).toBe(false);expect(isCjCardPaymentConfirmed({currency:'USD',paymentDate:'bad',orderStatus:'SHIPPED'},now)).toBe(false);expect(isCjCardPaymentConfirmed({currency:'USD',paymentDate:'2026-10-16 12:00:00',orderStatus:'SHIPPED'},now)).toBe(false);});
});
