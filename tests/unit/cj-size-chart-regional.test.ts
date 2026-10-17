import {it,expect} from 'vitest';
import {cjSizeOptionLabel,type CjSizeChart} from '@/lib/cj/size-chart';
const chart:CjSizeChart={pid:'p',configured:true,baseVariantKey:'Size',rows:[{baseValue:'38',areas:[{country:'US Women',value:'7'},{country:'EU',value:'38'},{country:'UK',value:'5'}]}]};
it('uses explicit regional source data and puts European sizes first',()=>{expect(cjSizeOptionLabel('US Women 7',chart)).toBe('أوروبي (EU): 38 · نسائي أمريكي (US): 7 · بريطاني (UK): 5 · الأصلي: US Women 7');});
it('does not guess gender or convert absent sizes',()=>{expect(cjSizeOptionLabel('US 7',chart)).toBe('US 7');expect(cjSizeOptionLabel('7',chart)).toBe('7');expect(cjSizeOptionLabel('US Women 8',chart)).toBe('US Women 8');});
it('rejects ambiguous source equivalents',()=>{expect(cjSizeOptionLabel('US Women 7',{...chart,rows:[...chart.rows,{baseValue:'39',areas:chart.rows[0].areas}]})).toBe('US Women 7');});
