import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {chromium} from 'playwright';
const require=createRequire(import.meta.url);
const vitestRequire=createRequire(require.resolve('vitest/package.json'));
const {createServer}=await import(pathToFileURL(vitestRequire.resolve('vite')).href);
const root=fileURLToPath(new URL('../../',import.meta.url));
const server=await createServer({root,configFile:false,resolve:{alias:{'@':path.join(root,'src')}},
  define:{'process.env.NODE_ENV':JSON.stringify('development')},
  server:{host:'127.0.0.1',port:0},
  oxc:{jsx:{runtime:'automatic'}},
});
await server.listen();
const address=server.httpServer.address();
const browser=await chromium.launch({channel:process.env.TEST_BROWSER_CHANNEL||'msedge',headless:true});
try{
  for(const width of [390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${address.port}/tests/fixtures/ad-form-browser.html`);
  await page.locator('form').waitFor();
  const draft=()=>page.locator('[name="category_values"]').inputValue().then(JSON.parse);
  assert.deepEqual(await draft(),{});
  await page.locator('#category-field-capacity').fill('10');
  assert.deepEqual(await draft(),{capacity:{min:10,max:''}});
  await page.locator('#category-field-capacity-max').fill('20');
  await page.locator('#category-field-capacity').fill('');
  await page.locator('#category-field-capacity-max').fill('');
  assert.deepEqual(await draft(),{});
  await page.locator('[name="title"]').fill('عنوان يبقى بعد الخطأ');
  await page.locator('[name="detail"]').fill('تفاصيل تبقى بعد الخطأ');
  await page.locator('input[name="images"]').setInputFiles({name:'retained.png',mimeType:'image/png',buffer:Buffer.from('isolated file retention test')});
  // Bypass native validation to exercise the returned server-validation state.
  await page.locator('form').evaluate(form=>{form.noValidate=true;form.requestSubmit()});
  await page.locator('[data-submission-error]').waitFor();
  assert.equal(await page.locator('[name="title"]').inputValue(),'عنوان يبقى بعد الخطأ');
  assert.equal(await page.locator('[name="detail"]').inputValue(),'تفاصيل تبقى بعد الخطأ');
  assert.equal(await page.locator('input[name="images"]').evaluate(input=>input.files[0]?.name),'retained.png');
  assert.equal(await page.locator('#category-field-capacity').getAttribute('aria-invalid'),'true');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'category-field-capacity');
  assert.deepEqual(errors,[]);
  console.log(`PASS browser ${width}px: empty range omitted; clear removes key; validation keeps text/files and focuses invalid field. No database used.`);
  await page.close();
  }
}finally{await browser.close();await server.close()}
