import {describe,expect,it} from 'vitest';
import {chosenVariantSnapshot} from '@/lib/commerce/variant-snapshot';

describe('flexible chosen variant snapshots',()=>{
 it('keeps all customer-facing option keys and stable identifiers while excluding supplier economics',()=>{
  expect(chosenVariantSnapshot('VID-8401',{vid:'VID-8401',sku:'SKU-BLK-XL',options:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU'},warehouse:'CN warehouse',weight:'1.2kg',length:'30cm',supplierCost:12})).toEqual({key:'VID-8401',vid:'VID-8401',sku:'SKU-BLK-XL',attributes:{Color:'Black',Size:'XL',Voltage:'220V',Plug:'EU',warehouse:'CN warehouse',weight:'1.2kg',length:'30cm'}});
 });
 it('does not fabricate provider identifiers or option values',()=>{
  expect(chosenVariantSnapshot('salla-id',{externalId:'salla-id',options:{Color:'Black'}})).toEqual({key:'salla-id',vid:null,sku:null,attributes:{Color:'Black'}});
 });
});
