import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4188';
assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser=await chromium.launch({channel:'msedge',headless:true});
const failures=[];
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 async function scenario(name,run){try{await run();console.log('PASS '+name);}catch(error){failures.push(name+': '+error.message);}}
 for(const filter of ['minimum','maximum','verified'])await scenario('wanted ignores hidden offer '+filter,async()=>{
  await page.goto(origin+'/search/');
  await page.getByLabel('البحث في الإعلانات').fill('عرض');
  await page.getByLabel('البحث في الإعلانات').fill('');
  if(filter==='minimum')await page.getByLabel('أقل سعر').fill('10000');
  if(filter==='maximum')await page.getByLabel('أعلى سعر').fill('1');
  if(filter==='verified')await page.getByLabel('موثق بحسب المصدر').check();
  await page.getByRole('button',{name:'مطلوب الآن',exact:true}).click();
  assert.equal(await page.locator('.search-results .listing-card').count(),1);
 });
 await scenario('wanted card is labelled',async()=>{
  await page.goto(origin+'/search/?intent=wanted');
  assert.equal(await page.locator('.listing-card').getByText('مطلوب',{exact:true}).count(),1);
 });
 await scenario('wanted detail is labelled and cannot recommend offers',async()=>{
  await page.goto(origin+'/ads/9054/');
  assert.equal(await page.locator('.buyer-related .listing-card').count(),0);
  assert.equal(await page.locator('.buyer-listing-badges').getByText('مطلوب',{exact:true}).count(),1);
 });
 await scenario('offer detail keeps same-intent recommendations',async()=>{
  await page.goto(origin+'/ads/9000/');
  assert.equal(await page.locator('.buyer-related .listing-card').count(),4);
  assert.equal(await page.locator('.buyer-related a[href="/ads/9054/"]').count(),0);
 });
 assert.deepEqual(failures,[]);
}finally{await browser.close();}
