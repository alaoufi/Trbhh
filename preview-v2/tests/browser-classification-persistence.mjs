import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin='http://127.0.0.1:4187';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();const seller=await context.newPage();
 async function setup(){
  await page.goto(origin+'/classification/');
  await page.evaluate(()=>{
   localStorage.clear();
   localStorage.setItem('trbhh-v2-seller-ads-v1',JSON.stringify([{id:'edit-test',intent:'wanted',category:'أخرى',subcategory:'كتب',title:'كتب تجريبية للاختبار فقط',description:'وصف إعلان تجريبي محفوظ لاختبار حماية التصنيف والمواصفات والصور.',price:'100',city:'الرياض',condition:'',images:['/images/sofa.jpg'],details:{author:'كاتب محفوظ'},spec1:'',spec2:'',status:'active',createdAt:'2026-09-19'}]));
   const ad=JSON.parse(localStorage.getItem('trbhh-v2-seller-ads-v1'))[0];
   localStorage.setItem('trbhh-v2-ad-draft-v1',JSON.stringify({version:1,form:ad,step:1,editingId:ad.id,savedAt:1}));
  });
  await page.reload();
  await page.locator('[data-ad-key="local:edit-test"]').getByRole('button',{name:'تعديل القسم'}).click();
  await page.getByLabel('الفرع المستهدف').selectOption('رياضة وهوايات');
  await page.getByRole('button',{name:'تحويل المحدد (1)',exact:true}).click();
  await page.getByRole('button',{name:'تأكيد التحويل'}).click();
  await page.getByText(/تم تحويل 1 إعلان/).waitFor();
 }
 await setup();
 await seller.goto(origin+'/ads/new/');
 await seller.getByLabel('التصنيف الفرعي').waitFor();
 assert.equal(await seller.getByLabel('التصنيف الفرعي').inputValue(),'رياضة وهوايات','A stale draft must not undo a more recent batch assignment');
 await seller.getByLabel('التصنيف الفرعي').selectOption('كتب');
 await seller.getByRole('button',{name:'حفظ التعديلات التجريبية',exact:true}).click();
 await seller.getByRole('heading',{name:'حُفظت تعديلات إعلانك'}).waitFor();
 await page.reload();
 assert.match(await page.locator('[data-ad-key="local:edit-test"]').innerText(),/كتب\s+مصنف/,'Explicit seller classification must win over an older bulk assignment');
 await setup();
 await seller.goto(origin+'/seller/');
 await seller.getByRole('button',{name:'إيقاف كتب تجريبية للاختبار فقط',exact:true}).click();
 await page.getByRole('button',{name:'تراجع عن آخر دفعة',exact:true}).click();
 await page.getByText('تغيرت بيانات إعلان بعد التحويل؛ لا يمكن التراجع دون إلغاء تغييرات أحدث.').waitFor();
 assert.equal(await page.getByText('تم التراجع عن آخر دفعة.',{exact:true}).count(),0);
 console.log('PASS: seller edits supersede old bulk assignments and unsafe undo is rejected');
}finally{await browser.close();}
