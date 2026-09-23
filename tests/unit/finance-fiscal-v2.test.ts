import {describe,expect,it} from 'vitest';
import {calculateFiscalLinesV2,validateCalculationPolicy} from '@/lib/finance/fiscal-v2';

const policy={version:2,priceBasis:'inclusive',itemScope:'uniform_catalog',shippingPriceBasis:'exclusive',shippingVatBps:0,discountTreatment:'none',rounding:'line_half_up',policyRollover:'hold_for_review',automationDelegateId:'12'};
const line={key:'1',title:'Synthetic item',quantity:1,unitPriceMinor:4,discountMinor:0,vatBps:1500,priceBasis:'inclusive' as const,component:'product' as const};

describe('explicit prospective fiscal policy',()=>{
 it('has no inferred defaults and normalizes only a complete supported policy',()=>{
  expect(validateCalculationPolicy(policy)).toEqual(policy);
  for(const key of Object.keys(policy)){
   const missing={...policy};delete missing[key as keyof typeof missing];
   expect(()=>validateCalculationPolicy(missing)).toThrow('finance_calculation_policy_invalid');
  }
 });
 it.each([{shippingVatBps:0.5},{automationDelegateId:'0'},{rounding:'invoice_half_up'},{priceBasis:'guess'},{itemScope:'mixed'},{discountTreatment:''},{policyRollover:'assume_order_date'}])('rejects unsupported or ambiguous policy %j',change=>{
  expect(()=>validateCalculationPolicy({...policy,...change})).toThrow('finance_calculation_policy_invalid');
 });
});
describe('V2 exact fiscal line calculations',()=>{
 it('preserves every inclusive gross halala even where V1 net inversion is impossible',()=>{
  const result=calculateFiscalLinesV2([line]);
  expect(result).toMatchObject({netMinor:3,vatMinor:1,totalMinor:4});
  for(let amount=0;amount<=200;amount++){
   const value=calculateFiscalLinesV2([{...line,unitPriceMinor:amount}]);
   expect(value.totalMinor).toBe(amount);expect(value.netMinor+value.vatMinor).toBe(amount);
  }
 });
 it('calculates exclusive products and independently configured shipping without floating point',()=>{
  const result=calculateFiscalLinesV2([{...line,quantity:3,unitPriceMinor:999,priceBasis:'exclusive'}, {...line,key:'shipping',title:'Shipping',component:'shipping',unitPriceMinor:2345,vatBps:0}]);
  expect(result).toMatchObject({netMinor:5342,vatMinor:450,totalMinor:5792});
 });
 it('applies an explicit discount in the recorded price basis before calculating VAT',()=>{
  expect(calculateFiscalLinesV2([{...line,unitPriceMinor:11500,discountMinor:1150}])).toMatchObject({netMinor:9000,vatMinor:1350,totalMinor:10350});
  expect(calculateFiscalLinesV2([{...line,unitPriceMinor:10000,discountMinor:1000,priceBasis:'exclusive'}])).toMatchObject({netMinor:9000,vatMinor:1350,totalMinor:10350});
 });
 it.each([{quantity:0},{unitPriceMinor:1.5},{discountMinor:5},{vatBps:10001},{unitPriceMinor:Number.MAX_SAFE_INTEGER,quantity:2},{priceBasis:'unknown'},{component:'unknown'}])('rejects invalid fiscal input %j',change=>{
  expect(()=>calculateFiscalLinesV2([{...line,...change}] as never)).toThrow();
 });
 it('rejects duplicate line identities and multiple shipping lines',()=>{
  expect(()=>calculateFiscalLinesV2([line,line])).toThrow();
  expect(()=>calculateFiscalLinesV2([{...line,key:'other',component:'shipping'}])).toThrow();
 });
});
