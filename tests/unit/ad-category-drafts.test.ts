import {expect,it} from 'vitest';
import {categoryDraftValues,setCategoryDraftValue,rangeDraftValue} from '@/lib/ad-categories/drafts';
import type {CategoryField} from '@/lib/ad-categories/validation';
const field:CategoryField={key:'height',label:'ارتفاع العمل',type:'range',group:'',required:false,visible:true,order:0,options:[],min:4};
it('keeps the empty endpoint empty and removes the key when both are cleared',()=>{
  const first=rangeDraftValue(undefined,'min','8');expect(first).toEqual({min:8,max:''});
  const complete=rangeDraftValue(first,'max','12');
  const half=rangeDraftValue(complete,'min','');expect(half).toEqual({min:'',max:12});
  expect(setCategoryDraftValue({height:half},'height',rangeDraftValue(half,'max',''))).toEqual({});
});
it('does not silently discard invalid active values before backend validation',()=>{
  expect(categoryDraftValues([field],{height:{min:1,max:2}})).toEqual({height:{min:1,max:2}});
});
it('omits inactive conditional fields and cleared optional values, preserving false/zero',()=>{
  expect(categoryDraftValues([{...field,dependsOn:'listing_type',dependencyOperator:'equals',dependencyValue:'rent'}],{height:{min:4,max:5}},{listingType:'sale'})).toEqual({});
  for(const value of ['',[],{min:'',max:''}] as const)expect(setCategoryDraftValue({height:4},'height',value as never)).toEqual({});
  for(const value of [false,0])expect(setCategoryDraftValue({},'height',value)).toEqual({height:value});
});
