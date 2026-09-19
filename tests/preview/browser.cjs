const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdir}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const repo=path.resolve(__dirname,'../..');
const origin='http://127.0.0.1:4197';
const artifacts=path.resolve(repo,'../../../commerce-preview-evidence');
const database='mysql://root:local_disposable_root_only@127.0.0.1:33309/trbhh_commerce_preview_20260919';
let server,browser,logs='';
const supplierNames=[];
async function run(){
  await mkdir(artifacts,{recursive:true});
  const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE,NODE_ENV:'production',DATABASE_URL:database,AUTH_SECRET:randomUUID()+randomUUID(),REDIS_URL:'',NEXT_TELEMETRY_DISABLED:'1'};
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
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.setDefaultTimeout(15000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/login?next='+encodeURIComponent(role==='admin'?'/admin/categories':'/ads/new'));
    await page.locator('#login-identifier').fill('commerce-preview-'+role);
    await page.locator('#login-password').fill('Preview-only-2026!');
    await page.getByRole('button',{name:'دخول',exact:true}).click();
    await page.waitForURL(u=>u.pathname===(role==='admin'?'/admin/categories':'/ads/new'),{timeout:30000});
    if(role==='member'){
      const cat=page.locator('select[name="category_id"]');
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
      const property=await cat.locator('option').evaluateAll(os=>os.find(o=>o.textContent.includes('عقار'))?.value);
      await cat.selectOption(property);
      const land=await sub.locator('option').evaluateAll(os=>os.find(o=>/أرض|أراض/.test(o.textContent))?.value);
      await sub.selectOption(land);
      assert.equal(await page.locator('#category-field-job_title').count(),0);
      assert((await page.locator('[id^="category-field-"]').count())>=6);
      await page.setViewportSize({width:390,height:844});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile overflow');
      await page.screenshot({path:path.join(artifacts,'land-form-mobile.png'),fullPage:true});
      await page.goto(origin+'/ads/1');
      await page.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).first().waitFor({state:'visible'});
      assert.equal(await page.getByText('مستعمل',{exact:true}).count(),0);
      await page.goto(origin+'/admin/suppliers');
      await page.waitForURL(u=>u.pathname==='/');
      assert.equal(await page.locator('[name="apiCredentialRef"]').count(),0);
    }else{
      assert((await page.locator('body').innerText()).includes('إدارة الأقسام والحقول'));
      await page.locator('summary').filter({hasText:/^وظائف —/}).click();
      await page.locator('summary').filter({hasText:/^فرص عمل —/}).click();
      const editor=page.locator('form').filter({has:page.locator('input[name="name"][value="فرص عمل"]')});
      const before=await editor.locator('fieldset').count();
      for(let n=0;n<3;n++)await editor.getByRole('button',{name:'إضافة حقل',exact:true}).click();
      await editor.locator('fieldset').nth(before+1).getByRole('button',{name:'إزالة الحقل'}).click();
      await editor.getByRole('button',{name:'إضافة حقل',exact:true}).click();
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
    }
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({role,pageErrors:errors.length,checks:'passed',artifacts}));
    await context.close();
  }
  const context=await browser.newContext();const page=await context.newPage();
  await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/shop');
  assert((await page.locator('body').innerText()).includes('سلعة اختبار محلي فقط'));
  for(const name of supplierNames)assert(!(await page.locator('body').innerText()).includes(name),'supplier identity must stay private');
  assert.equal(await page.locator('a[href="/shop/1"]').count(),0);
  console.log(JSON.stringify({publicCatalog:'passed',livePayment:'disabled'}));
  // Guest category discovery: same-origin only; uses synthetic preview ads.
  const homeErrors=[];page.on('pageerror',e=>homeErrors.push(e.message));
  await page.setViewportSize({width:320,height:844});
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
  await categorySection.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).first().waitFor({state:'visible'});
  assert.equal(await homeCategory.inputValue(),jobs);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'homepage 320px document overflow');
  assert(await categorySection.evaluate(el=>el.scrollWidth<=el.clientWidth),'category section 320px overflow');
  for(const control of [homeCategory,categorySection.locator('button[type="submit"]'),categorySection.locator('form a[href="/"]')]){
    const box=await control.boundingBox();assert(box&&box.width>0&&box.x>=0&&box.x+box.width<=320,'category control must fit 320px viewport');
  }
  await page.screenshot({path:path.join(artifacts,'home-categories-320.png'),fullPage:true});
  await homeCategory.selectOption(property);
  await categorySection.locator('button[type="submit"]').click();
  await page.waitForURL(u=>u.pathname==='/'&&u.searchParams.get('category')===property);
  assert.equal(await homeCategory.inputValue(),property);
  assert.equal(await categorySection.getByText('وظيفة محاسب — إعلان اختبار محلي',{exact:true}).count(),0,'property results must exclude job ad');
  await categorySection.locator('form a[href="/"]').click();
  await page.waitForURL(u=>u.pathname==='/'&&!u.searchParams.has('category'));
  assert.equal(await homeCategory.inputValue(),'');
  assert.equal(await categorySection.locator('h2').count(),0,'cleared filter removes category result grid');
  assert.deepEqual(homeErrors,[]);
  console.log(JSON.stringify({guestHomeCategories:'passed',selectedCategoryFiltering:'passed',mobileWidth:320,clearCategoryFilter:'passed'}));
  await context.close();
}
run().catch(e=>{console.error(e.stack);console.error(logs.slice(-3000));process.exitCode=1;}).finally(async()=>{
  await browser?.close();
  if(server&&server.exitCode===null){const stopped=new Promise(r=>server.once('exit',r));server.kill();await stopped;}
});
