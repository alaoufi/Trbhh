'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin=process.env.FINAL_GATE_ORIGIN;
const run=process.env.FINAL_GATE_RUN;
const attempt=process.env.GITHUB_RUN_ID;
const password=process.env.FINAL_GATE_PASSWORD;
const production=process.env.FINAL_GATE_PRODUCTION==='1';
assert(origin===(production?'https://trbhh.sa':'http://localhost:4197')&&/^\d+$/.test(run)&&password,'explicit smoke configuration');
async function requiredFields(page){
  const fields=page.locator('[data-field-key][data-required="true"]');
  for(let i=0;i<await fields.count();i++){
    const c=fields.nth(i).locator('input:not([type="hidden"]),select,textarea').first();
    if(!await c.count())continue;
    if(await c.evaluate(e=>e.tagName)==='SELECT'){
      const value=await c.locator('option').evaluateAll(opts=>opts.find(o=>o.value&&!o.disabled)?.value);
      if(value)await c.selectOption(value);
    }else{
      const type=await c.getAttribute('type');
      if(type==='checkbox'||type==='radio')await c.check();
      else if(type==='number')await c.fill((await c.getAttribute('min'))||'1');
      else if(type==='date')await c.fill('2026-10-02');
      else await c.fill('بيانات اختبار الإطلاق');
    }
  }
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const gps of production?[false]:[false,true]){
      const context=await browser.newContext({viewport:{width:390,height:844}});
      await context.addInitScript(()=>{
        window.__geoCalls=0;
        Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'prompt'})}});
        Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success){window.__geoCalls++;success({coords:{latitude:24.713612,longitude:46.675312}})}}});
      });
      const page=await context.newPage();page.setDefaultTimeout(20000);
      const go=url=>page.goto(url,{waitUntil:'domcontentloaded'});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      for(const route of gps?[]:['/','/search','/companies','/nearby']){
        const r=await page.goto(origin+route,{waitUntil:'domcontentloaded'});
        assert.equal(r.status(),200,route);
        await page.locator('main').waitFor();
        assert(!(await page.locator('body').innerText()).includes('حدث خطأ غير متوقع'),route);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' mobile overflow');
        assert.equal(await page.evaluate(()=>window.__geoCalls),0,'no automatic permission prompt');
        console.log('PASS public '+route+' mobile390');
      }
      await go(origin+'/login?next=%2Fads%2Fnew');
      await page.locator('#login-identifier').fill(`finalgate-${run}-${attempt}-${gps?1:0}`);
      await page.locator('#login-password').fill(password);
      await page.getByRole('button',{name:'دخول',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/ads/new',{waitUntil:'domcontentloaded'});
      console.log('PASS login');
      const group=page.locator('select[name="taxonomy_group"]');
      await group.waitFor();
      const groupValue=await group.locator('option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('وظائف'))?.value);
      assert(groupValue,'jobs taxonomy available');await group.selectOption(groupValue);
      const leaf=page.locator('select[name="subcategory_id"]');
      await page.waitForFunction(()=>Array.from(document.querySelector('select[name="subcategory_id"]')?.options||[]).some(o=>o.value));
      const leafValue=await leaf.locator('option').evaluateAll(opts=>opts.find(o=>o.value)?.value);
      assert(leafValue);await leaf.selectOption(leafValue);
      await page.locator('#category-field-job_title').waitFor();
      await requiredFields(page);
      const fixtureId=()=>require('node:crypto').randomBytes(5).toString('hex');
      const title=`اختبار تقني ${gps?'محاسب':'منسق'} ${fixtureId()} ${fixtureId()} ${fixtureId()}`;
      await page.locator('[name="title"]').fill(title);
      await page.locator('[name="detail"]').fill('بيانات اختبار اصطناعية معزولة وليست فرصة عمل حقيقية. معرفات الحالة المستقلة: '+Array.from({length:20},fixtureId).join(' '));
      await page.locator('#category-field-job_title').fill(gps?'محاسب':'منسق');
      await page.locator('[name="phone"]').fill(gps?'0500000002':'0500000001');
      await page.locator('[name="pledge"]').check();
      if(gps){
        await page.getByRole('button',{name:'استخدام موقعي الحالي',exact:true}).click();
        await page.getByText(/تم تحديد الموقع/).waitFor();
        assert.equal(await page.locator('[name="lat"]').inputValue(),'24.713612');
        await page.locator('[name="show_exact_location_publicly"]').check();
      }else assert.equal(await page.locator('[name="lat"]').inputValue(),'');
      await page.getByRole('button',{name:'نشر الإعلان',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/'&&/^\d+$/.test(u.searchParams.get('published')||''),{waitUntil:'domcontentloaded'});
      const id=new URL(page.url()).searchParams.get('published');
      console.log('PASS create '+(gps?'GPS':'withoutGPS')+' id='+id);
      await go(origin+'/ads/'+id);
      await page.getByText(title,{exact:true}).first().waitFor();
      if(gps)assert((await page.getByRole('link',{name:'الاتجاهات إلى الموقع',exact:true}).getAttribute('href')).includes('destination=24.713612'));
      await go(origin+'/ads/'+id+'/edit');
      assert.equal(await page.evaluate(()=>window.__geoCalls),0,'edit does not request GPS');
      await page.locator('[name="title"]').fill(title+' مراجع');
      await page.locator('[name="pledge"]').check();
      await page.getByRole('button',{name:'حفظ التعديلات',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/ads/'+id,{waitUntil:'domcontentloaded'});
      await page.getByText(title+' مراجع',{exact:true}).first().waitFor();
      console.log('PASS details/edit '+id);
      const response=await go(origin+'/search?q='+encodeURIComponent(title)+'&subcategory='+encodeURIComponent(leafValue));
      assert.equal(response.status(),200);
      assert(!(await page.locator('body').innerText()).includes('حدث خطأ غير متوقع'));
      await page.locator('a[href="/ads/'+id+'"]').first().waitFor();
      console.log('PASS search/filter finds created ad');
      // Delete only this newly created test ad using the member's own normal UI.
      await go(origin+'/ads/'+id);
      const deleteForm=page.locator('form:has(input[name="adId"][value="'+id+'"])').filter({has:page.getByRole('button',{name:/حذف/})}).first();
      await deleteForm.getByRole('button',{name:/حذف/}).click();
      await page.getByRole('dialog').getByRole('button',{name:'موافق',exact:true}).click();
      await page.waitForURL(u=>u.pathname==='/account/ads',{waitUntil:'domcontentloaded'});
      console.log('PASS removed own new test ad '+id);
      await go(origin+'/logout');
      await go(origin+'/account');
      await page.waitForURL(u=>u.pathname==='/login',{waitUntil:'domcontentloaded'});
      console.log('PASS logout');
      assert.deepEqual(errors,[],'no browser runtime errors');
      await context.close();
    }
    console.log(production?'FINAL_PRODUCTION_SMOKE_PASS':'FINAL_ISOLATED_SMOKE_PASS');
  }finally{await browser.close();}
})().catch(e=>{console.error('FINAL_SMOKE_FAIL',e.message);process.exitCode=1;});
