'use strict';
const assert=require('node:assert/strict');
exports.run=async({page,origin,paths})=>{
  assert.equal(origin,'http://localhost:4197','write tests must use isolated clone');
  const failures=[];let passed=0,lifting=false;
  const queue=[...paths];
  await Promise.all(Array.from({length:3},async()=>{
  const worker=await page.context().newPage();
  const pageForWorker=worker;
  await audit(pageForWorker).finally(()=>worker.close());
  }));
  async function audit(page){
  const save=async()=>{
    await page.locator('form').filter({has:page.locator('[name="fields_json"]')}).getByRole('button',{name:/^حفظ/}).click();
    await Promise.race([
      page.waitForURL(u=>u.searchParams.get('saved')==='1'),
      page.getByRole('alert').filter({hasText:'لم يتم الحفظ'}).waitFor().then(async()=>{throw Error(await page.getByRole('alert').filter({hasText:'لم يتم الحفظ'}).innerText());}),
    ]);
  };
  let path;
  while((path=queue.shift())){
    try{
      await page.goto(origin+path);
      const categoryName=await page.locator('[name="name"]').inputValue();
      if(categoryName.replace(/\s/g,'')==='رافعاتومناولة')lifting=true;
      const original=JSON.parse(await page.locator('[name="fields_json"]').inputValue());
      // Prove a no-op save before toggling: includes seeded and persisted definitions.
      await save();
      await page.goto(origin+path);
      assert.deepEqual(JSON.parse(await page.locator('[name="fields_json"]').inputValue()),original);
      const field=original.find(f=>!f.dependsOn);
      if(field){
        await page.locator(`[data-admin-field="${field.key}"]`).getByRole('combobox').selectOption(field.required?'optional':'required');
        await save();await page.goto(origin+path);
        assert.deepEqual(JSON.parse(await page.locator('[name="fields_json"]').inputValue()),original.map(f=>f.key===field.key?{...f,required:!field.required}:f));
        await page.locator(`[data-admin-field="${field.key}"]`).getByRole('combobox').selectOption(field.required?'required':'optional');
        await save();
        const display=path.replace(/requirements$/,'display');
        await page.goto(origin+display);
        const check=()=>page.locator(`[data-admin-field="${field.key}"]`).getByRole('checkbox',{name:'عرض القيمة في بطاقة الإعلان المختصرة',exact:false});
        await check().setChecked(!field.showInCard);await save();await page.goto(origin+display);
        assert.deepEqual(JSON.parse(await page.locator('[name="fields_json"]').inputValue()),original.map(f=>f.key===field.key?{...f,showInCard:!field.showInCard}:f));
        await check().setChecked(field.showInCard===true);await save();
      }
      passed++;console.log('PASS category_save_roundtrip '+path);
    }catch(error){failures.push({path,message:String(error.message).slice(0,500)});}
  }
  }
  console.log('CATEGORY_SAVE_ALL '+JSON.stringify({total:paths.length,passed,failed:failures.length,lifting,failures}));
  assert(lifting,'reported lifting category must be included');
  assert.equal(failures.length,0,JSON.stringify(failures));
};
