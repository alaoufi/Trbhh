import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {verifySandboxBrowse} from './sandbox-browse-checks.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base=process.env.PREVIEW_TEST_BASE || 'http://127.0.0.1:4192';
const url=new URL(base);
assert.ok((url.protocol==='http:' && url.hostname==='127.0.0.1' && url.port==='4192') ||
  (url.protocol==='https:' && /^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname) && !url.port));
assert.equal(url.username+url.password+url.search+url.hash,'');
const snapshot=process.env.TRBHH_SNAPSHOT_FILE ? JSON.parse(await readFile(process.env.TRBHH_SNAPSHOT_FILE,'utf8')) : null;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
try {
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await verifySandboxBrowse(page,base,snapshot?.listings.map(ad=>ad.id));
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
