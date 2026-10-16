import {describe,expect,it} from 'vitest';
import {cjVariantDisplayOptions,cleanCjDisplayDescription} from '@/lib/cj/variant-display';
describe('CJ source-only display translation',()=>{
 it('translates explicit color and size declarations without altering source values',()=>{
  const input={variantKey:'Purple-US 12.5',variantName:'Misleading Black XL',optionSchema:['Color','Size']};
  expect(cjVariantDisplayOptions(input)).toEqual([{label:'اللون',value:'بنفسجي',source:'parsed'},{label:'المقاس',value:'US 12.5',source:'parsed'}]);expect(input.variantKey).toBe('Purple-US 12.5');
 });
 it('does not recover types or quantities from product titles',()=>{
  for(const name of ['Shoes Purple 36','Cable Clip 6 Pack White','Set1'])expect(cjVariantDisplayOptions({variantKey:'',variantName:name})).toEqual([]);
 });
 it('uses arbitrary explicit source attribute names rather than classifying their values',()=>{
  expect(cjVariantDisplayOptions({variantKey:'',variantName:'',attributes:{options:[{name:'Finish',value:'Matte'},{name:'Voltage',value:'220V'}]}})).toEqual([{label:'Finish',value:'Matte',source:'attribute'},{label:'الفولت',value:'220V',source:'attribute'}]);
 });
 it('ignores technical packaging dimensions as purchase options',()=>{
  expect(cjVariantDisplayOptions({variantKey:'',variantName:'',attributes:{variantLength:300,variantWidth:200,variantHeight:100,variantStandard:'long=300,width=200,height=100',variantProperty:'[]',createTime:123,barcode:'123'}})).toEqual([]);
 });
 it('rejects schema and named attribute conflicts',()=>{
  expect(cjVariantDisplayOptions({variantKey:'Purple-US 12.5',variantName:'',optionSchema:['Color','Size'],attributes:{color:'Black'}})).toEqual([]);
 });
 it('cleans repeated display headings without changing specifications',()=>{expect(cleanCjDisplayDescription('معلومات المنتج:\nمعلومات المنتج:\nالخامة: قطن\nالخامة: قطن')).toBe('معلومات المنتج:\n\nالخامة: قطن');});
});
