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
      const panel=page.locator('details[data-home-search]');
      const toggle=panel.locator('summary');
      const form=panel.getByRole('search', {includeHidden:true});
      assert.equal(await toggle.innerText(),'وش تبحث عنه اليوم؟');
      assert.equal(await panel.getAttribute('open'),null);
      for(const name of ['q','city','area','type','minPrice','maxPrice'])assert.equal(await form.locator(`[name="${name}"]`).isVisible(),false);
      assert.equal(await panel.getByText('تصفح حسب التصنيف',{exact:true}).isVisible(),false);
      await toggle.click();
      assert(await form.locator('[name="q"]').isVisible());
      assert(await panel.getByText('تصفح حسب التصنيف',{exact:true}).isVisible());
      await form.locator('[name="q"]').fill('معدات');
      await form.locator('[name="city"]').selectOption({index:1});
      await form.locator('[name="area"]').selectOption({index:1});
      await form.locator('[name="type"]').selectOption('offer');
      await form.locator('[name="minPrice"]').fill('150');
      await form.locator('[name="maxPrice"]').fill('900');
      const before=await form.evaluate(el=>Object.fromEntries(new FormData(el)));
      await toggle.click();
      assert.equal(await panel.getAttribute('open'),null);
      assert.equal(await form.locator('[name="q"]').isVisible(),false);
      assert.deepEqual(await form.evaluate(el=>Object.fromEntries(new FormData(el))),before);
      await toggle.click();
      assert.equal(await form.locator('[name="minPrice"]').inputValue(),'150');
      assert.equal(await form.locator('[name="maxPrice"]').inputValue(),'900');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await Promise.all([page.waitForURL('**/search?**'),form.getByRole('button',{name:'بحث',exact:true}).click()]);
      const query=new URL(page.url()).searchParams;
      for(const key of ['q','city','area','type','minPrice','maxPrice'])assert.equal(query.get(key),before[key]);
      await page.locator('form[role="search"] [name="minPrice"]').waitFor({state:'visible'});
      console.log(`PASS ${width}: collapsed SSR/hydration, toggle, retained values, GET search, no overflow`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
