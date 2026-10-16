import {describe,it,expect} from 'vitest';
import {buildCjVariantSelector,resolveCjVariantSelection} from '@/lib/cj/variant-selector';
import {cjVariantDisplayOptions} from '@/lib/cj/variant-display';
const opt=(label:string,value:string)=>({label,value,source:'parsed' as const});
describe('exact supplier variant selection',()=>{
 it('keeps all 21 observed cable clip options distinct without generic numbered labels',()=>{
  const title='Magnetic Cable Clip Under Desk Cable Management Adjustable Cord Holder Wire Organizer And Cable Management Wire Keeper';
  const names=['6 Pack White','6 Pack Black','3PackBlack','3Packwhite','3 black and 3 white','Black 10pcs','1PC','4PCS','2PCS','Set1','Set2','Set3','Set4','12pcs White','Black','Black 12pcs','White 20pcs','Black 5pcs','Set5','Set6','Set7'];
  const entries=names.map((name,i)=>({vid:String(i),opts:cjVariantDisplayOptions({variantKey:'',variantName:`${title} ${name}`},title)}));
  expect(entries.every(e=>e.opts.length&&e.opts.every(o=>o.label!=='الخيار'))).toBe(true);
  const selector=buildCjVariantSelector(entries)!;expect(selector).not.toBeNull();
  for(const e of entries){const chosen=Object.fromEntries(selector.groups.map(g=>[g.label,e.opts.find(o=>o.label===g.label)?.value??'غير مذكور في هذا الخيار']));expect(resolveCjVariantSelection(selector,chosen)).toBe(e.vid);}
 });
 it('resolves color and size to the exact VID and rejects missing combinations',()=>{
  const s=buildCjVariantSelector([{vid:'black-s',opts:[opt('اللون','أسود'),opt('المقاس','S')]},{vid:'white-m',opts:[opt('اللون','أبيض'),opt('المقاس','M')]}])!;
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض','المقاس':'M'})).toBe('white-m');
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض','المقاس':'S'})).toBe('');
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض'})).toBe('');
 });
 it('never silently picks one of two SKUs sharing translated attributes',()=>{
  expect(buildCjVariantSelector([{vid:'a',opts:[opt('اللون','أسود')]},{vid:'b',opts:[opt('اللون','أسود')]}])).toBeNull();
 });
 it('retains an explicit unspecified option without inventing a color or pack count',()=>{
  const s=buildCjVariantSelector([{vid:'six-white',opts:[opt('اللون','أبيض'),opt('عدد القطع في العبوة','6')]},{vid:'one',opts:[opt('عدد القطع في العبوة','1')]}])!;
  const absent=s.groups.find(g=>g.label==='اللون')!.values.find(v=>v!=='أبيض')!;
  expect(resolveCjVariantSelection(s,{'اللون':absent,'عدد القطع في العبوة':'1'})).toBe('one');
  expect(resolveCjVariantSelection(s,{'اللون':'أبيض','عدد القطع في العبوة':'1'})).toBe('');
 });
});
