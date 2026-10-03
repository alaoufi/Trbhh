'use strict';
const assert=require('node:assert/strict');
exports.run=async({page,outsider,origin})=>{
  assert.equal(origin,'http://localhost:4197');
  await require('./category-admin-hub-smoke.cjs').run({page,outsider,origin});
  await page.goto(origin+'/admin/categories/requirements');
  const parents=await page.getByLabel('القسم الرئيسي',{exact:true}).locator('option').evaluateAll(options=>options.filter(o=>o.value).map(o=>o.value));
  const paths=[];
  for(const parent of parents){
    await page.getByLabel('القسم الرئيسي',{exact:true}).selectOption(parent);
    const ids=await page.getByLabel('القسم الفرعي',{exact:true}).locator('option').evaluateAll(options=>options.filter(o=>o.value).map(o=>o.value));
    paths.push(...ids.map(id=>`/admin/categories/subcategories/${id}/requirements`));
  }
  assert(paths.length>0,'dedicated administration links missing');
  await require('./category-admin-all-save-smoke.cjs').run({page,origin,paths:[...new Set(paths)]});
  let original,path,field;
  for(const candidate of paths.slice(0,20)){
    await page.goto(origin+candidate);
    original=JSON.parse(await page.locator('[name="fields_json"]').inputValue());
    field=original.find(item=>!item.dependsOn);
    if(field){path=candidate;break;}
  }
  assert(path&&field,'test needs one unconditional existing field');
  const selector=()=>page.locator(`[data-admin-field="${field.key}"]`).getByRole('combobox');
  const save=async name=>{
    await page.getByRole('button',{name,exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get('saved')==='1');
    await page.getByRole('status').filter({hasText:'تم حفظ إعدادات'}).waitFor();
  };
  await selector().selectOption(field.required?'optional':'required');
  await save('حفظ الإجباري والاختياري');
  let actual=JSON.parse(await page.locator('[name="fields_json"]').inputValue());
  assert.deepEqual(actual,original.map(item=>item.key===field.key?{...item,required:!field.required}:item));
  await page.goto(origin+path);
  await selector().selectOption(field.required?'required':'optional');
  await save('حفظ الإجباري والاختياري');
  assert.deepEqual(JSON.parse(await page.locator('[name="fields_json"]').inputValue()),original);
  const display=path.replace(/requirements$/,'display');
  await page.goto(origin+display);
  const check=()=>page.locator(`[data-admin-field="${field.key}"]`).getByRole('checkbox',{name:'عرض القيمة في بطاقة الإعلان المختصرة',exact:false});
  await check().setChecked(!field.showInCard);
  await save('حفظ إعدادات الظهور');
  actual=JSON.parse(await page.locator('[name="fields_json"]').inputValue());
  assert.equal(actual.find(item=>item.key===field.key).showInCard,!field.showInCard);
  assert.equal(actual.find(item=>item.key===field.key).required,field.required);
  await page.goto(origin+display);
  await check().setChecked(field.showInCard===true);
  await save('حفظ إعدادات الظهور');
  await page.goto(origin+path.replace(/requirements$/,'fields'));
  await page.getByRole('heading',{level:1}).waitFor();
  assert.equal(await page.getByRole('button',{name:'إضافة حقل',exact:true}).count(),1);
  assert.equal(await page.getByRole('combobox',{name:/تعبئة الحقل:/}).count(),0);
  await page.getByRole('button',{name:'إضافة حقل',exact:true}).click();
  const testLabel='حقل اختبار إدارة معزول';
  await page.getByLabel('اسم الحقل',{exact:true}).last().fill(testLabel);
  const testGroup=page.getByRole('group',{name:testLabel,exact:true});
  // The legacy wrapping label includes option text in its accessible name.
  await testGroup.getByRole('combobox').first().selectOption('number');
  await testGroup.getByLabel('الحد الأدنى',{exact:true}).fill('10');
  await testGroup.getByLabel('الحد الأعلى',{exact:true}).fill('1');
  await page.getByRole('button',{name:'حفظ القسم والحقول',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'لم يتم الحفظ'}).waitFor();
  assert((await page.getByRole('alert').filter({hasText:'لم يتم الحفظ'}).innerText()).includes(testLabel));
  assert.equal(await testGroup.getByLabel('الحد الأدنى',{exact:true}).inputValue(),'10');
  assert.equal(await testGroup.getByLabel('الحد الأعلى',{exact:true}).inputValue(),'1');
  await testGroup.getByLabel('الحد الأعلى',{exact:true}).fill('100');
  await save('حفظ القسم والحقول');
  actual=JSON.parse(await page.locator('[name="fields_json"]').inputValue());
  assert.equal(actual.length,original.length+1);
  assert.equal(actual.at(-1).label,testLabel);
  await page.goto(origin+path.replace(/requirements$/,'fields'));
  await page.getByRole('group',{name:testLabel,exact:true}).getByRole('button',{name:'إزالة من التعريف (القيمة القديمة تبقى محفوظة)',exact:true}).click();
  await save('حفظ القسم والحقول');
  assert.equal(JSON.parse(await page.locator('[name="fields_json"]').inputValue()).length,original.length);
  for(const width of [390,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(origin+path);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await outsider.goto(origin+path);
  await outsider.waitForURL(u=>u.pathname==='/');
  assert.equal(await outsider.locator('[name="fields_json"]').count(),0);
  console.log('PASS category_admin_pages: separate pages, add/remove isolated field, required/optional save+reload, display independent, preserved definitions, permissions, 390/1440');
};
