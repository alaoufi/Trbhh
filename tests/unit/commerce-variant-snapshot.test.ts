import {describe,expect,it} from 'vitest';
import {chosenVariantSnapshot,chosenCjVariantSnapshot} from '@/lib/commerce/variant-snapshot';

describe('flexible chosen variant snapshots',()=>{
 it('persists verified raw option evidence and customer references from CJ quote lines',()=>{const sourceOptions={key:'Black-XL',name:'Black XL',schema:['Color','Size'],attributes:{Color:'Black',Size:'XL'}};expect(chosenCjVariantSnapshot({vid:'V1',sku:'SKU1',pid:'P1',storefrontProductId:'281',sourceOptions})).toMatchObject({key:'V1',vid:'V1',sku:'SKU1',pid:'P1',storefrontProductId:'281',attributes:{Color:'Black',Size:'XL'},sourceOptions});expect(()=>chosenCjVariantSnapshot({vid:'V1',sku:'SKU1',pid:'P1'})).toThrow('cj_selected_options_unverified');});
 it('keeps all customer-facing option keys and stable identifiers while excluding supplier economics',()=>{
  expect(chosenVariantSnapshot('VID-8401',{vid:'VID-8401',sku:'SKU-BLK-XL',options:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU'},warehouse:'CN warehouse',weight:'1.2kg',length:'30cm',supplierCost:12})).toEqual({key:'VID-8401',vid:'VID-8401',sku:'SKU-BLK-XL',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',warehouse:'CN warehouse',weight:'1.2kg',length:'30cm'}});
 });
 it('does not fabricate provider identifiers or option values',()=>{
  expect(chosenVariantSnapshot('salla-id',{externalId:'salla-id',options:{Color:'Black'}})).toEqual({key:'salla-id',vid:null,sku:null,attributes:{Color:'Black'}});
 });
});
