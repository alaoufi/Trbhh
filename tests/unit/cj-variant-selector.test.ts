import {describe,it,expect} from 'vitest';
import {buildCjVariantSelector,resolveCjVariantSelection,groupCjVariantFamilies,cjVariantValues} from '@/lib/cj/variant-selector';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
const opt=(label:string,value:string)=>({label,value,source:'parsed' as const});
describe('dependent exact supplier option selection',()=>{
 it('separates all 21 observed options into five independent types',()=>{
  const title='Magnetic Cable Clip Under Desk Cable Management Adjustable Cord Holder Wire Organizer And Cable Management Wire Keeper';
  const names=['6 Pack White','6 Pack Black','3PackBlack','3Packwhite','3 black and 3 white','Black 10pcs','1PC','4PCS','2PCS','Set1','Set2','Set3','Set4','12pcs White','Black','Black 12pcs','White 20pcs','Black 5pcs','Set5','Set6','Set7'];
  const entries=names.map((name,i)=>({vid:String(i),opts:cjVariantDisplayOptions({variantKey:'',variantName:`${title} ${name}`},title)}));
  const families=groupCjVariantFamilies(entries);expect(families).toHaveLength(5);
  expect(buildCjVariantSelector(entries)).toBeNull();
  for(const family of families){const selector=buildCjVariantSelector(family.entries)!;expect(selector).not.toBeNull();for(const e of family.entries){expect(resolveCjVariantSelection(selector,Object.fromEntries(e.opts.map(o=>[o.label,o.value])))).toBe(e.vid);}}
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
