import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getProfile, displayDetails, validateDetails, updateDetail } from '../lib/category-fields.ts';
const path = new URL('../lib/field-settings.ts', import.meta.url);
const settings = existsSync(path) ? await import(path.href) : {};
test('hidden fields and their dependencies are neither rendered nor required', () => {
  assert.equal(typeof settings.applyFieldSettings, 'function');
  const p = settings.applyFieldSettings(getProfile('عقارات','أراضٍ'), {fields:{purpose:{hidden:true},plotArea:{required:false}}});
  assert.ok(!p.fields.some(f => ['purpose','rentPeriod'].includes(f.id)));
  assert.equal(validateDetails(p, {}, 'offer').plotArea, undefined);
  assert.deepEqual(displayDetails(p, {purpose:'للإيجار',rentPeriod:'سنوي'}), []);
});
test('settings can rename, require and add a bounded custom field without executing code', () => {
  assert.equal(typeof settings.applyFieldSettings, 'function');
  const p = settings.applyFieldSettings(getProfile('وظائف','دوام كامل'), {fields:{skills:{label:'مهارات التخصص',required:true}},added:[{id:'custom1',label:'التخصص',type:'text',group:'تفاصيل إضافية',required:true}]});
  assert.equal(p.fields.find(f => f.id === 'skills').label,'مهارات التخصص');
  assert.ok(validateDetails(p, {}, 'offer').custom1);
  assert.equal(p.condition,false);
  assert.equal(settings.applyFieldSettings(getProfile('وظائف','دوام كامل'), {enabled:false}), undefined);
});
test('hidden salary fields do not participate in cross-field validation', () => {
  const p=settings.applyFieldSettings(getProfile('وظائف','دوام كامل'), {fields:{salaryPeriod:{hidden:true},salaryMax:{hidden:true}}});
  const errors=validateDetails(p,{salaryMin:'9000',salaryMax:'5000'},'offer');
  assert.equal(errors.salaryPeriod,undefined);assert.equal(errors.salaryMax,undefined);
});
test('editing a visible value preserves archived values', () => {
  const p=settings.applyFieldSettings(getProfile('عقارات','أراضٍ'),{fields:{district:{hidden:true}}});
  assert.equal(updateDetail(p,{district:'النخيل',plotArea:'500'},'plotArea','600').district,'النخيل');
});
test('storage reads preserve obsolete selections without exposing them', () => {
  assert.equal(typeof settings.preserveStoredDetails,'function');
  const p=settings.applyFieldSettings(getProfile('عقارات','أراضٍ'),{fields:{landUse:{options:['سكني']}}});
  const stored=settings.preserveStoredDetails({landUse:'تجاري',plotArea:'600'});
  assert.equal(stored.landUse,'تجاري');
  assert.ok(validateDetails(p,stored,'offer').landUse);
  assert.ok(!displayDetails(p,stored).some(([label]) => label==='استخدام الأرض'));
});
test('conditional and price options cannot be renamed into different rule values', () => {
  const p=settings.applyFieldSettings(getProfile('عقارات','أراضٍ'),{fields:{purpose:{options:['بيع','إيجار']}}});
  assert.deepEqual(p.fields.find(f=>f.id==='purpose').options,['للبيع','للإيجار']);
});
test('empty option settings are rejected and cannot break the default schema', () => {
  assert.equal(typeof settings.settingsErrors,'function');
  const base=getProfile('عقارات','أراضٍ'); const cfg={fields:{landUse:{options:[' ','']}}};
  assert.ok(settings.settingsErrors(base,cfg).length);
  assert.ok(settings.applyFieldSettings(base,cfg).fields.find(f=>f.id==='landUse').options.length);
});
test('custom options are trimmed and deduplicated before use', () => {
  const p=settings.applyFieldSettings(getProfile('عقارات','أراضٍ'),{added:[{id:'custom2',type:'select',label:'فحص',options:[' ممتاز ','ممتاز','','جيد'],group:'إضافية'}]});
  assert.deepEqual(p.fields.find(f=>f.id==='custom2').options,['ممتاز','جيد']);
});
