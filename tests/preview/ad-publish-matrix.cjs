'use strict';
// All writes are confined to the disposable CI database. Never accepts a VPS URL.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {mkdir,writeFile}=require('node:fs/promises');
const path=require('node:path');
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const {chromium}=require('playwright');
const database=process.env.COMMERCE_PREVIEW_DATABASE_URL||'';
const url=new URL(database);
assert(url.protocol==='mysql:'&&url.hostname==='127.0.0.1'&&url.port==='33309'&&url.pathname==='/trbhh_commerce_preview_20260919'&&!url.search&&!url.hash,'isolated CI database required');
const db=new PrismaClient({datasourceUrl:database,log:[]});
const origin='http://127.0.0.1:4198',repo=path.resolve(__dirname,'../..');
const artifacts=path.join(repo,'artifacts/preproduction-e2e');
const password='Synthetic-pipeline-only-2026!',secret=randomUUID()+randomUUID();
let server,browser,logs='';
const results=[];
async function stop(){if(server&&server.exitCode===null){const done=new Promise(resolve=>server.once('exit',resolve));server.kill();await done;}}
async function start(){
  await stop();
  server=spawn(process.execPath,[path.join(repo,'node_modules/next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','4198'],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,DATABASE_URL:database,AUTH_SECRET:secret,NODE_ENV:'production',REDIS_URL:'',SUPPLIER_ALLOW_LIVE_ORDERS:'false'}});
  server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
  const deadline=Date.now()+30000;
  while(Date.now()<deadline){
    assert(server.exitCode===null,'isolated server exited');
    try{const response=await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)});if(response.ok)return;}catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error('isolated server readiness timeout');
}
async function settings(values){for(const [k,v] of Object.entries(values))await db.site_settings.upsert({where:{k},create:{k,v},update:{v}});}
async function required(page){
  const cards=page.locator('[data-field-key][data-required="true"]');
  for(let i=0;i<await cards.count();i++){
    const controls=cards.nth(i).locator('input:not([type="hidden"]),select,textarea');
    for(let j=0;j<await controls.count();j++){
      const c=controls.nth(j),tag=await c.evaluate(e=>e.tagName),type=await c.getAttribute('type');
      if(tag==='SELECT'){const value=await c.locator('option').evaluateAll(opts=>opts.find(o=>o.value)?.value);if(value)await c.selectOption(value);}
      else if(type==='radio'||type==='checkbox'){if(j===0)await c.check();}
      else await c.fill(type==='number'?(await c.getAttribute('min')||'1'):type==='date'?'2026-10-03':'اختبار');
    }
  }
}
async function run(){
  await mkdir(artifacts,{recursive:true});
  const hash=await bcrypt.hash(password,4);
  const leaf=await db.sub_categories.findFirst({where:{name:{contains:'فرص عمل'}},select:{id:true,category_id:true}});
  assert(leaf,'job fixture required');
  const rows=await db.$queryRaw`SELECT fields_json FROM ad_category_definitions WHERE subcategory_id=${leaf.id}`;
  const definition=typeof rows[0].fields_json==='string'?JSON.parse(rows[0].fields_json):rows[0].fields_json;
  const common={group:'اختبار معزول',required:false,visible:true,options:[]};
  definition.fields.push({...common,key:'pipeline_range',label:'نطاق تجريبي',type:'range',order:90,min:1,max:100},
    {...common,key:'pipeline_toggle',label:'شرط تجريبي',type:'boolean',order:91},
    {...common,key:'pipeline_conditional',label:'قيمة شرطية',type:'number',order:92,min:1,dependsOn:'pipeline_toggle',dependencyOperator:'equals',dependencyValue:true,conditionEffect:'show'});
  await db.$executeRaw`UPDATE ad_category_definitions SET fields_json=${JSON.stringify(definition)} WHERE subcategory_id=${leaf.id}`;
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const testCase of ['A','B','C','D','E','F','G','H','I','J','K']){
    await settings({categories_v2_latest_templates:'0',ads_require_approval:testCase==='G'?'1':'0',schedule_on:testCase==='H'?'1':'0',platform_ad_lifecycle_enabled:'0',commerce_purchasing_enabled:'0'});
    await start(); // Fresh settings cache for each independent policy case.
    const username=`pipeline-${testCase}-${randomUUID()}`;
    const member=await db.users.create({data:{userName:username,name:'عضو اختبار معزول',password:hash,type:'user',country_id:1,auth_session_version:randomUUID()}});
    let storeProfile;
    if(['E','F','K'].includes(testCase)){
      const store=await db.stores.create({data:{user_id:Number(member.id),store_name:'متجر اختبار النشر',status:1,sub_until:new Date(Date.now()+86400000*30)}});
      storeProfile=await db.profiles.create({data:{user_id:member.id,type:'store',store_id:store.id,name:'متجر اختبار النشر'}});
    }
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    const page=await context.newPage();page.setDefaultTimeout(20000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.goto(origin+'/login?next=%2Fads%2Fnew');
      await page.locator('#login-identifier').fill(username);await page.locator('#login-password').fill(password);
      await page.getByRole('button',{name:'دخول',exact:true}).click();await page.waitForURL(u=>u.pathname==='/ads/new');
      assert.equal(await db.profiles.count({where:{user_id:member.id,type:'personal',is_default:1}}),1,'concurrent header/form initialization creates one primary identity');
      if(storeProfile){await context.addCookies([{name:'trbhh_profile',value:String(storeProfile.id),url:origin}]);await page.goto(origin+'/ads/new'+(['F','K'].includes(testCase)?'?dest=store':''));}
      if(testCase==='E')assert.equal(await page.locator('[name="dest"][value="store"]').count(),0,'active store never preselects store publishing');
      const group=page.locator('[name="taxonomy_group"]');
      await page.waitForFunction(()=>{const e=document.querySelector('[name="taxonomy_group"]');return e&&Object.keys(e).some(k=>k.startsWith('__reactProps$')&&e[k]?.onChange)});
      const groupValue=await group.locator('option').evaluateAll(opts=>opts.find(o=>o.textContent.includes('وظائف'))?.value);
      await group.selectOption(groupValue);await page.locator('[name="subcategory_id"]').selectOption(String(leaf.id));
      await page.locator('#category-field-job_title').waitFor();await required(page);
      const title=`اختبار النشر ${testCase} ${randomUUID()}`;
      await page.locator('[name="title"]').fill(title);await page.locator('[name="detail"]').fill(Array.from({length:16},()=>randomUUID()).join(' '));
      await page.locator('[name="phone"]').fill('0500000001');await page.locator('[name="pledge"]').check();
      if(testCase==='C'){for(const [id,value] of [['pipeline_range','10'],['pipeline_range-max','20'],['pipeline_range',''],['pipeline_range-max','']])await page.locator('#category-field-'+id).fill(value);}
      if(testCase==='D'){await page.locator('#category-field-pipeline_toggle').selectOption('true');await page.locator('#category-field-pipeline_conditional').fill('20');await page.locator('#category-field-pipeline_toggle').selectOption('false');assert.equal(await page.locator('#category-field-pipeline_conditional').count(),0);}
      if(testCase==='H')await page.locator('[name="publishAt"]').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
      if(testCase==='I'){
        await db.$executeRaw`INSERT INTO packages (name,ads_per_day,active,is_default) VALUES (${username},1,1,0)`;
        const [pkg]=await db.$queryRaw`SELECT id FROM packages WHERE name=${username}`;
        await db.$executeRaw`INSERT INTO user_packages (user_id,package_id) VALUES (${member.id},${pkg.id})`;
        await db.ad_publish_log.create({data:{user_id:member.id,created_at:new Date()}});
      }
      if(testCase==='J')await page.locator('[name="category_values"]').evaluate(e=>{const v=JSON.parse(e.value);v.job_title={invalid:true};e.value=JSON.stringify(v)});
      if(testCase==='K')await db.stores.update({where:{id:storeProfile.store_id},data:{status:0}});
      await page.getByRole('button',{name:'نشر الإعلان',exact:true}).click();
      if(['I','J','K'].includes(testCase)){
        await page.locator('[data-submission-error]').waitFor();
        assert.equal(await page.locator('[name="title"]').inputValue(),title);
        assert.equal(await db.ads.count({where:{user_id:member.id}}),0);
        if(testCase==='J')assert.equal(await page.evaluate(()=>document.activeElement.id),'category-field-job_title');
        if(testCase==='I'||testCase==='K'){
          await page.reload();await page.locator(`[data-ad-entry-block="${testCase==='I'?'quota':'store'}"]`).waitFor();
          assert.equal(await page.locator('[name="title"]').count(),0,'blocked members never receive the ad form');
          if(testCase==='I')await page.locator('a[href="/account/wallet#topup"]').waitFor();
        }
      }else{
        await page.waitForURL(u=>u.pathname!=='/ads/new');
        const ad=await db.ads.findFirst({where:{user_id:member.id},orderBy:{id:'desc'}});assert(ad,'saved ad');
        const [attributeRow]=await db.$queryRaw`SELECT values_json FROM ad_category_values WHERE ad_id=${ad.id}`;
        const attributes=typeof attributeRow.values_json==='string'?JSON.parse(attributeRow.values_json):attributeRow.values_json;
        assert(!Object.hasOwn(attributes,'pipeline_range'),'untouched/cleared optional range is absent in database');
        assert(!Object.hasOwn(attributes,'pipeline_conditional'),'inactive optional field is absent in database');
        if(testCase==='G'){assert.equal(ad.status,0);assert(new URL(page.url()).searchParams.has('pending'));}
        else if(testCase==='H'){assert.equal(ad.status,0);assert(ad.publish_at>Date.now());assert(new URL(page.url()).searchParams.has('scheduled'));}
        else if(testCase==='F'){assert.equal(ad.store_only,1);assert(await db.store_products.findFirst({where:{ad_id:Number(ad.id)}}));}
        else{
          assert.equal(ad.status,1);assert.equal(ad.store_only,0);
          const response=await page.goto(origin+`/ads/${ad.id}`);assert.equal(response.status(),200);
          await page.getByText(title,{exact:true}).first().waitFor();
          await page.goto(origin+'/search?q='+encodeURIComponent(title)+'&subcategory='+leaf.id);
          await page.locator(`a[href="/ads/${ad.id}"]`).first().waitFor();
          await page.goto(origin+'/account/ads');await page.getByText(title,{exact:true}).first().waitFor();
          await page.getByText('ظاهر في تربح العام',{exact:true}).first().waitFor();
        }
      }
      if(testCase==='A'){
        const duplicate=await db.profiles.create({data:{user_id:member.id,type:'personal',is_default:1,name:'رئيسية مكررة للاختبار'}});
        const extra=await db.profiles.create({data:{user_id:member.id,type:'personal',is_default:0,name:'هوية اختبار الحذف'}});
        await context.addCookies([{name:'trbhh_profile',value:String(extra.id),url:origin}]);
        await page.goto(origin+'/account/profiles');
        assert.equal(await page.locator(`input[name="profileId"][value="${duplicate.id}"]`).count(),0,'duplicate primary omitted without removing historic data');
        assert(await db.profiles.findUnique({where:{id:duplicate.id}}));
          const deleteForm=page.locator('form').filter({has:page.locator(`input[name="profileId"][value="${extra.id}"]`)}).filter({has:page.getByRole('button',{name:'حذف الهوية',exact:true,includeHidden:true})});
        await deleteForm.evaluate(e=>{const d=e.closest('details');if(d)d.open=true});
        await deleteForm.getByRole('button',{name:'حذف الهوية',exact:true}).click();
        await page.getByRole('dialog').getByRole('button',{name:'موافق',exact:true}).click();
        await page.waitForURL(u=>u.searchParams.get('deleted')==='1');
        assert.equal(await db.profiles.findUnique({where:{id:extra.id}}),null);
        assert.equal(await page.locator(`input[name="profileId"][value="${extra.id}"]`).count(),0);
        assert.notEqual((await context.cookies()).find(c=>c.name==='trbhh_profile')?.value,String(extra.id));
      }
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(artifacts,`publish-${testCase}.png`),fullPage:true});
      results.push({case:testCase,status:'PASS'});console.log('PUBLISH_MATRIX_PASS',testCase);
    }finally{await context.close();}
  }
  assert.equal(results.length,11);
  const outcomes=logs.split(/\r?\n/).flatMap(line=>{try{const row=JSON.parse(line);return row.publishTraceId&&row.outcome?[row]:[]}catch{return []}});
  assert.deepEqual(outcomes.map(row=>row.outcome),['PUBLIC_NOW','PUBLIC_NOW','PUBLIC_NOW','PUBLIC_NOW','PUBLIC_NOW','STORE_ONLY','PENDING_APPROVAL','SCHEDULED','REJECTED','REJECTED','REJECTED']);
  assert.equal(new Set(outcomes.map(row=>row.publishTraceId)).size,11,'one trace and one terminal outcome per submission');
  await writeFile(path.join(artifacts,'publish-matrix.json'),JSON.stringify({results,outcomes},null,2));
}
run().catch(error=>{console.error('PUBLISH_MATRIX_FAIL',error.message);process.exitCode=1;}).finally(async()=>{await browser?.close();await stop();await db.$disconnect();});
