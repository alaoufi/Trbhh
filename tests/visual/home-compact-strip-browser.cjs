const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const out=path.resolve('artifacts/home-compact-strip');
 const css=await require('postcss')([require('tailwindcss')('./tailwind.config.ts')]).process(fs.readFileSync('src/app/globals.css','utf8'),{from:path.resolve('src/app/globals.css')});
 const html=`<!doctype html><html dir="rtl" lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style>${fs.readFileSync(path.join(out,'fixture.html'),'utf8')}</html>`;
 const server=http.createServer((req,res)=>{if(req.url==='/test-image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="208" height="112"><rect width="208" height="112" fill="#16294a"/><circle cx="104" cy="56" r="30" fill="#f0b429"/></svg>');}else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const width of [360,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:650}});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   const region=page.getByRole('region',{name:'لمحة من السوق'});
   assert.equal(await page.locator('a[href^="/ads/"]').count(),6);
   assert.ok(await page.locator('[data-home-compact-strip]').evaluate(e=>e.getBoundingClientRect().right<=innerWidth&&e.getBoundingClientRect().left>=0));
   await region.focus();assert.ok(await region.evaluate(e=>e===document.activeElement));
   await page.screenshot({path:path.join(out,`${width}.png`),fullPage:true});
   await page.getByRole('link',{name:/دراجة رياضية/}).focus();
   assert.ok(await page.getByRole('link',{name:/دراجة رياضية/}).evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   console.log(`PASS ${width}px: RTL, six links, keyboard scrolling to last card, bounded strip`);await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
