'use strict';
// Capture real controls rendered by category-help-captures.test.tsx, never a live database.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const postcss=require('postcss'),tailwind=require('tailwindcss'),loadConfig=require('tailwindcss/loadConfig');
async function main(){
 const root=path.resolve(__dirname,'../..'),dir=path.join(root,'artifacts/category-help');
 const css=(await postcss([tailwind({...loadConfig(path.join(root,'tailwind.config.ts')),content:[path.join(root,'src/**/*.{ts,tsx}') ]})]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:undefined})).css;
 const keys=['manage','ads','fields','requirements','display','settings'];
 const server=http.createServer((req,res)=>{
  if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(css);return;}
  const key=req.url?.slice(1);
  if(!keys.includes(key)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(dir,key+'.html')));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({headless:true,channel:process.env.HELP_BROWSER_CHANNEL||'chrome'});const page=await browser.newPage({viewport:{width:780,height:900},deviceScaleFactor:1});
  const output=path.join(root,'public/help/categories');fs.mkdirSync(output,{recursive:true});
  for(const key of keys){
   await page.goto(`http://127.0.0.1:${server.address().port}/${key}`);
   await page.locator('main').screenshot({path:path.join(output,key+'.webp'),type:'png'});
   // Playwright captures PNG; encode true WebP via the project's existing sharp dependency.
   const image=await require('sharp')(path.join(output,key+'.webp')).webp({quality:85}).toBuffer();fs.writeFileSync(path.join(output,key+'.webp'),image);
   for(const width of [390,1024]){await page.setViewportSize({width,height:900});if(!(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)))throw new Error(`Overflow: ${key} ${width}`);}
   await page.setViewportSize({width:780,height:900});console.log(`PASS capture ${key}, 390/1024 no overflow`);
  }
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
