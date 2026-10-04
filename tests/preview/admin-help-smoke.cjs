'use strict';
const assert=require('node:assert/strict');
exports.run=async({page,outsider,origin})=>{
 assert.equal(origin,'http://localhost:4197');
 for(const width of [390,1024]){
  await page.setViewportSize({width,height:900});
  await page.goto(origin+'/admin/help');
  const nav=page.getByRole('navigation',{name:'تبويبات المساعدة'});
  await nav.getByRole('link',{name:'شرح متحرك',exact:true}).click();
  await page.getByRole('button',{name:'تشغيل',exact:true}).waitFor();
  await page.getByRole('button',{name:'التالي',exact:true}).click();
  await page.getByText('الخطوة 2 من 6',{exact:true}).waitFor();
  await page.getByRole('button',{name:'السابق',exact:true}).click();
  await page.getByText('الخطوة 1 من 6',{exact:true}).waitFor();
  await page.getByRole('button',{name:'تشغيل',exact:true}).click();
  await page.getByRole('button',{name:'إيقاف',exact:true}).click();
  await nav.getByRole('link',{name:'لقطات توضيحية',exact:true}).click();
  await page.locator('figure').first().waitFor();
  assert.equal(await page.locator('figure').count(),6);
  await page.waitForFunction(()=>[...document.querySelectorAll('figure img')].every(i=>i.complete&&i.naturalWidth>0));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await outsider.goto(origin+'/admin/help');await outsider.waitForURL(u=>u.pathname==='/');
 console.log('PASS admin_help tabs, pause/play, next/previous, six images, member denied, 390/1024');
};
