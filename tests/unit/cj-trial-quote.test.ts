import {beforeEach,describe,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({row:vi.fn(),details:vi.fn((row:{details_json?:unknown})=>row.details_json??null),verify:vi.fn()}));
vi.mock('@/lib/cj/mapping',()=>({getStorefrontCjProduct:mock.row,parseCjDetails:mock.details}));
vi.mock('@/lib/cj/sync',()=>({cjSyncSettings:async()=>({usdToSarX100:375})}));
vi.mock('@/lib/cj/availability',()=>({verifyCjVariantForSaudi:mock.verify}));
vi.mock('@/lib/cj/tax-quote',()=>({quoteCjVat:async(unit:number,quantity:number,shipping:number)=>({enabled:false,vatMinor:0,totalMinor:unit*quantity+shipping})}));
vi.mock('@/lib/cj/storefront',()=>({cjImg:(value:string)=>value,cjProductImages:(row:{image:string})=>row.image?[row.image]:[]}));
import {quoteCjTrialCart} from '@/lib/cj/trial-quote';
const savedVariant={vid:'blue-s',name:'Black-XL',optionKey:'Color-Black-Size-XL',sku:'SKU-BS',priceUsd:9,weight:100,attributes:{plug:'EU'}};
const product=(id=4)=>({id,hidden:0,name:'Source',name_ar:'سلعة',image:'https://example.test/item.jpg',currency:'SAR',sale_price_minor:1049,sale_price_override_minor:null,supplier_cost_minor:777,shipping_cost_minor:500,other_costs_minor:0,margin_bps:3000,agent_user_id:99n,cj_product_id:'private-pid',details_json:{variants:[savedVariant]}});
const snapshot=(patch:Record<string,unknown>={})=>({pid:'private-pid',vid:'blue-s',sku:'SKU-BS',productName:'سلعة',rawVariantName:'Black-XL',optionKey:'Color-Black-Size-XL',attributes:{plug:'EU'},verifiedQuantity:1,unitMinor:1500,stockQuantity:5,shippingName:'Saudi Standard',shippingMinor:700,shippingAdditionalMinor:0,vatEnabled:false,vatMinor:0,totalMinor:2200,deliveryDays:'7-12',originCountry:'CN',checkedAt:new Date().toISOString(),...patch});
const live=(patch:Record<string,unknown>={})=>({status:'available',vid:'blue-s',sku:'SKU-BS',variantName:'Black-XL',optionKey:'Color-Black-Size-XL',stockQuantity:5,warehouses:[],supplierPriceMinor:900,salePriceMinor:1500,shippingOptions:[{name:'Saudi Standard',priceMinor:700,additionalMinor:0,currency:'SAR',deliveryDays:'7-12',originCountry:'CN'}],checkedAt:new Date().toISOString(),...patch});
beforeEach(()=>{vi.clearAllMocks();mock.row.mockImplementation(async(id:number)=>product(id));mock.verify.mockResolvedValue(live());});
describe('CJ trial cart server revalidation',()=>{
  it('quotes only from a second exact-Vid live check and adds shipping to the line once',async()=>{
    const result=await quoteCjTrialCart([{id:4,qty:2,variantId:'blue-s',snapshot:snapshot({verifiedQuantity:2,totalMinor:3700})}]);
    expect(result).toMatchObject({currency:'SAR',totalMinor:3700,lines:[{id:4,qty:2,variantId:'blue-s',title:'سلعة',variantName:'Color-Black-Size-XL',variantSku:'SKU-BS',variantStock:5,unitMinor:1500,shippingMinor:700,shippingName:'Saudi Standard',totalMinor:3700}]});
    expect(mock.verify).toHaveBeenCalledExactlyOnceWith('private-pid',expect.objectContaining({vid:'blue-s'}),2,{},375,{otherCostsMinor:0,marginBps:3000,saleOverrideMinor:null});
  });
  it('blocks stale price, changed stock, and changed freight instead of silently updating the order amount',async()=>{
    mock.verify.mockResolvedValueOnce(live({salePriceMinor:1600}));
    expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}])).rejected).toEqual([{id:4,variantId:'blue-s',reason:'price_changed'}]);
    mock.verify.mockResolvedValueOnce(live({stockQuantity:4}));
    expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}])).rejected).toEqual([{id:4,variantId:'blue-s',reason:'stock_changed'}]);
    mock.verify.mockResolvedValueOnce(live({shippingOptions:[{name:'Saudi Standard',priceMinor:701,additionalMinor:0,currency:'SAR',deliveryDays:'7-12',originCountry:'CN'}]}));
    expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}])).rejected).toEqual([{id:4,variantId:'blue-s',reason:'shipping_changed'}]);
  });
  it('requires the full fresh verification snapshot and the selected variant',async()=>{
    expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s'}])).rejected).toEqual([{id:4,variantId:'blue-s',reason:'verification_required'}]);
    expect((await quoteCjTrialCart([{id:4,qty:1}])).rejected).toEqual([{id:4,reason:'variant_required'}]);
    expect(mock.verify).not.toHaveBeenCalled();
  });
  it('normalizes stock and provider failure into an unavailable line without provider secrets',async()=>{
    mock.verify.mockResolvedValue({status:'inventory_error',checkedAt:new Date().toISOString(),error:'private credential'});
    const result=await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}]);
    expect(result.rejected).toEqual([{id:4,variantId:'blue-s',reason:'variant_unavailable'}]);
    expect(JSON.stringify(result)).not.toContain('private credential');
  });
  it.each([null,{...product(),hidden:1},{...product(),id:7}])('removes unavailable, hidden or mismatched saved parents',async row=>{
    mock.row.mockResolvedValue(row);expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}])).rejected).toEqual([{id:4,reason:'unavailable'}]);
  });
  it.each(['javascript:alert(1)','http://example.test/photo.jpg','https://user:secret@example.test/photo.jpg'])('omits unsafe image URLs %s',async image=>{
    mock.row.mockResolvedValue({...product(),image});expect((await quoteCjTrialCart([{id:4,qty:1,variantId:'blue-s',snapshot:snapshot()}])).lines[0].image).toBe(null);
  });
  it('validates cart shape before reading product rows',async()=>{
    await expect(quoteCjTrialCart([{id:4,qty:1,unitMinor:1}])).rejects.toThrow('invalid_cart');expect(mock.row).not.toHaveBeenCalled();
  });
});
