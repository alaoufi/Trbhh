import {describe, expect, it} from 'vitest';
import {categoryEnabled, categoryPolicy, parseCategorySubmission, projectCategory} from '@/lib/ad-categories/contracts';
const field={key:'salary',label:'الراتب',type:'number' as const,group:'الوظيفة',required:false,visible:true,order:0,options:[]};
describe('real ad category contracts',()=>{
  it('enables only explicit 1',()=>{for(const v of [undefined,null,'','0','false','true','yes']) expect(categoryEnabled(v)).toBe(false);expect(categoryEnabled('1')).toBe(true);});
  it('jobs never expose generic price or goods even with flags set',()=>expect(categoryPolicy({kind:'jobs',priceEnabled:true,goodsEnabled:true})).toEqual({priceEnabled:false,goodsEnabled:false}));
  it('rejects stale versions and forged fields',()=>{
    const fd=new FormData();fd.set('category_id','12');fd.set('subcategory_id','34');fd.set('category_version','2');fd.set('category_values','{"salary":5000}');
    expect(()=>parseCategorySubmission(fd,{categoryId:12,id:34,version:3,fields:[field]})).toThrow('تغيّر');
    fd.set('category_version','3');fd.set('category_values','{"unknown":1}');expect(()=>parseCategorySubmission(fd,{categoryId:12,id:34,version:3,fields:[field]})).toThrow();
    fd.set('category_values','{"salary":5000}');expect(parseCategorySubmission(fd,{categoryId:12,id:34,version:3,fields:[field]})).toEqual({salary:5000});
  });
  it('omits hidden and unused optional data publicly',()=>expect(projectCategory([field,{...field,key:'private',visible:false}],{private:5})).toEqual([]));
});
