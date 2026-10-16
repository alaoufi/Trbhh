import {describe,it,expect} from 'vitest';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
import {buildCjVariantSelector,resolveCjVariantSelection} from '@/lib/cj/variant-selector';
const labels=(v:Parameters<typeof cjVariantDisplayOptions>[0])=>cjVariantDisplayOptions(v).map(o=>[o.label,o.value]);
describe('supplier option matrix across catalog categories',()=>{
 it.each([
  ['shoes',{variantKey:'Purple-36',variantName:''},[['اللون','بنفسجي'],['المقاس','36']]],
  ['clothes',{variantKey:'Black-XL',variantName:''},[['اللون','أسود'],['المقاس','XL']]],
  ['textiles',{variantKey:'100×200 cm',variantName:''},[['المقاس','100×200cm']]],
  ['packs',{variantKey:'6pcs White',variantName:''},[['اللون','أبيض'],['عدد القطع في العبوة','6']]],
  ['electrical',{variantKey:'',variantName:'',attributes:{voltage:'220V',plugType:'EU'}},[['الفولت','220V'],['القابس','أوروبي']]],
  ['storage',{variantKey:'',variantName:'',attributes:{capacity:'128GB',material:'ABS'}},[['السعة','128GB'],['الخامة','ABS']]],
  ['named shoes',{variantKey:'Color: Purple; Size: 36',variantName:''},[['اللون','بنفسجي'],['المقاس','36']]],
 ] as const)('%s keeps distinct source attributes',(_category,input,expected)=>expect(labels(input)).toEqual(expected));
 it('accepts equivalent source sizes without false conflicts',()=>{expect(labels({variantKey:'Black-xl',variantName:'Sneakers Black XL'})).toEqual([['اللون','أسود'],['المقاس','XL']]);expect(labels({variantKey:'Purple-US12.5',variantName:'Sneakers Purple US 12.5'})).toEqual([['اللون','بنفسجي'],['المقاس','US 12.5']]);});
 it('does not invent a color from unrelated numeric attributes',()=>{expect(cjVariantDisplayOptions({variantKey:'220V-36',variantName:''}).some(o=>o.label==='اللون')).toBe(false);});
 it('blocks conflicting color evidence instead of guessing',()=>{expect(cjVariantDisplayOptions({variantKey:'Black',variantName:'Shoes Red 36'})).toEqual([]);expect(cjVariantDisplayOptions({variantKey:'Red-36',variantName:'',attributes:{color:'Black'}})).toEqual([]);});
 it.each(['US 6','US 6.5','US 7.5','US 8','US 9','US 9.5','US 10.5','US 11','US 12','US 12.5','EU 42.5','UK 7.5'])('preserves the explicit supplier shoe sizing system %s',size=>{expect(labels({variantKey:'Purple-'+size,variantName:'Trendy Stylish Puncture-resistant Casual Sports Safety Shoes Purple '+size})).toEqual([['اللون','بنفسجي'],['المقاس',size]]);});
 it('does not leak telemetry and preserves structured option arrays',()=>{
  expect(labels({variantKey:'',variantName:'',attributes:{createTime:123,stock:200,options:[{name:'Color',value:'Purple'},{name:'Size',value:'36'}]}})).toEqual([['اللون','بنفسجي'],['المقاس','36']]);
 });
 it('supports more than four independent attributes without losing exact VID',()=>{
  const opts=['اللون','المقاس','الفولت','القابس','الخامة'].map(label=>({label,value:label+'1',source:'attribute' as const}));
  const s=buildCjVariantSelector([{vid:'v1',opts}]);expect(s).not.toBeNull();expect(resolveCjVariantSelection(s!,Object.fromEntries(opts.map(o=>[o.label,o.value])))).toBe('v1');
 });
 it('does not resolve duplicate VID values under different combinations',()=>{
  expect(buildCjVariantSelector([{vid:'same',opts:[{label:'اللون',value:'أسود',source:'parsed'}]},{vid:'same',opts:[{label:'اللون',value:'أبيض',source:'parsed'}]}])).toBeNull();
 });
});
