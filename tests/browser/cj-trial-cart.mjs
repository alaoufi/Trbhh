// Isolated browser test: real React/cart controls, mocked read-only HTTP responses.
// Run: node tests/browser/cj-trial-cart.mjs (requires Playwright Chromium).
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const viteRequire=createRequire(require.resolve('vitest/package.json'));
const {createServer}=await import(pathToFileURL(viteRequire.resolve('vite')).href);
const root=resolve(import.meta.dirname,'../..');
const entry=`import '/src/app/globals.css';import React from 'react';import {createRoot} from 'react-dom/client';import {TrialCart} from '/src/components/cj/trial-cart.tsx';createRoot(document.getElementById('root')).render(React.createElement(TrialCart,{accountId:9,ship:{name:'اختبار',phone:'0500000000',city:'الرياض',region:'الرياض',address1:'عنوان اختبار',address2:''}}));`;
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:0},esbuild:{jsx:'automatic'},resolve:{alias:{'@':resolve(root,'src')}},plugins:[{
 name:'isolated-cart',enforce:'pre',resolveId(id){if(id==='virtual:cart-entry')return '\0cart-entry';if(id==='next/link')return '\0cart-link';if(id==='@/app/cj/cart/actions'||id===resolve(root,'src/app/cj/cart/actions'))return '\0cart-action';},
 load(id){if(id==='\0cart-entry')return entry;if(id==='\0cart-link')return `import React from 'react';export default function Link(props){return React.createElement('a',props);}`;if(id==='\0cart-action')return `export function placeCjTrialOrder(){throw Error('No purchase allowed in isolated test');}`;},
 configureServer(s){s.middlewares.use(async(req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html');res.end(await s.transformIndexHtml('/',`<html lang="ar" dir="rtl"><body><div id="root"></div><script type="module" src="/@id/virtual:cart-entry"></script></body></html>`));});}
}]});
let browser,releaseVerification;
try{
 await server.listen();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const failures=[];page.on('pageerror',error=>failures.push(error.message));
 const snapshot={pid:'test-pid',vid:'blue-s',sku:'SKU',productName:'سلعة اختبار',rawVariantName:'Black',optionKey:'Black',displayLabel:'اللون: أسود',attributes:{},verifiedQuantity:1,unitMinor:1500,stockQuantity:5,shippingName:'Standard',shippingMinor:700,shippingAdditionalMinor:0,vatEnabled:false,vatMinor:0,totalMinor:2200,deliveryDays:'7-12',originCountry:'CN',checkedAt:new Date().toISOString()};
 await page.addInitScript(item=>sessionStorage.setItem('trbhh:cj-trial-cart:v1:9',JSON.stringify([item])),{id:4,qty:1,variantId:'blue-s',snapshot});
 let mode='success',verifyCount=0,quoteCount=0;
 const pendingVerification=new Promise(r=>{releaseVerification=r;});
 await page.route('**/api/cj/trial-cart',async route=>{
  quoteCount++;const {items}=route.request().postDataJSON();
  const lines=items.map(item=>({...item,...item.snapshot,title:'سلعة اختبار',variantName:'Black',variantSku:'SKU',variantStock:5,image:null,currency:'SAR'}));
  await route.fulfill({json:{currency:'SAR',lines,totalMinor:lines.reduce((n,line)=>n+line.totalMinor,0),rejected:[]}});
 });
 await page.route('**/api/cj/products/4/verify-variant',async route=>{
  verifyCount++;const {quantity}=route.request().postDataJSON();if(verifyCount===1)await pendingVerification;
  if(mode==='failure'){await route.fulfill({status:503,json:{error:'verification_failed'}});return;}
  const freight=quantity===2?950:700;
  await route.fulfill({json:{status:'available',salePriceMinor:1500,stockQuantity:5,sku:'SKU',checkedAt:new Date().toISOString(),shippingOptions:[{name:mode==='missing'?'Alternative':'Standard',priceMinor:freight,additionalMinor:0,vatEnabled:false,vatMinor:0,totalMinor:1500*quantity+freight,deliveryDays:'7-12',originCountry:'CN'}]}});
 });
 await page.goto(server.resolvedUrls.local[0]);
 const payment=page.getByRole('form',{name:'إتمام الطلب'});
 await payment.waitFor();assert.match(await payment.innerText(),/22\.00/);
 assert.equal(await page.locator('[dir=rtl]').count()>0,true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=390),true);
 assert.equal(await page.getByRole('heading').evaluate(el=>getComputedStyle(el).color),'rgb(22, 41, 75)');
 if(process.env.CJ_CART_SCREENSHOT)await page.screenshot({path:process.env.CJ_CART_SCREENSHOT,fullPage:true});
 await page.getByRole('button',{name:'زيادة كمية'}).click();
 assert.equal(await payment.count(),0);
 assert.equal(await page.getByRole('button',{name:'زيادة كمية'}).isDisabled(),true);
 await page.getByRole('button',{name:'زيادة كمية'}).evaluate(button=>button.click());
 releaseVerification();
 await payment.waitFor();assert.match(await payment.innerText(),/39\.50/);
 await page.getByRole('button',{name:'إنقاص كمية سلعة اختبار'}).click();
 await payment.waitFor();assert.match(await payment.innerText(),/22\.00/);
 assert.equal(verifyCount,2);assert.equal(quoteCount,3);
 mode='missing';await page.getByRole('button',{name:'زيادة كمية'}).click();
 await page.getByRole('status').filter({hasText:'مسار الشحن المعتمد غير متاح'}).waitFor();
 assert.equal(await payment.count(),0);assert.equal(await page.getByRole('spinbutton').inputValue(),'1');
 assert.equal(verifyCount,3);assert.equal(quoteCount,3);
 mode='failure';await page.getByRole('button',{name:'زيادة كمية'}).click();
 await page.getByRole('status').filter({hasText:'تعذّر تحديث الكمية الآن'}).waitFor();
 assert.equal(await payment.count(),0);assert.equal(verifyCount,4);
 assert.deepEqual(failures,[]);
 console.log('PASS: 1 → 2 → 1, exact request counts, pending lock, missing route, provider failure; no order or payment calls.');
 console.log('Viewport: 390 × 844. Shared CSS verified; live CJ pricing and production pages are not verified.');
}finally{releaseVerification?.();await browser?.close();await server.close();}
