/* Isolated actual-component browser tests. No database or production writes. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const root=process.cwd(),out=path.join(root,'artifacts/guide-book');fs.mkdirSync(out,{recursive:true});
 const {build}=await import(pathToFileURL(require.resolve('vite',{paths:[require.resolve('vitest/package.json')]})).href);
 const bundle=await build({root,configFile:false,envDir:false,logLevel:'warn',resolve:{alias:[{find:'@',replacement:path.join(root,'src')}]},define:{process:JSON.stringify({env:{NODE_ENV:'production'}})},oxc:{jsx:{runtime:'automatic'}},build:{write:false,minify:true,lib:{entry:path.join(root,'tests/visual/guide-book-fixture.tsx'),formats:['iife'],name:'GuideFixture'}}});
 const outputs=(Array.isArray(bundle)?bundle:[bundle]).flatMap(b=>b.output),js=outputs.filter(o=>o.type==='chunk').map(o=>o.code).join('\n'),css=outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css')).map(o=>o.source).join('\n');
 const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#16294a;font-family:Tahoma,Arial,sans-serif}h1,h2,h3,p{margin:0}button,input{font:inherit}button,a{cursor:pointer}button{border:0}a{color:inherit;text-decoration:none}#root{max-width:1200px;margin:auto;padding:16px}dialog:not([open]){display:none}${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`;
 const server=http.createServer((req,res)=>{if(req.url==='/fixture.js'){res.setHeader('Content-Type','application/javascript');res.end(js);}else if(req.url==='/help/categories/manage.webp'){res.setHeader('Content-Type','image/webp');res.end(fs.readFileSync(path.join(root,'public/help/categories/manage.webp')));}else if(req.url==='/'||req.url==='/favicon.ico'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);}else{res.statusCode=404;res.end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 let browser;const results=[];
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  for(const width of [390,1024,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser runtime:',e.message);});
   await page.addInitScript(()=>{window.process={env:{NODE_ENV:'production'}};});
   await page.goto(base);await page.locator('[data-enhanced="true"]').waitFor();
   assert.equal(await page.locator('article:visible').count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:path.join(out,`guide-${width}.png`),fullPage:true});
   if(width<900)await page.getByRole('button',{name:'الفهرس والبحث',exact:true}).click();
   const search=page.getByLabel('ابحث داخل الدليل');await search.fill('الاشتراك');assert.equal(await page.locator('nav[aria-label="موضوعات الدليل"] a').count(),1);
   await page.getByRole('link',{name:/الرصيد والباقات/}).click();await page.getByRole('heading',{name:'الرصيد والباقات',exact:true,level:2}).waitFor();
   await page.getByRole('button',{name:'التالي',exact:true}).click();assert.match(page.url(),/#report-contact$/);
   await page.goBack();await page.getByRole('heading',{name:'الرصيد والباقات',exact:true,level:2}).waitFor();
   await page.goto(base+'/#category-admin-hub');await page.getByRole('button',{name:'تكبير: إدارة الأقسام — بيانات تعليمية',exact:true}).click();await page.locator('dialog[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('dialog[open]').count(),0);
   if(width<900)await page.getByRole('button',{name:'الفهرس والبحث',exact:true}).click();
   await search.fill('zzzzzz');await page.getByText('لا توجد نتائج. جرّب كلمة أخرى أو امسح البحث.').waitFor();await page.getByRole('button',{name:'مسح البحث'}).click();assert.equal(await page.locator('nav[aria-label="موضوعات الدليل"] a').count(),3);
   await page.emulateMedia({reducedMotion:'reduce'});await page.getByLabel('حركة تقليب خفيفة').check();assert.equal(await page.locator('article:visible').evaluate(e=>getComputedStyle(e).animationName),'none');assert.deepEqual(errors,[]);
   results.push({width,status:'PASS',checks:['layout','search-content','no-results','navigation','history','hash','image-dialog','reduced-motion','no-runtime-errors']});await page.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
