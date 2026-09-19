import {describe,expect,it} from 'vitest';
import {calculatePricing} from '@/lib/suppliers/pricing';
describe('supplier integer pricing',()=>{
  it('50 SAR public / 40 cost / 47 selling yields 7 SAR profit',()=>{
    expect(calculatePricing({publicMinor:5000,costMinor:4000,policy:'manual',sellingMinor:4700})).toEqual({publicMinor:5000,costMinor:4000,sellingMinor:4700,profitMinor:700,currency:'SAR'});
  });
  it.each([
    [{policy:'source'},5000],
    [{policy:'fixed_discount',discountMinor:300},4700],
    [{policy:'percent_discount',discountBps:600},4700],
  ] as const)('applies explicit policy %j', (policy,selling)=>{
    expect(calculatePricing({publicMinor:5000,costMinor:4000,...policy}).sellingMinor).toBe(selling);
  });
  it('rounds retained price upward, not discount upward',()=>{
    expect(calculatePricing({publicMinor:101,costMinor:0,policy:'percent_discount',discountBps:100})).toMatchObject({sellingMinor:100,profitMinor:100});
  });
  it.each(['minimumPriceMinor','minimumMarginMinor','discountMinor','discountBps'])('rejects explicit null %s rather than treating it as zero',key=>{
    expect(()=>calculatePricing({publicMinor:100,costMinor:0,policy:'source',[key]:null})).toThrow();
  });
  it('accepts zero cost and exact minimum boundaries',()=>{
    expect(calculatePricing({publicMinor:0,costMinor:0,policy:'manual',sellingMinor:1,minimumPriceMinor:1,minimumMarginMinor:1}).profitMinor).toBe(1);
    expect(calculatePricing({publicMinor:2147483647,costMinor:0,policy:'percent_discount',discountBps:1}).sellingMinor).toBe(2147268899);
  });
  it.each([-1,0.1,NaN,Infinity,2147483648])('rejects invalid money %s',value=>{
    expect(()=>calculatePricing({publicMinor:value,costMinor:0,policy:'source'})).toThrow();
    expect(()=>calculatePricing({publicMinor:100,costMinor:value,policy:'source'})).toThrow();
  });
  it.each([
    {policy:'manual',sellingMinor:0},{policy:'manual'},{policy:'source',currency:'USD'},
    {policy:'fixed_discount',discountMinor:101},{policy:'percent_discount',discountBps:10001},
    {policy:'percent_discount',discountBps:1.5},{policy:'percent_discount',discountBps:10000},
    {policy:'manual',sellingMinor:40},{policy:'source',minimumPriceMinor:101},
    {policy:'source',minimumMarginMinor:51},{policy:'source',minimumMarginMinor:2147483647},
  ] as const)('rejects underpricing or invalid policy input %j',patch=>{
    expect(()=>calculatePricing({publicMinor:100,costMinor:50,...patch})).toThrow();
  });
});
