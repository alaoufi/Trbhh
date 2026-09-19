import {expect,it} from 'vitest';
import {parseSubcategoryDefinition,nextCategoryFieldKey} from '@/lib/ad-categories/admin-input';
it('generates an unused field key after deletion and manual renaming',()=>{
  expect(nextCategoryFieldKey([])).toBe('field_1');
  expect(nextCategoryFieldKey([{key:'field_1'},{key:'field_3'}])).toBe('field_2');
  expect(nextCategoryFieldKey([{key:'field_1'},{key:'field_2'},{key:'field_3'}])).toBe('field_4');
});
it('requires valid kinds and explicit flags; unconfigured sections have no generic goods',()=>{
  const f=new FormData();f.set('kind','service');f.set('fields_json','[]');
  expect(parseSubcategoryDefinition(f)).toMatchObject({kind:'service',priceEnabled:false,goodsEnabled:false,fields:[]});
  f.set('kind','jobs');f.set('price_enabled','1');f.set('goods_enabled','1');
  expect(parseSubcategoryDefinition(f)).toMatchObject({priceEnabled:false,goodsEnabled:false});
  f.set('kind','forged');expect(()=>parseSubcategoryDefinition(f)).toThrow();
});
