/* Run AD_SPEC_VISUAL=1 vitest fixture first. Local synthetic data only. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const out=path.resolve('artifacts/ad-specifications');
 const css=await require('postcss')([require('tailwindcss')('./tailwind.config.ts')]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
 const html=`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style>${fs.readFileSync(path.join(out,'fixture.html'),'utf8')}</html>`;
 const server=http.createServer((req,res)=>{if(req.url==='/test-image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#16294a"/><path d="M20 80h65v10H20zM40 35h25v45H40z" fill="#f0b429"/></svg>');}else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [360,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:950}});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   assert.equal(await page.locator('a[href="/ads/1"]').count(),1);
   assert.ok((await page.locator('body').innerText()).includes('1–3'));
   assert.ok(!(await page.locator('body').innerText()).includes('[object Object]'));
   assert.ok(await page.evaluate(()=>Array.from(document.querySelectorAll('main *')).every(e=>{const r=e.getBoundingClientRect();return r.right<=innerWidth+1&&r.left>=-1;})),'horizontal overflow');
   await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});
   console.log(`PASS ${width}px: real card/details, RTL, ranges, no horizontal overflow`);await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
