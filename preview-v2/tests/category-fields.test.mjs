import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const path = new URL('../lib/category-fields.ts', import.meta.url);
const schema = existsSync(path) ? await import(path.href) : {};
const profile = (category, subcategory) => schema.getProfile?.(category, subcategory);
const ids = p => p?.fields.map(f => f.id) ?? [];

test('land has land-use, topography and four boundaries, not bedrooms', () => {
  const fields = ids(profile('عقارات', 'أراضٍ'));
  for (const id of ['landUse', 'terrain', 'plotArea', 'northBoundary', 'southBoundary', 'eastBoundary', 'westBoundary']) assert.ok(fields.includes(id), `land missing ${id}`);
  assert.ok(!fields.includes('bedrooms'));
});
test('villa differs from apartment and land', () => {
  const villa = ids(profile('عقارات', 'فلل ومنازل'));
  for (const id of ['plotArea', 'builtArea', 'floors', 'bedrooms', 'bathrooms', 'finish', 'rentPeriod']) assert.ok(villa.includes(id), `villa missing ${id}`);
  assert.ok(ids(profile('عقارات', 'شقق')).includes('floorNumber'));
});
test('car parts have fitment and part number, no car mileage', () => {
  assert.ok(ids(profile('سيارات', 'قطع غيار')).includes('partNumber'));
  assert.ok(!ids(profile('سيارات', 'قطع غيار')).includes('mileage'));
  assert.ok(ids(profile('سيارات', 'سيارات')).includes('mileage'));
});
test('jobs use salary range and qualifications, never condition or sale price', () => {
  for (const sub of ['دوام كامل', 'دوام جزئي', 'عمل عن بُعد', 'تدريب']) {
    const p = profile('وظائف', sub);
    assert.equal(p?.pricing, 'salary');
    assert.equal(p?.condition, false);
    for (const id of ['jobTitle', 'salaryMin', 'salaryMax', 'qualification']) assert.ok(ids(p).includes(id));
  }
});
test('every leaf has a valid distinct profile with bounded typed fields', () => {
  assert.ok(Object.keys(schema.catalog ?? {}).length >= 10);
  for (const [category, branches] of Object.entries(schema.catalog ?? {})) {
    for (const [name, p] of Object.entries(branches)) {
      assert.ok(p.fields.length >= 5, `${category}/${name} too generic`);
      assert.equal(new Set(ids(p)).size, p.fields.length, `${name} duplicate field IDs`);
      for (const field of p.fields) {
        assert.match(field.id, /^[a-z][a-zA-Z0-9]*$/);
        if (['select', 'multi'].includes(field.type)) assert.ok(field.options?.length);
        if (field.when) assert.ok(ids(p).includes(field.when.field));
      }
    }
  }
});
test('conditional fields, empty optionals and foreign keys never leak into display', () => {
  assert.equal(typeof schema.displayDetails, 'function');
  const p = profile('عقارات', 'فلل ومنازل');
  assert.deepEqual(schema.displayDetails(p, {purpose:'للبيع', rentPeriod:'سنوي', bedrooms:'0', finish:'', mileage:'50000'}), [['الغرض من الإعلان','للبيع'],['غرف النوم','0']]);
});
test('numeric validation accepts Arabic digits, rejects bad enum and ranges', () => {
  assert.equal(typeof schema.validateDetails, 'function');
  const p = profile('وظائف', 'دوام كامل');
  const errors = schema.validateDetails(p, {jobTitle:'محاسب', qualification:'بكالوريوس', workMode:'حضوري', experience:'٢', salaryMin:'٩٠٠٠', salaryMax:'٥٠٠٠'}, 'offer');
  assert.ok(errors.salaryMax);
  const carErrors = schema.validateDetails(profile('سيارات', 'سيارات'), {year:'3000', fuel:'صاروخ', mileage:'-2'}, 'offer');
  assert.ok(carErrors.year && carErrors.fuel && carErrors.mileage);
});
test('changing subcategory clears incompatible state but preserves general content and images', () => {
  assert.equal(typeof schema.changeClassification, 'function');
  const f = {category:'سيارات', subcategory:'سيارات', title:'إعلان', price:'5', condition:'مستعمل', spec1:'2020', spec2:'100', details:{mileage:'100'}, images:['/images/suv.jpg']};
  const next = schema.changeClassification(f, 'وظائف', 'تدريب');
  assert.deepEqual(next.details, {});
  assert.equal(next.price, ''); assert.equal(next.condition, '');
  assert.equal(next.title, f.title); assert.deepEqual(next.images, f.images);
});
test('unknown category names and prototype keys fail closed', () => {
  assert.equal(profile('__proto__','constructor'), undefined);
  assert.equal(profile('سيارات','missing'), undefined);
});
test('typing preserves spaces and partial decimal input, but removes hidden dependent values', () => {
  assert.equal(typeof schema.updateDetail, 'function');
  const p = profile('عقارات', 'فلل ومنازل');
  const v = schema.updateDetail(p, {district:'حي ', purpose:'للإيجار', rentPeriod:'شهري'}, 'builtArea', '420.');
  assert.equal(v.district, 'حي '); assert.equal(v.builtArea, '420.');
  const next = schema.updateDetail(p, v, 'purpose', 'للبيع');
  assert.equal(next.rentPeriod, undefined);
});
test('required text cannot be whitespace and salary amount needs a pay period', () => {
  assert.equal(typeof schema.validateDetails, 'function');
  const errors = schema.validateDetails(profile('وظائف', 'دوام كامل'), {jobTitle:'   ', salaryMin:'5000'}, 'offer');
  assert.ok(errors.jobTitle); assert.ok(errors.salaryPeriod);
});
