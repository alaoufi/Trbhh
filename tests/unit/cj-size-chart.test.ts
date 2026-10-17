import {describe,it,expect} from 'vitest';
import {parseCjSizeChart,cjSizeOptionLabel} from '@/lib/cj/size-chart';
const body={pid:'p',configured:true,baseVariantKey:'Size',countries:['US Women','US Men','EU'],chartData:[{baseValue:'US 12.5',areaValues:[{country:'US Women',value:'12.5'},{country:'US Men',value:'11'},{country:'EU',value:'46'}]}]};
describe('supplier supplied size equivalents without conversion',()=>{
 it('formats only the exact chart row and preserves original selected value',()=>{const chart=parseCjSizeChart(body,'p');expect(chart).not.toBeNull();expect(cjSizeOptionLabel('US 12.5',chart)).toBe('US 12.5 · نسائي أمريكي (US): 12.5 · رجالي أمريكي (US): 11 · أوروبي (EU): 46');expect(cjSizeOptionLabel('US 6',chart)).toBe('US 6');});
 it('rejects another product, malformed rows and invented numeric conversions',()=>{expect(parseCjSizeChart({...body,pid:'other'},'p')).toBeNull();expect(parseCjSizeChart({...body,chartData:[{baseValue:'6',areaValues:[{country:'EU',value:39}]}]},'p')).toBeNull();expect(cjSizeOptionLabel('US 12.5',null)).toBe('US 12.5');});
 it('handles supplier configured=false without synthesizing a chart',()=>{expect(parseCjSizeChart({pid:'p',configured:false,chartData:null},'p')).toEqual({pid:'p',configured:false,baseVariantKey:null,rows:[]});});
 it('does not infer a region from a bare regional number',()=>{expect(cjSizeOptionLabel('11',parseCjSizeChart(body,'p'))).toBe('11');});
 it('refuses ambiguous equivalences',()=>{const chart=parseCjSizeChart({...body,chartData:[body.chartData[0],{...body.chartData[0],baseValue:' US 12.5 ',areaValues:[{country:'US Women',value:'US 12.5'}]}]},'p');expect(cjSizeOptionLabel('US 12.5',chart)).toBe('US 12.5');});
});
