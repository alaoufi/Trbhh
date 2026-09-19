import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.PREVIEW_TEST_BASE || 'http://127.0.0.1:4192';
const origin = new URL(base);
assert.equal(origin.hostname,'127.0.0.1'); assert.equal(origin.port,'4192');
const password = process.env.PREVIEW_LOGIN_PASSWORD;
assert.ok(password && password.length >= 12,'Explicit local sandbox login password required');
const browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})});
let account;
let ownsTestState=false;
// Chromium treats loopback as trustworthy for Secure cookies; the separate
// Playwright HTTP client does not. Exercise authenticated fetch in the browser.
async function stateRequest(context, method='GET', data) {
  const page=context.pages().find(page=>page.url().startsWith(base));
  assert.ok(page,'An authenticated browser page is required');
  return page.evaluate(async ({method,data})=>{
    const response=await fetch('/api/preview-state',{method,headers:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
    return {status:response.status,body:await response.json()};
  },{method,data});
}
async function login(context,user='preview') {
  const page=await context.newPage();
  page.on('pageerror',error=>console.error('Sandbox browser error:',error.message));
  await page.goto(base+'/login?next=%2Fads%2Fnew');
  await page.locator('input[name="identifier"]').fill(user);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button',{name:'دخول',exact:true}).click();
  await page.waitForURL('**/ads/new');
  try { await page.getByLabel('القسم الرئيسي').waitFor(); }
  catch(error) { console.error('Sandbox page state:',(await page.locator('body').innerText()).slice(-1200)); console.error('Cookie names:',(await context.cookies()).map(cookie=>cookie.name)); throw error; }
  return page;
}
try {
  const guest=await browser.newContext();
  assert.equal((await guest.request.get(base+'/api/preview-state')).status(),401);
  for (const path of ['/admin','/api/pay/callback/test','/wallet','/register']) assert.equal((await guest.request.get(base+path)).status(),404,path);
  assert.equal((await guest.request.post(base+'/ads/new')).status(),405);
  const home=await guest.newPage();
  await home.goto(base);
  assert.equal(await home.locator('html').getAttribute('data-design'),null);
  assert.match(await home.locator('body').innerText(),/بيئة اختبار مستقلة/);
  assert.equal(await home.locator('a[href^="tel:"],a[href^="https://wa.me/"]').count(),0);
  const firstAd=home.locator('a[href^="/ads/"]').filter({has:home.locator('img')}).first();
  await firstAd.waitFor();
  await firstAd.click();
  await home.waitForURL(/\/ads\/\d+/);
  const photo=home.locator('img[src*="snapshot-media"]').first();
  await photo.waitFor();
  await photo.evaluate(image=>image.decode());
  assert.ok(await photo.evaluate(image=>image.naturalWidth>0));
  assert.equal(await home.locator('a[href^="tel:"],a[href^="https://wa.me/"]').count(),0);
  await guest.close();
  account=await browser.newContext({viewport:{width:390,height:844}});
  const page=await login(account);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const initialResponse=await stateRequest(account);
  assert.equal(initialResponse.status,200);
  const initial=initialResponse.body;
  assert.equal((initial.values['seller-ads-v1']||[]).length,0,'Refusing non-empty test account');
  assert.equal(initial.values['ad-draft-v1']||null,null,'Refusing existing user draft');
  assert.deepEqual(initial.values['field-settings-v1']||{},{},'Refusing existing field settings');
  const form={intent:'wanted',category:'أخرى',subcategory:'كتب',title:'اختبار حفظ قاعدة مستقلة',description:'وصف تجريبي طويل لاختبار الحفظ الحقيقي وإعادة الفتح على خادم التجربة.',region:'الرياض',city:'الرياض',price:'',condition:'',images:[],spec1:'',spec2:'',details:{}};
  const put=await stateRequest(account,'PUT',{ownerId:initial.ownerId,key:'ad-draft-v1',value:{version:1,form,step:0,editingId:null,savedAt:Date.now()},revision:initial.revisions['ad-draft-v1']||0});
  assert.equal(put.status,200);
  ownsTestState=true;
  await page.reload();
  await page.getByLabel('عنوان الإعلان').fill('اختبار الحفظ من النموذج');
  await page.getByRole('button',{name:'حفظ المسودة',exact:true}).click();
  await page.getByText('المسودة محفوظة',{exact:true}).waitFor();
  await account.close();
  account=await browser.newContext({viewport:{width:390,height:844}});
  const fresh=await login(account);
  assert.equal(await fresh.getByLabel('عنوان الإعلان').inputValue(),'اختبار الحفظ من النموذج');
  assert.equal(await fresh.evaluate(()=>localStorage.getItem('trbhh-v2-ad-draft-v1')),null);
  assert.equal(await fresh.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const state=(await stateRequest(account)).body;
  const cookieHeader=(await account.cookies()).map(cookie=>`${cookie.name}=${cookie.value}`).join('; ');
  assert.equal((await account.request.put(base+'/api/preview-state',{headers:{origin:'https://evil.example',cookie:cookieHeader},data:{ownerId:state.ownerId,key:'ad-draft-v1',value:null,revision:state.revisions['ad-draft-v1']}})).status(),403);
  assert.equal((await stateRequest(account,'PUT',{ownerId:state.ownerId,key:'ad-draft-v1',value:null,revision:0})).status,409);
  await fresh.getByRole('button',{name:'نشر تجريبي',exact:true}).click();
  await fresh.locator('.seller-complete').waitFor();
  await fresh.goto(base+'/seller');
  await fresh.getByRole('button',{name:'إيقاف اختبار الحفظ من النموذج',exact:true}).click();
  await fresh.reload();
  await fresh.getByRole('button',{name:'إعادة تنشيط اختبار الحفظ من النموذج',exact:true}).waitFor();
  await fresh.goto(base+'/field-settings');
  await fresh.getByLabel('اسم الحقل الجديد').fill('حقل اختبار الحفظ');
  await fresh.getByLabel('نوع الحقل',{exact:true}).selectOption('multi');
  await fresh.getByLabel('الخيار 1',{exact:true}).fill('خيار أول');
  await fresh.getByLabel('الخيار 2',{exact:true}).fill('خيار ثانٍ');
  await fresh.getByRole('button',{name:'إضافة الحقل',exact:true}).click();
  await fresh.getByRole('button',{name:'حفظ إعدادات الحقول',exact:true}).click();
  await fresh.getByText('حُفظت إعدادات الحقول لحسابك على خادم التجربة.',{exact:true}).waitFor();
  await fresh.reload();
  assert.equal(await fresh.getByLabel('اسم حقل اختبار الحفظ',{exact:true}).inputValue(),'حقل اختبار الحفظ');
  const other=await browser.newContext();await login(other,'preview-store');
  const otherState=(await stateRequest(other)).body;
  assert.deepEqual(otherState.values,{});
  assert.equal((await stateRequest(other,'PUT',{ownerId:state.ownerId,key:'ad-draft-v1',value:null,revision:0})).status,403);
  await other.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: original shell/photos, guest isolation, real login, database save, fresh-session persistence, publish/status, field settings, CSRF, revision conflict, owner binding, separate accounts, mobile');
} finally {
  if(account && ownsTestState) {
    const response=await stateRequest(account);
    if(response.status===200) {
      const state=response.body;
      for (const [key,value] of [['seller-ads-v1',[]],['ad-draft-v1',null],['field-settings-v1',{}]]) {
        if(state.revisions[key]) assert.equal((await stateRequest(account,'PUT',{ownerId:state.ownerId,key,value,revision:state.revisions[key]})).status,200);
      }
    }
  }
  await browser.close();
}
