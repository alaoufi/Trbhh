'use strict';
const assert=require('node:assert/strict');
exports.run=async({page,outsider,origin})=>{
  assert.equal(origin,'http://localhost:4197');
  for(const width of [360,390,412,1440]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/admin/categories','/admin/categories/manage','/admin/categories/fields','/admin/categories/requirements','/admin/categories/display','/admin/categories/ads','/admin/categories/settings']){
      const response=await page.goto(origin+path);assert.equal(response.status(),200);
      await page.getByRole('heading',{level:1}).waitFor();
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${path} width ${width}`);
      assert.equal(await page.locator('main table').count(),0);
    }
    await page.goto(origin+'/admin/categories/fields');
    const group=page.locator('#admin-nav details').filter({has:page.locator('summary').filter({hasText:'الأقسام وحقولها'})});
    assert.equal(await group.count(),1);
    assert.equal(await group.locator('a').count(),6);
    assert.equal(await group.getAttribute('open'),'');
    const selector=page.getByRole('region',{name:'اختيار القسم لإدارة الحقول'});
    assert(await selector.getByLabel('القسم الفرعي',{exact:true}).isDisabled());
    assert.equal(await page.locator('[name="fields_json"]').count(),0);
    const parent=await selector.getByLabel('القسم الرئيسي',{exact:true}).locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);
    if(parent){
      await selector.getByLabel('القسم الرئيسي',{exact:true}).selectOption(parent);
      const sub=await selector.getByLabel('القسم الفرعي',{exact:true}).locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);
      if(sub){
        await selector.getByLabel('القسم الفرعي',{exact:true}).selectOption(sub);
        assert.equal(await selector.getByRole('link').getAttribute('href'),`/admin/categories/subcategories/${sub}/fields`);
        await selector.getByLabel('القسم الرئيسي',{exact:true}).selectOption('');
        assert.equal(await selector.getByRole('link').count(),0);
      }
    }
    console.log(`PASS category_admin_hub viewport ${width}`);
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
  console.log('PASS category_admin_hub category mutations on isolated data');
  await page.goto(origin+'/admin/categories/ads');
  const main=page.getByLabel('القسم الرئيسي',{exact:true}),sub=page.getByLabel('القسم الفرعي',{exact:true});
  const first=await sub.locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);
  if(first){await sub.selectOption(first);const parent=await main.locator('option').evaluateAll(options=>options.find(o=>o.value)?.value);await main.selectOption(parent);assert.equal(await sub.inputValue(),'');}
  await page.getByRole('button',{name:'عرض النتائج',exact:true}).click();
  await page.getByRole('heading',{name:'إعلانات الأقسام',exact:true}).waitFor();
  await outsider.goto(origin+'/admin/categories/manage');
  await outsider.waitForURL(u=>u.pathname==='/');
  assert.equal(await outsider.getByLabel('اسم القسم الجديد',{exact:true}).count(),0);
  console.log('PASS category_admin_hub: seven pages 360/390/412/1440, six submenu links, dependent field picker, isolated add/edit/show/hide, create hidden subcategory mobile, dependent filters, member denied');
};
