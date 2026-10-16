import {describe,it,expect} from 'vitest';
import {buildCjVariantSelector,resolveCjVariantSelection,groupCjVariantFamilies,cjVariantValues} from '@/lib/cj/variant-selector';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
const opt=(label:string,value:string)=>({label,value,source:'parsed' as const});
describe('dependent exact supplier option selection',()=>{
 it('resolves every declared source combination without using product titles',()=>{
  const entries=Array.from({length:21},(_,i)=>({vid:String(i),opts:cjVariantDisplayOptions({variantKey:`Color${Math.floor(i/7)}-Size${i%7}`,variantName:'Ignored title',optionSchema:['Color','Size']})}));
  const families=groupCjVariantFamilies(entries);expect(families).toHaveLength(1);
  const selector=buildCjVariantSelector(entries)!;expect(selector).not.toBeNull();for(const e of entries)expect(resolveCjVariantSelection(selector,Object.fromEntries(e.opts.map(o=>[o.label,o.value])))).toBe(e.vid);
 });
 it('offers sizes only for the chosen color, with no invalid Cartesian combinations',()=>{
  const s=buildCjVariantSelector([{vid:'black-s',opts:[opt('اللون','أسود'),opt('المقاس','S')]},{vid:'white-m',opts:[opt('اللون','أبيض'),opt('المقاس','M')]}])!;
  expect(cjVariantValues(s,'المقاس',{'اللون':'أبيض'})).toEqual(['M']);
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض','المقاس':'S'})).toBe('');
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض','المقاس':'M'})).toBe('white-m');
 });
 it('keeps ambiguous SKUs in the explicit option list',()=>{
  expect(buildCjVariantSelector([{vid:'a',opts:[opt('اللون','أسود')]},{vid:'b',opts:[opt('اللون','أسود')]}])).toBeNull();
 });
 it('supports a single option family without adding synthetic absent values',()=>{
  const s=buildCjVariantSelector([{vid:'mixed',opts:[opt('التشكيلة','3 أسود + 3 أبيض')]}])!;
  expect(s.groups[0].values).toEqual(['3 أسود + 3 أبيض']);
  expect(resolveCjVariantSelection(s,{})).toBe('');
 });
});
