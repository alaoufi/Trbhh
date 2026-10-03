'use strict';
const assert=require('node:assert/strict');
exports.run=async({page,outsider,origin})=>{
  assert.equal(origin,'http://localhost:4197');
  for(const width of [360,390,412,1440]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/admin/categories','/admin/categories/manage','/admin/categories/fields','/admin/categories/ads','/admin/categories/settings']){
      const response=await page.goto(origin+path);assert.equal(response.status(),200);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} width ${width}`);
      assert.equal(await page.locator('main table').count(),0);
    }
  }
  await page.goto(origin+'/admin/categories/manage');
  const name=`قسم اختبار الإدارة المعزول ${Date.now()}`;
  await page.getByLabel('اسم القسم الجديد',{exact:true}).fill(name);
  await page.getByRole('button',{name:'إضافة قسم مخفي',exact:true}).click();
  const summary=page.locator('summary').filter({hasText:name});
  await summary.waitFor();assert((await summary.innerText()).includes('مخفي'));
  await summary.click();
  await summary.locator('..').getByLabel('اسم القسم',{exact:true}).fill(name+' معدل');
  await summary.locator('..').getByRole('button',{name:'حفظ القسم',exact:true}).click();
  await page.locator('summary').filter({hasText:name+' معدل'}).waitFor();
  for(const [action,state] of [['إظهار القسم','ظاهر'],['إخفاء القسم','مخفي']]){
    await page.goto(origin+'/admin/categories/manage');
    const s=page.locator('summary').filter({hasText:name+' معدل'});await s.click();
    await s.locator('..').getByRole('button',{name:action,exact:true}).click();
    await page.waitForFunction(({name,state})=>[...document.querySelectorAll('summary')].some(el=>el.textContent.includes(name)&&el.textContent.includes(state)),{name:name+' معدل',state});
  }
  const createHref=await page.locator('summary').filter({hasText:name+' معدل'}).locator('..').locator('a[href*="/create?"]').getAttribute('href');
  await page.setViewportSize({width:360,height:900});
  await page.goto(origin+createHref);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'subcategory creation mobile');
  await page.getByLabel('اسم القسم الفرعي',{exact:true}).fill('قسم فرعي اختبار معزول');
  await page.getByRole('button',{name:'حفظ القسم والحقول',exact:true}).click();
  await page.waitForURL(u=>u.pathname==='/admin/categories/manage'&&u.searchParams.get('saved')==='1');
  await page.locator('summary').filter({hasText:name+' معدل'}).click();
  await page.getByRole('heading',{name:'قسم فرعي اختبار معزول — مخفي',exact:true}).waitFor();
  await page.goto(origin+'/admin/categories/ads');
  const main=page.getByLabel('القسم الرئيسي',{exact:true}),sub=page.getByLabel('القسم الفرعي',{exact:true});
  const first=await sub.locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);
  if(first){await sub.selectOption(first);const parent=await main.locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);await main.selectOption(parent);assert.equal(await sub.inputValue(),'');}
  await page.getByRole('button',{name:'عرض النتائج',exact:true}).click();
  await page.getByRole('heading',{name:'إعلانات الأقسام',exact:true}).waitFor();
  await outsider.goto(origin+'/admin/categories/manage');
  assert.equal(await outsider.getByLabel('اسم القسم الجديد',{exact:true}).count(),0);
  console.log('PASS category_admin_hub: five pages 360/390/412/1440, isolated add/edit/show/hide, create hidden subcategory mobile, dependent filters, member denied');
};
