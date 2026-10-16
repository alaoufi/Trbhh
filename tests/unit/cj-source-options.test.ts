import {describe,it,expect} from 'vitest';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
describe('source declared CJ attributes only',()=>{
 it('uses provider schema order even if it disagrees with a heuristic',()=>{
  expect(cjVariantDisplayOptions({variantKey:'Purple-US 12.5',variantName:'',optionSchema:['Style','Model']})).toEqual([{label:'النمط',value:'بنفسجي',source:'parsed'},{label:'الموديل',value:'US 12.5',source:'parsed'}]);
 });
 it('never extracts source attributes from a title or SKU',()=>{
  expect(cjVariantDisplayOptions({variantKey:'',variantName:'Purple US 12.5'})).toEqual([]);
  expect(cjVariantDisplayOptions({variantKey:'Purple-US 12.5',variantName:''})).toEqual([]);
 });
 it('never treats raw stock quantity as pack contents',()=>{expect(cjVariantDisplayOptions({variantKey:'',variantName:'',attributes:{quantity:7422,stock:7422,count:12,length:300}})).toEqual([]);expect(cjVariantDisplayOptions({variantKey:'6',variantName:'',optionSchema:['Quantity']})).toEqual([{label:'الكمية',value:'6',source:'parsed'}]);});
 it('rejects inconsistent schema cardinality instead of guessing split positions',()=>{
  expect(cjVariantDisplayOptions({variantKey:'light-blue-US 12.5',variantName:'',optionSchema:['Color','Size']})).toEqual([]);
 });
});
