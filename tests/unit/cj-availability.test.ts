import {describe,expect,it,vi} from 'vitest';
import {readCjAvailability,verifyCjVariantForSaudi} from '@/lib/cj/availability';
import type {CjInventory,CjResult,CjVariant} from '@/lib/cj/types';

const variant=(vid:string,price=10):CjVariant=>({vid,variantSku:`SKU-${vid}`,variantName:`Color-Black Size-XL`,variantKey:'Color-Black-Size-XL',variantSellPrice:price,variantImage:null,variantWeight:100});
const ok=<T,>(data:T):CjResult<T>=>({ok:true,data});
const inventory=(vid:string,storageNum:number,origin='CN'):CjInventory=>({vid,storageNum,cjInventoryQuantity:storageNum,countryCode:origin,areaId:origin,areaName:origin});
const options=()=>[{logisticName:'Saudi Standard',logisticPrice:2,logisticAging:'7-12 days',logisticPriceCn:0}];

describe('CJ live availability proof',()=>{
  it('checks only the selected VID, exact quantity and inventory origin before quoting freight',async()=>{
    const freight=vi.fn(async()=>ok(options()));
    const result=await verifyCjVariantForSaudi('pid',variant('vid-7',12),3,{
      getInventoryByVid:async vid=>ok([inventory(vid,8)]),
      getVariants:async()=>ok([variant('vid-7',12),variant('vid-8',50)]),
      calculateFreight:freight,
    },375);
    expect(result).toMatchObject({status:'available',vid:'vid-7',stockQuantity:8,supplierPriceMinor:4500,salePriceMinor:5850,shippingOptions:[{name:'Saudi Standard',priceMinor:750,deliveryDays:'7-12 days'}]});
    expect(freight).toHaveBeenCalledExactlyOnceWith([{vid:'vid-7',quantity:3}],undefined,'CN');
  });
  it('uses live VID price instead of parent or stale variant price',async()=>{
    const result=await verifyCjVariantForSaudi('pid',variant('vid-7',9),1,{
      getInventoryByVid:async vid=>ok([inventory(vid,2)]),getVariants:async()=>ok([variant('vid-7',12)]),calculateFreight:async()=>ok(options()),
    },375);
    expect(result.status).toBe('available');
    if(result.status==='available')expect(result.salePriceMinor).toBe(5850);
  });
  it('distinguishes no stock, excessive quantity, inventory failure, missing VID and freight failure',async()=>{
    const deps={getInventoryByVid:async(vid:string)=>ok([inventory(vid,0)]),getVariants:async()=>ok([variant('vid-7')]),calculateFreight:async()=>ok(options())};
    expect((await verifyCjVariantForSaudi('pid',variant('vid-7'),1,deps,375)).status).toBe('out_of_stock');
    const stock=await verifyCjVariantForSaudi('pid',variant('vid-7'),4,{...deps,getInventoryByVid:async vid=>ok([inventory(vid,2)])},375);expect(stock.status).toBe('quantity_exceeds_stock');
    expect((await verifyCjVariantForSaudi('pid',variant('vid-7'),1,{...deps,getInventoryByVid:async()=>({ok:false,error:'secret token response'})},375)).status).toBe('inventory_error');
    expect((await verifyCjVariantForSaudi('pid',variant('vid-7'),1,{...deps,getVariants:async()=>ok([variant('other')])},375)).status).toBe('variant_changed');
    expect((await verifyCjVariantForSaudi('pid',variant('vid-7'),1,{...deps,getInventoryByVid:async vid=>ok([inventory(vid,2)]),calculateFreight:async()=>ok([])},375)).status).toBe('no_shipping');
    expect((await verifyCjVariantForSaudi('pid',variant('vid-7'),1,{...deps,getInventoryByVid:async vid=>ok([inventory(vid,2)]),calculateFreight:async()=>({ok:false,error:'secret token response'})},375)).status).toBe('freight_error');
  });
  it('does not trust inventory belonging to a different VID',async()=>{
    const result=await verifyCjVariantForSaudi('pid',variant('vid-7'),1,{
      getInventoryByVid:async()=>ok([inventory('other',99)]),getVariants:async()=>ok([variant('vid-7')]),calculateFreight:async()=>ok(options()),
    },375);
    expect(result.status).toBe('out_of_stock');
  });
  it('checks all 24 variants independently; one bad freight quote does not erase other proofs',async()=>{
    const variants=Array.from({length:24},(_,index)=>variant(`vid-${index+1}`));
    const freight=vi.fn(async(products:{vid:string;quantity:number}[])=>products[0].vid==='vid-9'?ok([]):ok(options()));
    const results=await Promise.all(variants.map(item=>verifyCjVariantForSaudi('pid',item,1,{
      getInventoryByVid:async vid=>ok([inventory(vid,2)]),getVariants:async()=>ok(variants),calculateFreight:freight,
    },375)));
    expect(results.filter(result=>result.status==='available')).toHaveLength(23);
    expect(results[8].status).toBe('no_shipping');
    expect(freight).toHaveBeenCalledTimes(24);
  });
  it('keeps the legacy import gate fail-closed when one combined freight request cannot prove the feed',async()=>{
    const variants=Array.from({length:24},(_,index)=>variant(`vid-${index+1}`));
    const result=await readCjAvailability('pid',variants,{getInventoryByPid:async()=>ok(variants.map(item=>inventory(item.vid,10))),calculateFreight:async()=>({ok:false,error:'failed'})});
    expect(result).toBeNull();
  });
  it('persists Saudi freight proof and stock on the exact VID instead of only product totals',async()=>{
    const variants=[variant('v-good'),variant('v-no-freight')];
    const saved=await readCjAvailability('pid',variants,{
      getInventoryByPid:async()=>ok([inventory('v-good',6),inventory('v-no-freight',9)]),
      calculateFreight:async products=>products[0].vid==='v-good'?ok(options()):ok([]),
    });
    const value=JSON.parse(saved!);
    expect(value.stockQuantity).toBe(6);
    expect(value.variants).toHaveLength(1);
    expect(value.variants[0]).toMatchObject({vid:'v-good',stockQuantity:6,shippingOptions:[{name:'Saudi Standard',priceMinor:750,currency:'SAR',originCountry:'CN'}]});
  });
});
