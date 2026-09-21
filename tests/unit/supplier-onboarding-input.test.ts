import {describe,it,expect} from 'vitest';
import {Workbook} from 'exceljs';
import {MAX_ONBOARDING_BYTES,parseOnboardingWorkbook,validateOnboarding,normalizeStoreUrl,mergeOnboarding} from '@/lib/suppliers/onboarding-input';
const valid={establishment_name:'مؤسسة التجربة',store_name:'متجر التجربة',store_url:'https://salla.sa/trbhh-test/',registration_number:'١٠١٠١٢٣٤٥٦',contact_name:'المفوض',phone:'0501234567',email:'test@example.com'};
describe('supplier onboarding',()=>{
 it('normalizes Arabic identifiers and canonical store URL',()=>{const r=validateOnboarding(valid);expect(r.errors).toEqual([]);expect(r.values.registration_number).toBe('1010123456');expect(r.values.store_url).toBe('https://salla.sa/trbhh-test');});
 it('rejects missing required data, credentials and invalid URLs',()=>{expect(validateOnboarding({}).errors.length).toBeGreaterThan(0);expect(()=>normalizeStoreUrl('https://salla.sa.evil.test/store')).toThrow();expect(()=>normalizeStoreUrl('https://u:p@salla.sa/store')).toThrow();expect(validateOnboarding({...valid,client_secret:'secret'}).errors.length).toBeGreaterThan(0);});
 it('blank preserves values; optional explicit none clears',()=>{expect(mergeOnboarding({notes:'old',brand:'x'},{notes:''})).toEqual({notes:'old',brand:'x'});expect(mergeOnboarding({notes:'old'},{notes:null})).toEqual({notes:null});});
 it('rejects only required invalid fields; skips optional invalid without blocking',()=>{
  // مطلوب غير صالح (بريد) ⇒ خطأ يمنع الحفظ
  expect(validateOnboarding({...valid,email:'bad'}).errors.length).toBeGreaterThan(0);
  // اختياري غير صالح ⇒ لا خطأ، القيمة null، ومدرج في تقرير التجاوز
  for(const field of ['iban','tax_number','registration_expiry','stock_actual']){
   const r=validateOnboarding({...valid,[field]:field==='iban'?'SA123':field==='tax_number'?'123':field==='registration_expiry'?'2026-02-31':'maybe'});
   expect(r.errors).toEqual([]);
   // القيمة غير الصالحة لا تُخزَّن (تُحفظ البيانات السابقة عند التحديث)
   expect(r.values[field]).toBeUndefined();
   expect(r.report.skipped.some(s=>s.field===field)).toBe(true);
  }
 });
 it('auto-corrects phone and date formats and reports them as corrected',()=>{
  const r=validateOnboarding({...valid,phone:'0501234567',registration_expiry:'31/12/2026'});
  expect(r.errors).toEqual([]);
  expect(r.values.phone).toBe('+966501234567');
  expect(r.values.registration_expiry).toBe('2026-12-31');
  expect(r.report.corrected.some(c=>c.field==='registration_expiry')).toBe(true);
 });
 it('accepts a valid Saudi IBAN and tax number when present',()=>{
  const r=validateOnboarding({...valid,iban:'SA4420000001234567891234',tax_number:'300000000000003'});
  expect(r.errors).toEqual([]);
  expect(r.values.tax_number).toBe('300000000000003');
 });
 it('reads vertical template with all string digits intact',async()=>{const w=new Workbook(),s=w.addWorksheet('المتجر');s.addRows([['الحقل','القيمة'],['اسم المنشأة',valid.establishment_name],['اسم المتجر',valid.store_name],['رابط متجر سلة',valid.store_url],['السجل التجاري',valid.registration_number],['اسم صاحب المتجر أو المفوض',valid.contact_name],['الجوال',valid.phone],['البريد',valid.email]]);const r=await parseOnboardingWorkbook(Buffer.from(await w.xlsx.writeBuffer()),'store.xlsx');expect(r.errors).toEqual([]);expect(r.values.phone).toBe('+966501234567');});
 it('accepts a value-only Excel container despite an xlsm or mismatched filename',async()=>{const w=new Workbook(),s=w.addWorksheet('المتجر');s.addRows([['الحقل','القيمة'],['اسم المنشأة',valid.establishment_name],['اسم المتجر',valid.store_name],['رابط متجر سلة',valid.store_url],['السجل التجاري',valid.registration_number],['اسم صاحب المتجر أو المفوض',valid.contact_name],['الجوال',valid.phone],['البريد',valid.email]]);const bytes=Buffer.from(await w.xlsx.writeBuffer());for(const name of ['store.xlsm','salla-export.data'])expect((await parseOnboardingWorkbook(bytes,name)).errors).toEqual([]);});
 it('finds the data sheet and ignores a separate instructions sheet',async()=>{const w=new Workbook();w.addWorksheet('تعليمات').addRows([['تعليمات الاستخدام'],['لا تضع كلمة المرور هنا']]);const s=w.addWorksheet('بيانات المتجر');s.addRows([['الحقل','القيمة'],['اسم المنشأة',valid.establishment_name],['اسم المتجر',valid.store_name],['رابط متجر سلة',valid.store_url],['السجل التجاري',valid.registration_number],['اسم صاحب المتجر أو المفوض',valid.contact_name],['الجوال',valid.phone],['البريد',valid.email]]);const r=await parseOnboardingWorkbook(Buffer.from(await w.xlsx.writeBuffer()),'store.xlsm');expect(r.errors).toEqual([]);expect(r.warnings.join(' ')).toContain('الأوراق الإضافية');});
 it('rejects formulas rather than using cached values',async()=>{const w=new Workbook(),s=w.addWorksheet('المتجر');s.addRows([['اسم المتجر',{formula:'1+1',result:2}]]);await expect(parseOnboardingWorkbook(Buffer.from(await w.xlsx.writeBuffer()),'store.xlsx')).rejects.toThrow('onboarding_formula');});
 it('rejects corrupt and oversized files by content rather than extension',async()=>{expect(MAX_ONBOARDING_BYTES).toBeGreaterThanOrEqual(10*1024*1024);await expect(parseOnboardingWorkbook(Buffer.alloc(MAX_ONBOARDING_BYTES+1),'store.xlsx')).rejects.toThrow('onboarding_size');await expect(parseOnboardingWorkbook(Buffer.from('text'),'store.xlsx')).rejects.toThrow('onboarding_not_excel');});
});
