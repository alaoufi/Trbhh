const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const origin=process.env.HOME_SEARCH_TEST_URL;
if(!origin)throw new Error('HOME_SEARCH_TEST_URL is required');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const width of [360,390,412,1440]){
      const context=await browser.newContext({viewport:{width,height:900}});
      const page=await context.newPage();
      await page.goto(origin,{waitUntil:'networkidle'});
      const toggle=page.getByRole('button',{name:'بحث متقدم',exact:true});
      const form=page.getByRole('search').filter({has:toggle});
      const panel=page.locator(`[id="${await toggle.getAttribute('aria-controls')}"]`);
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert(await form.locator('[name="q"]').isVisible());
      assert.equal(await panel.evaluate(el=>el.getBoundingClientRect().height),0);
      assert.equal(await form.locator('[name="city"]').isVisible(),false);
      await toggle.click();
      await form.locator('[name="city"]').selectOption({index:1});
      await form.locator('[name="area"]').selectOption({index:1});
      await form.locator('[name="type"]').selectOption('offer');
      await form.locator('[name="minPrice"]').fill('150');
      await form.locator('[name="maxPrice"]').fill('900');
      const before=await form.evaluate(el=>Object.fromEntries(new FormData(el)));
      await toggle.click();
      await page.waitForFunction(id=>document.getElementById(id).getBoundingClientRect().height===0,await toggle.getAttribute('aria-controls'));
      assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.deepEqual(await form.evaluate(el=>Object.fromEntries(new FormData(el))),before);
      await toggle.click();
      assert.equal(await form.locator('[name="minPrice"]').inputValue(),'150');
      assert.equal(await form.locator('[name="maxPrice"]').inputValue(),'900');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await toggle.click();
      await Promise.all([page.waitForURL('**/search?**'),form.getByRole('button',{name:'بحث',exact:true}).click()]);
      const query=new URL(page.url()).searchParams;
      for(const key of ['city','area','type','minPrice','maxPrice'])assert.equal(query.get(key),before[key]);
      assert(await page.locator('form[role="search"] [name="minPrice"]').isVisible());
      console.log(`PASS ${width}: collapsed SSR/hydration, toggle, retained values, GET search, no overflow`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
