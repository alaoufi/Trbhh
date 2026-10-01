const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..');
const origin='http://127.0.0.1:4197';
const artifacts=process.env.PREVIEW_ARTIFACTS_DIR?path.resolve(process.env.PREVIEW_ARTIFACTS_DIR):path.resolve(repo,'artifacts/preproduction-e2e');
const database=process.env.COMMERCE_PREVIEW_DATABASE_URL||'mysql://root:local_disposable_root_only@127.0.0.1:33309/trbhh_commerce_preview_20260919';
const responsiveWidths=[360,390,412,768,1024,1440];
let server,browser,logs='';
const supplierNames=[];
const schemaFamilies=[
  {family:'goods',category:/سيارات/,leaf:/^سيارات$/},
  {family:'property',category:/عقارات/,leaf:/أراض/},
  {family:'jobs',category:/وظائف/,leaf:/فرص عمل/},
  {family:'heavy-equipment',category:/سيارات ونقليات ومعدات/,leaf:/^رافعات ومناولة$/},
  {family:'contracting',category:/بناء ومقاولات/,leaf:/مقاولات وتشطيبات/},
  {family:'service',category:/زراعة ومشاتل/,leaf:/خدمات زراعة وحدائق/},
  {family:'livestock',category:/مواشي/,leaf:/أغنام وماعز/},
  {family:'plants',category:/زراعة ومشاتل/,leaf:/شتلات ونباتات/},
  {family:'electronics',category:/إلكترونيات/,leaf:/^جوالات$/},
  {family:'appliances',category:/أوانٍ وأجهزة منزلية/,leaf:/اجهزة مطبخ/},
  {family:'decor',category:/أثاث وديكور/,leaf:/^سجاد$/},
  {family:'food',category:/أسر منتجة وأغذية/,leaf:/اطعمة ومأكولات/},
  {family:'furniture',category:/أثاث وديكور/,leaf:/مفروشات/},
];
const accountPhone=id=>`0500000${String(id).padStart(3,'0')}`;
async function assertResponsive(page,label,widths=responsiveWidths){
  for(const width of widths){
    await page.setViewportSize({width,height:width<768?844:1000});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${label} ${width}px overflow`);
  }
}
async function fillRequiredCategoryFields(page){
  const fields=page.locator('[data-field-key][data-required="true"]');
  for(let index=0;index<await fields.count();index++){
    const field=fields.nth(index);
    const control=field.locator('input:not([type="hidden"]),select,textarea').first();
    if(!await control.count())continue;
    const tag=await control.evaluate(element=>element.tagName.toLowerCase());
    if(tag==='select'){
      const value=await control.locator('option').evaluateAll(options=>options.find(option=>option.value)?.value||'');
      if(value)await control.selectOption(value);
      continue;
    }
    const type=(await control.getAttribute('type')||'text').toLowerCase();
    if(type==='checkbox'||type==='radio'){
      if(!await control.isVisible()){
        const disclosure=field.locator('details summary');
        if(await disclosure.count())await disclosure.click();
      }
      await control.check();continue;
    }
    if(type==='date'){await control.fill('2026-10-01');continue;}
    if(type==='number'){
      const min=await control.getAttribute('min');
      await control.fill(min!==null&&Number(min)>0?min:'1');
      continue;
    }
    await control.fill(`قيمة اختبار ${index+1}`);
  }
}
async function reviewSchemaFamilyForm(page,journey){
  await page.goto(origin+'/ads/new');
  const category=page.locator('select[name="taxonomy_group"]'),subcategory=page.locator('select[name="subcategory_id"]');
  await category.waitFor({state:'visible'});
  const categoryValue=await category.locator('option').evaluateAll((options,pattern)=>options.find(option=>option.value&&new RegExp(pattern).test(option.textContent||''))?.value||'',journey.category.source);
  assert(categoryValue,`${journey.family} main category exists`);
  await category.selectOption(categoryValue);
  const leafValue=await subcategory.locator('option').evaluateAll((options,pattern)=>options.find(option=>option.value&&new RegExp(pattern).test(option.textContent||''))?.value||'',journey.leaf.source);
  assert(leafValue,`${journey.family} leaf exists`);
  await subcategory.selectOption(leafValue);
  const fields=page.locator('[data-field-key]'),required=page.locator('[data-field-key][data-required="true"]');
  assert(await fields.count()>0,`${journey.family} renders specialised fields`);
  assert(await required.count()>0,`${journey.family} has reviewed required fields`);
  assert.equal(await page.locator('input[name="listingType"]').count(),1,`${journey.family} listing policy`);
  assert.equal(await page.locator('input[name="pricingMode"]').count(),1,`${journey.family} pricing policy`);
  await fillRequiredCategoryFields(page);
  for(let index=0;index<await required.count();index++){
    const control=required.nth(index).locator('input:not([type="hidden"]),select,textarea').first();
    if(await control.count())assert(await control.evaluate(element=>element.checkValidity()),`${journey.family} required field ${index+1}`);
  }
  await page.setViewportSize({width:390,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${journey.family} form mobile overflow`);
  await page.screenshot({path:path.join(artifacts,`schema-family-${journey.family}.png`),fullPage:true});
  console.log(JSON.stringify({journey:'schema-family-form',family:journey.family,status:'passed',fields:await fields.count(),required:await required.count()}));
}
async function runSchemaFamilyLifecycle(journey,accountId){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.setDefaultTimeout(20000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(origin+'/login?next='+encodeURIComponent('/ads/new'));
    await page.locator('#login-identifier').fill('commerce-preview-'+journey.family);
    await page.locator('#login-password').fill('Preview-only-2026!');
    await page.getByRole('button',{name:'دخول',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/ads/new',{timeout:30000});
    const category=page.locator('select[name="taxonomy_group"]'),subcategory=page.locator('select[name="subcategory_id"]');
    await category.waitFor({state:'visible'});
    const categoryValue=await category.locator('option').evaluateAll((options,pattern)=>options.find(option=>option.value&&new RegExp(pattern).test(option.textContent||''))?.value||'',journey.category.source);
    assert(categoryValue,`${journey.family} lifecycle main category exists`);
    await category.selectOption(categoryValue);
    const leafValue=await subcategory.locator('option').evaluateAll((options,pattern)=>options.find(option=>option.value&&new RegExp(pattern).test(option.textContent||''))?.value||'',journey.leaf.source);
    assert(leafValue,`${journey.family} lifecycle leaf exists`);
    await subcategory.selectOption(leafValue);
    await fillRequiredCategoryFields(page);
    const requiredPrice=page.locator('input[name="price"][required]:visible');
    if(await requiredPrice.count())await requiredPrice.first().fill('100');
    const unique=`${journey.family}-${Date.now()}`;
    const createdTitle=`إعلان اختبار عائلة ${unique}`;
    const editedTitle=`${createdTitle} محدث`;
    await page.locator('[name="title"]').fill(createdTitle);
    await page.locator('[name="detail"]').fill(`إعلان اصطناعي معزول لاختبار دورة ${journey.family} كاملة من الإنشاء حتى البحث المصفى والحذف.`);
    await page.locator('[name="phone"]').fill(accountPhone(accountId));
    await page.locator('[name="pledge"]').check();
    await page.getByRole('button',{name:'نشر الإعلان',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/'&&/^\d+$/.test(url.searchParams.get('published')||''),{timeout:30000});
    const adId=new URL(page.url()).searchParams.get('published');
    assert(adId,`${journey.family} created ad id`);
    await page.goto(origin+`/ads/${adId}`);
    await page.getByText(createdTitle,{exact:true}).first().waitFor({state:'visible'});
    await page.goto(origin+`/ads/${adId}/edit`);
    await page.locator('[name="title"]').fill(editedTitle);
    await page.locator('[name="detail"]').fill(`تم تعديل إعلان عائلة ${journey.family} داخل قاعدة الاختبار المعزولة.`);
    await page.locator('[name="pledge"]').check();
    await page.getByRole('button',{name:'حفظ التعديلات',exact:true}).click();
    await page.waitForURL(url=>url.pathname===`/ads/${adId}`,{timeout:30000});
    await page.getByText(editedTitle,{exact:true}).first().waitFor({state:'visible'});
    const searchParams=new URLSearchParams({q:editedTitle});
    searchParams.set('category',categoryValue);
    searchParams.set('subcategory',leafValue);
    await page.goto(origin+'/search?'+searchParams.toString());
    await page.getByText(editedTitle,{exact:true}).first().waitFor({state:'visible'});
    assert.equal(await page.locator('select[name="category"]').inputValue(),categoryValue);
    assert.equal(await page.locator('select[name="subcategory"]').inputValue(),leafValue);
    await page.goto(origin+`/ads/${adId}`);
    const deleteForm=page.locator(`form:has(input[name="adId"][value="${adId}"])`).filter({has:page.getByRole('button',{name:/حذف/})}).first();
    await deleteForm.getByRole('button',{name:/حذف/}).click();
    await page.getByRole('dialog').getByRole('button',{name:'موافق',exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/account/ads',{timeout:30000});
    assert.equal(await page.getByText(editedTitle,{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({journey:'schema-family-lifecycle',family:journey.family,status:'passed',adId,categoryValue,leafValue}));
  }finally{
    await context.close();
  }
}
async function run(){
  await mkdir(artifacts,{recursive:true});
  const url=new URL(database);
  if(url.hostname!=='127.0.0.1'||url.port!=='33309'||url.pathname!=='/trbhh_commerce_preview_20260919')throw Error('Refusing non-isolated browser preview DB');
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE,NODE_ENV:'production',DATABASE_URL:database,AUTH_SECRET:randomUUID()+randomUUID(),REDIS_URL:'',NEXT_TELEMETRY_DISABLED:'1',SUPPLIER_ALLOW_LIVE_ORDERS:'false'};
  server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','4197'],{cwd:repo,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error('Server exited: '+logs.slice(-2000));
    try{await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)});break;}catch{await new Promise(r=>setTimeout(r,200));}
    if(i===99)throw Error('Server readiness timeout');
  }
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const role of ['member','admin']){
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    if(role==='member')await context.addInitScript(()=>{
      window.__geoCalls=Number(sessionStorage.getItem('preview_geo_calls')||0);
      Object.defineProperty(navigator,'geolocation',{configurable:true,value:{getCurrentPosition(success,error){
        window.__geoCalls+=1;sessionStorage.setItem('preview_geo_calls',String(window.__geoCalls));
        const mode=sessionStorage.getItem('preview_geo_mode')||'success';
        if(mode==='denied')return error({code:1});
        if(mode==='unavailable')return error({code:2});
        if(mode==='timeout')return error({code:3});
        success({coords:{latitude:24.713612,longitude:46.675312}});
      }}});
    });
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/login?next='+encodeURIComponent(role==='admin'?'/admin/categories':'/ads/new'));
    await page.locator('#login-identifier').fill('commerce-preview-'+role);
    await page.locator('#login-password').fill('Preview-only-2026!');
    await page.getByRole('button',{name:'دخول',exact:true}).click();
    await page.waitForURL(u=>u.pathname===(role==='admin'?'/admin/categories':'/ads/new'),{timeout:30000});
    if(role==='member'){
      assert.equal(await page.evaluate(()=>window.__geoCalls),0,'geolocation is not requested on page load');
      await page.evaluate(()=>sessionStorage.setItem('preview_geo_mode','denied'));
      await page.getByRole('button',{name:'استخدام موقعي الحالي',exact:true}).click();
      await page.getByText(/لم تسمح بمشاركة الموقع/).waitFor({state:'visible'});
      await page.evaluate(()=>sessionStorage.setItem('preview_geo_mode','success'));
      await page.getByRole('button',{name:'استخدام موقعي الحالي',exact:true}).click();
      await page.getByText(/تم تحديد الموقع/).waitFor({state:'visible'});
      await page.locator('input[name="show_exact_location_publicly"]').check();
      assert.equal((await page.locator('body').innerText()).includes('24.713612'),false,'raw latitude is not displayed');
      const cat=page.locator('select[name="taxonomy_group"]');
      const sub=page.locator('select[name="subcategory_id"]');
      await cat.waitFor({state:'visible'});
      const jobs=await cat.locator('option').evaluateAll(os=>os.find(o=>o.textContent.includes('وظائف'))?.value);
      assert(jobs,'jobs category exists');await cat.selectOption(jobs);
      const job=await sub.locator('option').evaluateAll(os=>os.find(o=>o.value)?.value);
      await sub.selectOption(job);
      assert.equal(await page.locator('[name="price"]').count(),0);
      assert.equal(await page.locator('[name="condition"]').count(),0);
      assert.equal(await page.locator('#category-field-job_title').count(),1);
      await page.screenshot({path:path.join(artifacts,'job-form-desktop.png'),fullPage:true});
      const unique=Date.now();
      const createdTitle=`وظيفة محاسب اختبار شامل ${unique}`;
      const editedTitle=`${createdTitle} محدث`;
      await page.locator('[name="title"]').fill(createdTitle);
      await page.locator('[name="detail"]').fill('إعلان اصطناعي معزول لاختبار رحلة الإنشاء والتفاصيل والتعديل والبحث والحذف دون المساس بأي بيانات حقيقية.');
      await fillRequiredCategoryFields(page);
      await page.locator('#category-field-job_title').fill('محاسب اختبار');
      await page.locator('[name="phone"]').fill('0500000002');
      await page.locator('[name="pledge"]').check();
      await page.getByRole('button',{name:'نشر الإعلان',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/'&&/^\d+$/.test(u.searchParams.get('published')||''),{timeout:30000});
      const adId=new URL(page.url()).searchParams.get('published');
      assert(adId,'created ad id');
      console.log(JSON.stringify({journey:'create-ad',status:'passed',adId}));
      await page.goto(origin+`/ads/${adId}`);
      await page.getByText(createdTitle,{exact:true}).first().waitFor({state:'visible'});
      await page.getByRole('link',{name:'الاتجاهات إلى الموقع',exact:true}).waitFor({state:'visible'});
      await page.getByRole('button',{name:'احسب المسافة',exact:true}).click();
      await page.getByText(/يبعد عنك تقريبًا/).waitFor({state:'visible'});
      await page.screenshot({path:path.join(artifacts,'synthetic-ad-details.png'),fullPage:true});
      await assertResponsive(page,'ad details');
      console.log(JSON.stringify({journey:'ad-details',status:'passed',adId}));
      const callsBeforeEdit=await page.evaluate(()=>window.__geoCalls);
      await page.goto(origin+`/ads/${adId}/edit`);
      await assertResponsive(page,'edit ad');
      await page.getByText(/يوجد موقع محدد لهذا الإعلان/).waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>window.__geoCalls),callsBeforeEdit,'edit does not request geolocation automatically');
      await page.getByRole('button',{name:'إزالة الموقع الدقيق',exact:true}).click();
      await page.locator('[name="title"]').fill(editedTitle);
      await page.locator('[name="detail"]').fill('تم تعديل الإعلان الاصطناعي داخل قاعدة الاختبار المعزولة للتحقق من دورة الحياة كاملة.');
      await page.locator('[name="pledge"]').check();
      await page.getByRole('button',{name:'حفظ التعديلات',exact:true}).click();
      await page.waitForURL(u=>u.pathname===`/ads/${adId}`,{timeout:30000});
      await page.getByText(editedTitle,{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.getByText('موقع الإعلان',{exact:true}).count(),0,'removed exact location is absent from details');
      console.log(JSON.stringify({journey:'edit-ad',status:'passed',adId}));
      const jobSearchParams=new URLSearchParams({q:editedTitle,category:jobs,subcategory:job});
      await page.goto(origin+'/search?'+jobSearchParams.toString());
      await page.getByText(editedTitle,{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.locator('select[name="category"]').inputValue(),jobs);
      assert.equal(await page.locator('select[name="subcategory"]').inputValue(),job);
      console.log(JSON.stringify({journey:'search-ad',status:'passed',adId}));
      await page.goto(origin+`/ads/${adId}`);
      const deleteForm=page.locator(`form:has(input[name="adId"][value="${adId}"])`).filter({has:page.getByRole('button',{name:/حذف/})}).first();
      await deleteForm.getByRole('button',{name:/حذف/}).click();
      await page.getByRole('dialog').getByRole('button',{name:'موافق',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/account/ads',{timeout:30000});
      assert.equal(await page.getByText(editedTitle,{exact:true}).count(),0);
      await assertResponsive(page,'account ads');
      console.log(JSON.stringify({journey:'delete-ad',status:'passed',adId}));
      await page.goto(origin+'/ads/new');
      await page.evaluate(()=>sessionStorage.setItem('preview_geo_mode','timeout'));
      await page.getByRole('button',{name:'استخدام موقعي الحالي',exact:true}).click();
      await page.getByText(/مهلة تحديد الموقع/).waitFor({state:'visible'});
      assert.equal(await page.locator('[name="title"]').count(),1,'timeout does not block the create form');
      await cat.waitFor({state:'visible'});
      const property=await cat.locator('option').evaluateAll(os=>os.find(o=>o.textContent.includes('عقار'))?.value);
      await cat.selectOption(property);
      const land=await sub.locator('option').evaluateAll(os=>os.find(o=>/أرض|أراض/.test(o.textContent))?.value);
      await sub.selectOption(land);
      assert.equal(await page.locator('#category-field-job_title').count(),0);
      assert((await page.locator('[id^="category-field-"]').count())>=6);
      assert.equal(await page.locator('#category-field-area_m2').getAttribute('required'),'');
      assert((await page.locator('[data-field-group]').count())>0);
      const requiredArea=page.locator('[data-field-key="area_m2"]');
      assert.equal(await requiredArea.getAttribute('data-required'),'true');
      assert((await requiredArea.getAttribute('class')).includes('bg-red-50/70'));
      const optionalField=page.locator('[data-required="false"]').first();
      assert(await optionalField.count(),'optional category field exists');
      assert((await optionalField.getAttribute('class')).includes('bg-emerald-50/60'));
      await page.locator('#category-field-area_m2').evaluate(element=>element.reportValidity());
      assert.equal(await requiredArea.getAttribute('data-invalid'),'true');
      assert((await requiredArea.getAttribute('class')).includes('border-red-500'));
      assert((await page.getByText('مطلوب',{exact:true}).count())>0);
      assert((await page.getByText('اختياري',{exact:true}).count())>0);
      const commercial=await sub.locator('option').evaluateAll(os=>os.find(o=>/محلات|مكاتب|مستودعات/.test(o.textContent))?.value);
      await sub.selectOption(commercial);
      assert.equal(await page.locator('#category-field-frontage_m').count(),1);
      assert.equal(await page.locator('#category-field-ceiling_height_m').count(),1);
      assert.equal(await page.locator('#category-field-north_boundary').count(),0);
      await assertResponsive(page,'add form');
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:path.join(artifacts,'land-form-mobile.png'),fullPage:true});
      for(const journey of schemaFamilies)await reviewSchemaFamilyForm(page,journey);
      console.log(JSON.stringify({schemaFamilyJourneys:schemaFamilies.length,status:'passed'}));
      await page.goto(origin+'/ads/1');
      await page.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.getByText('مستعمل',{exact:true}).count(),0);
      await page.goto(origin+'/admin/suppliers');
      await page.waitForURL(u=>u.pathname==='/');
      assert.equal(await page.locator('[name="apiCredentialRef"]').count(),0);
      await page.goto(origin+'/logout');
      await page.waitForURL(u=>u.pathname==='/'||u.pathname==='/login');
      await page.goto(origin+'/account');
      await page.waitForURL(u=>u.pathname==='/login');
      console.log(JSON.stringify({journey:'logout-and-auth-guard',status:'passed'}));
    }else{
      await page.getByRole('heading',{name:'إدارة الأقسام والحقول',exact:true}).waitFor({state:'visible',timeout:30000});
      await page.locator('summary').filter({hasText:/^وظائف —/}).click();
      await page.locator('summary').filter({hasText:/^فرص عمل —/}).click();
      const editor=page.locator('form').filter({has:page.locator('input[name="name"][value="فرص عمل"]')});
      const editableFields=editor.locator('fieldset').filter({has:page.getByRole('button',{name:/إزالة من التعريف/})});
      const before=await editableFields.count();
      for(let n=0;n<3;n++){
        await editor.getByRole('button',{name:'إضافة حقل',exact:true}).click();
        await editableFields.nth(before+n).waitFor({state:'visible'});
      }
      await editableFields.nth(before+1).getByRole('button',{name:/إزالة من التعريف/}).click();
      assert.equal(await editableFields.count(),before+2);
      await editor.getByRole('button',{name:'إضافة حقل',exact:true}).click();
      await editableFields.nth(before+2).waitFor({state:'visible'});
      const edited=JSON.parse(await editor.locator('[name="fields_json"]').inputValue());
      assert.equal(new Set(edited.map(f=>f.key)).size,edited.length,'field keys remain unique after deletion');
      // Client-only interaction: do not save these empty test fields.
      await page.screenshot({path:path.join(artifacts,'categories-admin.png'),fullPage:true});
      await page.goto(origin+'/admin/commerce');
      assert.equal(await page.locator('[name="stockDelta"]').count(),1);
      await page.screenshot({path:path.join(artifacts,'commerce-admin.png'),fullPage:true});
      await page.goto(origin+'/admin/suppliers');
      await page.getByRole('heading',{name:'الموردون وربط السلع',exact:true}).waitFor({state:'visible'});
      await page.locator('summary').filter({hasText:/^إضافة مورد$/}).click();
      const supplierForm=page.getByRole('form',{name:'إضافة مورد',exact:true});
      const supplierName='مورد اختبار محلي '+Date.now();
      supplierNames.push(supplierName);
      assert.equal(await supplierForm.locator('[name="apiEnabled"]').isDisabled(),true);
      assert.equal(await supplierForm.locator('[name="active"]').isChecked(),false);
      await supplierForm.locator('[name="name"]').fill(supplierName);
      await supplierForm.locator('[name="apiBaseUrl"]').fill('https://supplier.example.com/api');
      await supplierForm.locator('[name="apiCredentialRef"]').fill('TRBHH_SUPPLIER_PREVIEW_TOKEN');
      await supplierForm.getByRole('button',{name:'حفظ المورد',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/admin/suppliers'&&u.searchParams.get('saved')==='1');
      const summary=page.locator('summary').filter({hasText:supplierName});
      await summary.waitFor({state:'visible'});
      assert((await summary.innerText()).includes('غير نشط'));
      await summary.click();
      const supplierDetails=summary.locator('..');
      assert.equal(await supplierDetails.locator('[name="apiBaseUrl"]').inputValue(),'https://supplier.example.com/api');
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(artifacts,'suppliers-admin.png'),fullPage:true});
      await supplierDetails.locator('[name="active"]').check();
      await supplierDetails.getByRole('button',{name:'حفظ المورد',exact:true}).click();
      await page.waitForFunction(name=>[...document.querySelectorAll('summary')].some(s=>s.textContent.includes(name)&&!s.textContent.includes('غير نشط')),supplierName);
      assert(!(await page.locator('summary').filter({hasText:supplierName}).innerText()).includes('غير نشط'));
      const activeSummary=page.locator('summary').filter({hasText:supplierName});
      const activeDetails=activeSummary.locator('..');
      if(!await activeDetails.evaluate(el=>el.open))await activeSummary.click();
      assert.equal(await activeDetails.locator('[name="apiEnabled"]').isDisabled(),true);
      await activeDetails.locator('[name="active"]').uncheck();
      await activeDetails.getByRole('button',{name:'حفظ المورد',exact:true}).click();
      await page.waitForFunction(name=>[...document.querySelectorAll('summary')].some(s=>s.textContent.includes(name)&&s.textContent.includes('غير نشط')),supplierName);
      assert((await page.locator('summary').filter({hasText:supplierName}).innerText()).includes('غير نشط'));
      await page.goto(origin+'/admin/commerce/accounts');
      assert((await page.locator('body').innerText()).includes('إيصال')||(await page.locator('body').innerText()).includes('الإيصالات'));
      await page.screenshot({path:path.join(artifacts,'supplier-accounts.png'),fullPage:true});
      await page.goto(origin+'/admin/ad-quality');
      await page.getByRole('heading',{name:'مراجعة جودة الإعلانات',exact:true}).waitFor({state:'visible'});
      assert.equal(await page.locator('form').count(),0,'quality review remains read-only');
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({role,pageErrors:errors.length,checks:'passed',artifacts}));
    await context.close();
  }
  const lifecycleFamilies=schemaFamilies.filter(journey=>journey.family!=='jobs');
  for(const [index,journey] of lifecycleFamilies.entries())await runSchemaFamilyLifecycle(journey,index+3);
  assert.equal(lifecycleFamilies.length+1,schemaFamilies.length,'all schema families complete their lifecycle');
  console.log(JSON.stringify({schemaFamilyLifecycleJourneys:schemaFamilies.length,status:'passed'}));
  const context=await browser.newContext();const page=await context.newPage();
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/shop');
  assert((await page.locator('body').innerText()).includes('سلعة اختبار محلي فقط'));
  for(const name of supplierNames)assert(!(await page.locator('body').innerText()).includes(name),'supplier identity must stay private');
  assert((await page.locator('a[href="/shop/1"]').count())>0,'approved product links remain available');
  await page.goto(origin+'/shop/1');
  await page.waitForURL(u=>u.pathname==='/login');
  console.log(JSON.stringify({journey:'commerce-product-auth-guard',status:'passed'}));
  console.log(JSON.stringify({publicCatalog:'passed',livePayment:'disabled'}));
  // Guest category discovery: same-origin only; uses synthetic preview ads.
  const homeErrors=[];page.on('pageerror',e=>homeErrors.push(e.message));
  await page.setViewportSize({width:360,height:844});
  await page.goto(origin+'/');
  const categorySection=page.getByTestId('home-category-navigation');
  const homeCategory=categorySection.locator('select[name="category"]');
  await homeCategory.waitFor({state:'visible'});
  const options=await homeCategory.locator('option').evaluateAll(os=>os.map(o=>({value:o.value,text:o.textContent})));
  const jobs=options.find(o=>o.value&&o.text.includes('وظائف'))?.value;
  const property=options.find(o=>o.value&&o.text.includes('عقار'))?.value;
  assert(jobs&&property,'guest sees active job and property categories');
  await homeCategory.selectOption(jobs);
  await categorySection.locator('button[type="submit"]').click();
  await page.waitForURL(u=>u.pathname==='/'&&u.searchParams.get('category')===jobs);
  console.log(JSON.stringify({guestCategoryDiagnostic:await categorySection.innerText(),adLinks:await categorySection.locator('a[href^="/ads/"]').evaluateAll(links=>links.map(a=>a.getAttribute('href')))}));
  await page.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(await homeCategory.inputValue(),jobs);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'homepage 360px document overflow');
  assert(await categorySection.evaluate(el=>el.scrollWidth<=el.clientWidth),'category section 360px overflow');
  for(const control of [homeCategory,categorySection.locator('button[type="submit"]'),categorySection.locator('form a[href="/"]')]){
    const box=await control.boundingBox();assert(box&&box.width>0&&box.x>=0&&box.x+box.width<=360,'category control must fit 360px viewport');
  }
  await page.screenshot({path:path.join(artifacts,'home-categories-360.png'),fullPage:true});
  await homeCategory.selectOption(property);
  await categorySection.locator('button[type="submit"]').click();
  await page.waitForURL(u=>u.pathname==='/'&&u.searchParams.get('category')===property);
  assert.equal(await homeCategory.inputValue(),property);
  assert.equal(await page.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).count(),0,'property results must exclude job ad');
  await categorySection.locator('form a[href="/"]').click();
  await page.waitForURL(u=>u.pathname==='/'&&!u.searchParams.has('category'));
  assert.equal(await homeCategory.inputValue(),'');
  assert.equal(await categorySection.locator('form a[href="/"]').count(),0,'cleared filter removes its reset control');
  assert.equal(await page.locator('section[aria-label="السوق"]').count(),1,'cleared filter restores the default feed');
  assert.deepEqual(homeErrors,[]);
  await assertResponsive(page,'homepage');
  for(const route of ['/search','/companies','/login','/register','/forgot']){
    await page.goto(origin+route);
    await assertResponsive(page,route);
  }
  for(const route of ['/pages/about','/pages/faq','/pages/terms','/pages/privacy','/pages/contact','/site-map','/guide']){
    const response=await page.goto(origin+route);
    assert.equal(response?.status(),200,`${route} status`);
    assert(!(await page.locator('body').innerText()).includes('حدث خطأ غير متوقع'),`${route} public error`);
  }
  console.log(JSON.stringify({guestHomeCategories:'passed',selectedCategoryFiltering:'passed',responsiveWidths,clearCategoryFilter:'passed',publicPages:'passed'}));
  await context.close();
}
run().catch(e=>{console.error(e.stack);console.error(logs.slice(-3000));process.exitCode=1;}).finally(async()=>{
  await browser?.close();
  if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}
});
