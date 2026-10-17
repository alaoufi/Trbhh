import {describe,it,expect} from 'vitest';
import {cjSourceOptions,sameCjSourceOptions,validCjSourceOptions} from '@/lib/cj/source-option-identity';
describe('raw CJ source option commitments',()=>{
 it('preserves explicitly named arbitrary dimensions and raw untranslated values',()=>{
  expect(cjSourceOptions({variantKey:'紫色-US 12.5',variantName:'Shoe',optionSchema:['Color','Size'],attributes:{options:[{name:'Finish',value:'Matte'},{name:'Voltage',value:'220V'}],stock:72,variantSellPrice:10}})).toEqual({key:'紫色-US 12.5',name:'Shoe',schema:['Color','Size'],attributes:{Finish:'Matte',Voltage:'220V'}});
 });
 it('binds arbitrary exact API-declared direct dimensions while excluding economics',()=>{
  const a=cjSourceOptions({variantKey:'Matte',optionSchema:['Finish'],attributes:{Finish:'Matte',finish:'ignored alias',cost:10,internalId:'secret'}});
  const b=cjSourceOptions({variantKey:'Matte',optionSchema:['Finish'],attributes:{Finish:'Gloss'}});
  expect(a?.attributes).toEqual({Finish:'Matte'});expect(sameCjSourceOptions(a,b)).toBe(false);
  expect(cjSourceOptions({variantKey:'X',optionSchema:['Finish'],attributes:{options:{Finish:'Matte',unit_cost:10,margin:30,apiKey:'secret'}}})?.attributes).toEqual({Finish:'Matte'});
 });
 it.each(['__proto__','constructor','prototype'])('rejects unsafe raw option property %s',unsafe=>{
  const attributes=JSON.parse(JSON.stringify({Finish:'Matte'}) .slice(0,-1)+',"'+unsafe+'":"bad"}');
  expect(cjSourceOptions({variantKey:'X',optionSchema:['Finish'],attributes:{options:attributes}})).toBeNull();
  expect(validCjSourceOptions({key:'X',name:'',schema:[],attributes})).toBe(false);
  expect(cjSourceOptions({variantKey:'X',optionSchema:[unsafe]})).toBeNull();
 });
 it('does not bind price, weight or stock as selectable options',()=>{
  expect(sameCjSourceOptions(cjSourceOptions({variantKey:'Black',attributes:{variantSellPrice:10,stock:4}}),cjSourceOptions({variantKey:'Black',attributes:{variantSellPrice:12,stock:1}}))).toBe(true);
 });
 it('rejects absent options and malformed snapshots without throwing',()=>{
  expect(cjSourceOptions({variantName:'Black XL',attributes:{stock:3}})).toBeNull();
  expect(validCjSourceOptions({key:'Black',name:'',schema:[],attributes:[]})).toBe(false);
  expect(sameCjSourceOptions({key:'Black'} as never,{key:'Black'} as never)).toBe(false);
 });
 it('canonicalizes raw attribute property ordering while preserving source schema order',()=>{
  const a=cjSourceOptions({variantKey:'X',optionSchema:['A','B'],attributes:{options:{B:'2',A:'1'}}});
  const b=cjSourceOptions({variantKey:'X',optionSchema:['A','B'],attributes:{options:{A:'1',B:'2'}}});
  expect(sameCjSourceOptions(a,b)).toBe(true);expect(sameCjSourceOptions(a,{...b!,schema:['B','A']})).toBe(false);
 });
});
