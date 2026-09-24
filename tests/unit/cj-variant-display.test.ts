import {describe,expect,it} from 'vitest';
import {cjVariantDisplayOptions,cleanCjDisplayDescription} from '@/lib/cj/variant-display';
import {cjProductDisplayTitle} from '@/lib/cj/presentation';
describe('CJ product customer display',()=>{
  it('splits a source color and size pair without changing its original value',()=>{
    const source='Black-XL';
    expect(cjVariantDisplayOptions({variantKey:source,variantName:source})).toEqual([{label:'اللون',value:'أسود',source:'parsed'},{label:'المقاس',value:'XL',source:'parsed'}]);
    expect(source).toBe('Black-XL');
  });
  it('extracts color and size suffixes from the full CJ product title shown in variant names',()=>{
    const source='Mens Autumn Jacket 2026 SpringAutumn Style Youth All-Match Hooded Retro Casual Streetwear Windproof Coat For Men Red S';
    expect(cjVariantDisplayOptions({variantKey:'',variantName:source})).toEqual([
      {label:'اللون',value:'أحمر',source:'parsed'},
      {label:'المقاس',value:'S',source:'parsed'},
    ]);
  });
  it('renders dynamic named source attributes with Arabic labels and arbitrary options',()=>{
    expect(cjVariantDisplayOptions({variantKey:'',variantName:'',attributes:{color:'Black',plugType:'EU',voltage:'220V',capacity:64,customFinish:'Matte'}})).toEqual([
      {label:'اللون',value:'أسود',source:'attribute'},{label:'القابس',value:'أوروبي',source:'attribute'},{label:'الفولت',value:'220V',source:'attribute'},{label:'السعة',value:'64',source:'attribute'},{label:'customFinish',value:'Matte',source:'attribute'},
    ]);
  });
  it('does not expose a long untranslated supplier name as the customer option',()=>{
    expect(cjVariantDisplayOptions({variantKey:'',variantName:'Long special edition jacket windproof model for men in a very long supplier label'})).toEqual([]);
  });
  it('cleans repeated imported headings and whitespace while preserving unique specification values',()=>{
    expect(cleanCjDisplayDescription('معلومات المنتج:\n\n\nمعلومات المنتج:\nالخامة: قطن\n\nالخامة: قطن')).toBe('معلومات المنتج:\n\nالخامة: قطن');
  });
  it('smooths a known literal all-match phrase for the display title without touching the source',()=>{
    const source='سترة رجالي للخريف 2026 نمط الربيع والخريف للشباب كل مباراة';
    expect(cjProductDisplayTitle(source)).toContain('متعدد الاستخدامات');
    expect(source).toContain('كل مباراة');
  });
});
