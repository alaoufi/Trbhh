import {describe,expect,it} from 'vitest';
import {cjVariantDisplayOptions,cleanCjDisplayDescription} from '@/lib/cj/variant-display';
describe('CJ product customer display',()=>{
  it('splits a source color and size pair without changing its original value',()=>{
    const source='Black-XL';
    expect(cjVariantDisplayOptions({variantKey:source,variantName:source})).toEqual([{label:'اللون',value:'Black',source:'parsed'},{label:'المقاس',value:'XL',source:'parsed'}]);
    expect(source).toBe('Black-XL');
  });
  it('renders dynamic named source attributes with Arabic labels and arbitrary options',()=>{
    expect(cjVariantDisplayOptions({variantKey:'',variantName:'',attributes:{color:'Black',plugType:'EU',voltage:'220V',capacity:64,customFinish:'Matte'}})).toEqual([
      {label:'اللون',value:'Black',source:'attribute'},{label:'القابس',value:'EU',source:'attribute'},{label:'الفولت',value:'220V',source:'attribute'},{label:'السعة',value:'64',source:'attribute'},{label:'customFinish',value:'Matte',source:'attribute'},
    ]);
  });
  it('does not invent a color or size when CJ returns an unstructured name',()=>{
    expect(cjVariantDisplayOptions({variantKey:'Long special edition',variantName:'Long special edition'})).toEqual([{label:'الخيار',value:'Long special edition',source:'parsed'}]);
  });
  it('cleans repeated imported headings and whitespace while preserving unique specification values',()=>{
    expect(cleanCjDisplayDescription('معلومات المنتج:\n\n\nمعلومات المنتج:\nالخامة: قطن\n\nالخامة: قطن')).toBe('معلومات المنتج:\n\nالخامة: قطن');
  });
});
