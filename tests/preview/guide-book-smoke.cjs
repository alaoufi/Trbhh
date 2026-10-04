const assert=require('node:assert/strict');
exports.run=async({page,origin,admin=false})=>{
 for(const route of admin?['/admin/guide']:['/guide','/guide/store']){
  const response=await page.goto(origin+route,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  const book=page.locator('[data-guide-book][data-enhanced="true"]');await book.waitFor();
  assert.equal(await book.locator('article:visible').count(),0);
  await book.getByRole('button',{name:'افتح الكتاب',exact:true}).click();
  assert.equal(await book.locator('article:visible').count(),1);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'guide mobile overflow');
  const toggle=book.getByRole('button',{name:'الفهرس والبحث',exact:true});if(await toggle.isVisible())await toggle.click();
  await book.getByLabel('ابحث داخل الدليل').fill('الفهرس');assert(await book.locator('nav[aria-label="موضوعات الدليل"] a').count()>0);
  await book.getByRole('button',{name:'مسح البحث'}).click();
  await book.getByRole('button',{name:'التالي',exact:true}).click();assert.equal(await book.locator('article:visible').count(),1);
  await book.getByRole('button',{name:'السابق',exact:true}).click();await book.getByRole('heading',{name:'استخدام الكتاب والفهرس',exact:true}).waitFor();
  console.log('PASS interactive guide '+route);
 }
};
