import {describe,it,expect} from 'vitest';
import {groupCategoryFields,planCategoryFieldChanges} from '@/lib/ad-categories/shared-fields';
import type {SubcategoryOption} from '@/lib/ad-categories/contracts';
const field={key:'color',label:'اللون',type:'text' as const,group:'',visible:true,required:false,order:0,options:[]};
const sub=(id:number,patch={}):SubcategoryOption=>({id,name:`قسم ${id}`,categoryId:1,active:true,order:id,version:1,kind:'goods',priceEnabled:true,goodsEnabled:true,fields:[{...field,...patch}]});
describe('shared category field controls',()=>{
 it('deduplicates compatible fields and retains mixed settings',()=>{const rows=groupCategoryFields([sub(1),sub(2,{visible:false})]);expect(rows).toHaveLength(1);expect(rows[0].visible).toBe('mixed');expect(rows[0].subcategoryIds).toEqual([1,2]);});
 it('separates fields with conflicting definitions',()=>expect(groupCategoryFields([sub(1),sub(2,{type:'number'})])).toHaveLength(2));
 it('changes only explicitly selected groups without erasing private fields',()=>{const a=sub(1);a.fields.push({...field,key:'private',label:'خاص'});const b=sub(2);const id=groupCategoryFields([a,b])[0].id;const changed=planCategoryFieldChanges([a,b],[{id,visible:false}]);expect(changed[0].fields[1]).toEqual(a.fields[1]);expect(changed.every(s=>!s.fields[0].visible&&!s.fields[0].required)).toBe(true);expect(a.fields[0].visible).toBe(true);});
 it('does not make hidden fields required or visible implicitly',()=>{const subs=[sub(1),sub(2,{visible:false})];const id=groupCategoryFields(subs)[0].id;const out=planCategoryFieldChanges(subs,[{id,required:true}]);expect(out[0].fields[0].required).toBe(true);expect(out.some(s=>s.id===2)).toBe(false);expect(subs[1].fields[0].required).toBe(false);expect(subs[1].fields[0].visible).toBe(false);});
 it('rejects unknown groups and malformed flags',()=>{expect(()=>planCategoryFieldChanges([sub(1)],[{id:'foreign',visible:true}])).toThrow();const id=groupCategoryFields([sub(1)])[0].id;expect(()=>planCategoryFieldChanges([sub(1)],[{id,visible:'yes'} as never])).toThrow();});
 it('preserves per-subcategory overrides on a no-change save',()=>expect(planCategoryFieldChanges([sub(1),sub(2,{visible:false})],[])).toEqual([]));
});
