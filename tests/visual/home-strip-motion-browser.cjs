const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const source=`import React from 'react';import {createRoot} from 'react-dom/client';import {HomeStripScroller} from '/src/components/home-strip-scroller.tsx';createRoot(document.getElementById('root')).render(<HomeStripScroller title="السوق" autoPlay>{Array.from({length:12},(_,i)=><a href={'#'+i} key={i}>إعلان {i}</a>)}</HomeStripScroller>);`;
 const html=`<!doctype html><html dir="rtl"><meta charset="utf-8"><style>[role=region]{display:flex;overflow-x:auto;gap:8px}a{display:block;flex:0 0 128px;height:80px;background:#16294a;color:white}button{min-height:40px}</style><div id="root"></div><script type="module" src="/motion.tsx"></script></html>`;
 const {createServer}=await import(require('node:url').pathToFileURL(require.resolve('vite',{paths:[require.resolve('vitest/package.json')]})).href);
 const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:0},plugins:[{name:'motion-fixture',resolveId(id){if(id==='/motion.tsx')return id;},load(id){if(id==='/motion.tsx')return source;},configureServer(s){s.middlewares.use((req,res,next)=>{if(req.url!=='/')return next();res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);});}}]});await server.listen();
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const frames=page=>page.evaluate(()=>new Promise(resolve=>{let n=0;function f(){if(++n>=20)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}));
 try{for(const width of [360,390,1440]){
  const page=await browser.newPage({viewport:{width,height:500}});page.on('pageerror',e=>console.error(e.message));await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>Math.abs(document.querySelector('[role=region]')?.scrollLeft||0)>10,{},{timeout:10000});
  await page.getByRole('button',{name:'إيقاف الحركة'}).click();const x=await page.locator('[role=region]').evaluate(e=>e.scrollLeft);await frames(page);assert.equal(await page.locator('[role=region]').evaluate(e=>e.scrollLeft),x);
  await page.getByRole('button',{name:'تشغيل الحركة'}).click();await page.waitForFunction(old=>Math.abs(document.querySelector('[role=region]').scrollLeft-old)>5,x);
  await page.emulateMedia({reducedMotion:'reduce'});await frames(page);const reduced=await page.locator('[role=region]').evaluate(e=>e.scrollLeft);await frames(page);assert.equal(await page.locator('[role=region]').evaluate(e=>e.scrollLeft),reduced);
  assert.equal(await page.locator('a').count(),12);console.log(`PASS ${width}: motion, pause, resume, reduced motion, no cloned links`);await page.close();
 }}finally{await browser.close();await server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
