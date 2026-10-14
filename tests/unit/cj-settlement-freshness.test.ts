import {describe,it,expect,vi} from 'vitest';
import {verifyCjCommitmentFresh} from '@/lib/cj/fulfillment/freshness';
function fixture(){
 const c={supplierReference:'ref',supplierUsdMinor:1300,supplierFreightUsdMinor:300,supplierTaxUsdMinor:0,lines:[{pid:'p',vid:'v',quantity:2,supplierUnitUsdMinor:500}],destination:{country:'SA',postalCode:'12345'},originAreaId:'w',originCountry:'CN',logisticName:'route'};
 const deps={variants:vi.fn(async()=>({ok:true as const,data:[{vid:'v',variantSellPrice:5}]})),inventory:vi.fn(async()=>({ok:true as const,data:[{vid:'v',areaId:'w',countryCode:'CN',storageNum:2,cjInventoryQuantity:2}]})),freight:vi.fn(async()=>({ok:true as const,data:[{logisticName:'route',logisticPrice:3,taxesFeeUsd:0,clearanceFeeUsd:0}]}))};return {c,deps};
}
describe('fresh CJ settlement checks',()=>{
 it('checks original variant, origin, quantity and actual Saudi destination',async()=>{const f=fixture();expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toEqual({ok:true});expect(f.deps.freight).toHaveBeenCalledWith([{vid:'v',quantity:2}],'12345','CN');});
 it('rejects price movement even when freight offsets it',async()=>{const f=fixture();f.deps.variants.mockResolvedValue({ok:true,data:[{vid:'v',variantSellPrice:6}]});f.deps.freight.mockResolvedValue({ok:true,data:[{logisticName:'route',logisticPrice:1,taxesFeeUsd:0,clearanceFeeUsd:0}]});expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toMatchObject({ok:false,reason:'supplier_price_changed'});});
 it('rejects factory quantity without real CJ stock',async()=>{const f=fixture();f.deps.inventory.mockResolvedValue({ok:true,data:[{vid:'v',areaId:'w',countryCode:'CN',storageNum:900,cjInventoryQuantity:0}]});expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toMatchObject({ok:false,reason:'supplier_stock_changed'});});
 it('rejects changed freight',async()=>{const f=fixture();f.deps.freight.mockResolvedValue({ok:true,data:[{logisticName:'route',logisticPrice:4,taxesFeeUsd:0,clearanceFeeUsd:0}]});expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toMatchObject({ok:false,reason:'supplier_shipping_changed',actualUsdMinor:1400});});
 it('rejects missing route without switching carriers',async()=>{const f=fixture();f.deps.freight.mockResolvedValue({ok:true,data:[]});expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toMatchObject({ok:false,reason:'supplier_shipping_unavailable'});});
 it('reports failed provider without any financial call',async()=>{const f=fixture();f.deps.inventory.mockRejectedValue(Error('timeout'));expect(await verifyCjCommitmentFresh(f.c,f.deps as never)).toMatchObject({ok:false,reason:'supplier_recheck_unavailable'});});
});
