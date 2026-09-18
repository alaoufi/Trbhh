import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const path=new URL('../lib/classification.ts',import.meta.url);
const api=existsSync(path)?await import(path.href):{};
test('classifies clear titles, leaves ambiguity for review and preserves explicit branches',()=>{
  assert.equal(typeof api.classify,'function');
  assert.deepEqual(api.classify({title:'كنبة قماش بلون محايد'}),{category:'منزل وأثاث',subcategory:'أثاث منزلي',review:false,source:'auto'});
  assert.equal(api.classify({title:'سيارة مع شقة للبيع'}).review,true);
  assert.equal(api.classify({title:'عرض مميز'}).category,'أخرى');
  assert.equal(api.classify({title:'أرضيات خشبية'}).review,true,'Do not infer land from a partial word');
  assert.equal(api.classify({title:'سيارة',category:'أخرى',subcategory:'كتب'}).subcategory,'كتب');
});
test('bulk assignment only touches selected records and archives branch-specific data',()=>{
  assert.equal(typeof api.assign,'function');
  const original={id:'a',title:'عنوان',description:'وصف',images:['/images/sofa.jpg'],category:'سيارات',subcategory:'سيارات',details:{mileage:'20000'},price:'100',condition:'مستعمل'};
  const ads=[original,{...original,id:'b'}];
  const result=api.assign(ads,['a'],{category:'عقارات',subcategory:'أراضٍ'});
  assert.equal(result[1],ads[1]);
  assert.deepEqual(result[0].images,original.images);
  assert.equal(result[0].description,original.description);
  assert.deepEqual(result[0].details,{});
  assert.deepEqual(result[0].classificationArchive[0].details,{mileage:'20000'});
  assert.equal(original.category,'سيارات');
  assert.throws(()=>api.assign(ads,['a'],{category:'عقارات',subcategory:'سيارات'}));
});
