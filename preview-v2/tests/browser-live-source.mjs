import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {validateSnapshot} from '../lib/snapshot.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const snapshot=validateSnapshot(JSON.parse(readFileSync(process.env.TRBHH_SNAPSHOT_FILE,'utf8')));
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4187';
assert.match(origin,/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
assert.ok(snapshot.count>0);
for(const ad of snapshot.listings)assert.ok(existsSync(new URL(`../out/ads/${ad.id}/index.html`,import.meta.url)),`missing static original ID ${ad.id}`);
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];const blocked=[];const photos=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',route=>{
   const request=route.request();const url=new URL(request.url());
   const publicImage=['trbhh.sa','trbhh.com','www.trbhh.sa','www.trbhh.com'].includes(url.hostname)&&url.pathname.startsWith('/media/')&&request.resourceType()==='image';
   const publicFont=['fonts.googleapis.com','fonts.gstatic.com'].includes(url.hostname)&&['stylesheet','font'].includes(request.resourceType());
   if(['GET','HEAD'].includes(request.method())&&(url.origin===origin||publicImage||publicFont))return route.continue();
   blocked.push({method:request.method(),origin:url.origin,type:request.resourceType()});return route.abort();
 });
 await page.goto(origin+'/');await page.getByText(/لقطة عامة/).first().waitFor();
 assert.equal(await page.getByText('سيارة دفع رباعي، استخدام نظيف',{exact:true}).count(),0);
 await page.goto(origin+'/search/');
 assert.equal(await page.locator('.listing-card').count(),Math.min(48,snapshot.listings.filter(ad=>ad.intent==='offer').length));
 const samples=snapshot.listings.filter(ad=>ad.images.length).slice(0,3);
 assert.ok(samples.length);
 for(const ad of samples){
   await page.goto(origin+`/ads/${ad.id}/`);
   await page.getByRole('heading',{name:ad.title,exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'الإعلان الأصلي',exact:true}).first().getAttribute('href'),ad.sourceUrl);
   assert.equal(await page.locator('.buyer-description p').textContent(),ad.description);
   await page.waitForFunction(()=>{const img=document.querySelector('.buyer-main-image img');return img?.complete&&img.naturalWidth>0;},{},{timeout:25000});
   assert.equal(await page.locator('.buyer-main-image img').getAttribute('src'),ad.images[0]);
   assert.equal(await page.locator('.buyer-thumbnails button').count(),ad.images.length);
   if(ad.images.length>1){await page.getByRole('button',{name:'عرض الصورة 2',exact:true}).click();assert.equal(await page.locator('.buyer-main-image img').getAttribute('src'),ad.images[1]);}
   photos.push(ad.id);
 }
 await page.goto(origin+'/classification/');await page.locator('tbody tr').first().waitFor();
 assert.equal(await page.locator('tbody tr').count(),Math.min(48,snapshot.count));
 const stats=await page.locator('.classification-stats').innerText();assert.ok(stats.includes(String(snapshot.count)));
 await page.getByLabel('تحديد جميع الإعلانات الظاهرة').check();
 await page.getByRole('button',{name:/^تحويل المحدد \(/}).click();await page.getByRole('button',{name:'تأكيد التحويل',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'تنزيل التصنيفات المراجعة JSON'}).click();
 const stream=await (await download).createReadStream();let raw='';for await(const part of stream)raw+=part;
 const exported=JSON.parse(raw);assert.equal(exported.assignments.length,Math.min(48,snapshot.count));
 assert.equal(exported.capturedAt,snapshot.capturedAt);
 await page.getByRole('button',{name:'تراجع عن آخر دفعة',exact:true}).click();
 const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto(origin+'/');await mobile.getByText(/لقطة عامة/).first().waitFor();
 assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 const shots=process.env.SNAPSHOT_QA_DIR;
 if(shots){mkdirSync(shots,{recursive:true});await mobile.screenshot({path:shots+'/home-mobile.png',fullPage:true});await page.goto(origin+'/');await page.screenshot({path:shots+'/home-desktop.png',fullPage:true});}
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 console.log(JSON.stringify({passed:true,publicAds:snapshot.count,originalIdRoutes:snapshot.count,sampledImageAdIds:photos,capturedAt:snapshot.capturedAt,productionMutationRequests:0}));
}finally{await browser.close();}
