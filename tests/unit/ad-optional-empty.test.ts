import {expect,it} from 'vitest';
import {validateCategoryValues,type CategoryField} from '@/lib/ad-categories/validation';
const range:CategoryField={key:'height',label:'ارتفاع العمل',type:'range',group:'',required:false,visible:true,order:0,options:[],min:4};
it('omits an optional range with both endpoints cleared instead of converting blanks into zero',()=>{
  expect(validateCategoryValues([range],{height:{min:'',max:''}})).toEqual({});
});
it('rejects a half-completed optional range with a field-specific explanation',()=>{
  expect(()=>validateCategoryValues([{...range,min:0}],{height:{min:'',max:5}})).toThrow('أكمل طرفي النطاق');
});
it('requires both endpoints for a required range',()=>{
  expect(()=>validateCategoryValues([{...range,required:true}],{height:{min:'',max:''}})).toThrow('الحقل مطلوب');
});
it.each(['number','decimal','year','select','multiselect','boolean','text','date'] as const)('omits an untouched or cleared optional %s',type=>{
  const f={...range,type,min:undefined};
  for(const value of [undefined,null,'','   ',...(type==='multiselect'?[[]]:[])])expect(validateCategoryValues([f],{height:value})).toEqual({});
});
it('preserves intentional false and zero',()=>{
  expect(validateCategoryValues([{...range,type:'boolean'}],{height:false})).toEqual({height:false});
  expect(validateCategoryValues([{...range,type:'number',min:0}],{height:0})).toEqual({height:0});
});
