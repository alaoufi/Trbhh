import {describe,it,expect,vi} from 'vitest';
const translate=vi.hoisted(()=>vi.fn(async(_texts:(string|null|undefined)[],_max?:number)=>new Map([['US 12.5','WRONG SIZE TRANSLATION'],['Finish','التشطيب'],['Matte','مطفي']])));
vi.mock('@/lib/cj/translate',()=>({translateManyForDisplay:translate}));
import {translateVariantOptions} from '@/lib/cj/variant-display-server';
describe('translate option text without changing supplier codes',()=>{
 it('never sends a source sizing-system value for translation',async()=>{const result=await translateVariantOptions([{vid:'v',variantKey:'Purple-US 12.5',variantName:'',optionSchema:['Color','Size']}]);expect(result.v.options.map(o=>o.value)).toEqual(['بنفسجي','US 12.5']);expect(translate.mock.calls[0][0]).not.toContain('US 12.5');});
 it('retains an untranslated source-script value instead of dropping a declared dimension',async()=>{const result=await translateVariantOptions([{vid:'v',variantKey:'红色-US 12.5',variantName:'',optionSchema:['Color','Size']}]);expect(result.v.options.map(o=>o.value)).toEqual(['红色','US 12.5']);});
 it('translates explicit arbitrary source option names and text',async()=>{const result=await translateVariantOptions([{vid:'v',variantKey:'Matte',variantName:'',optionSchema:['Finish']}]);expect(result.v.label).toBe('التشطيب: مطفي');});
});
