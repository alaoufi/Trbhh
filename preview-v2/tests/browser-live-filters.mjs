import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:4188';
assert.match(origin,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+'/search/');await page.getByText(/لقطة عامة/).first().waitFor();
 const count=await page.locator('.results-top b').innerText();
 const failures=[];
 if(await page.getByRole('button',{name:'جديد',exact:true}).count())failures.push('live condition controls must be absent');
 if(await page.getByLabel('إعلانات مميزة فقط').count())failures.push('live featured control must be absent');
 assert.equal(await page.getByLabel('موثق بحسب المصدر').count(),1);
 assert.equal(await page.getByLabel('الجوال موثق').count(),0);
 await page.goto(origin+'/search/?featured=1');
 assert.equal(await page.locator('.results-top b').innerText(),count,'unsupported featured query must not filter live listings');
 assert.deepEqual(failures,[]);
 console.log('PASS live controls omit unknown attributes and ignore featured query');
}finally{await browser.close();}
